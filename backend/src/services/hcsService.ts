/**
 * HCS anchoring — never blocks mint. Failures → status pending/failed + retry.
 */

import type { Pool } from "pg";
import { pool as defaultPool } from "../db/pool";
import { env } from "../config/env";
import { hashCanonicalPayload } from "./canonicalHash";
import { getHederaNativeClient, isHederaNativeConfigured, loadHederaSdk } from "./hederaNativeClient";
import { getPlatformImpact, isoWeekKey } from "./impactService";

export type AnchorType = "IMPACT_WEEKLY" | "DECLARATION_PROOF";
export type AnchorStatus = "pending" | "submitted" | "failed";

export type AnchorRow = {
  id: string;
  type: AnchorType;
  ref: string;
  hash: string;
  topic_id: string | null;
  sequence_number: string | null;
  consensus_timestamp: string | null;
  status: AnchorStatus;
  last_error: string | null;
  payload_json: unknown;
  created_at: Date | string;
  updated_at?: Date | string;
};

export type HcsSubmitResult = {
  sequenceNumber: string;
  consensusTimestamp: string | null;
  topicId: string;
};

export type HcsTransport = {
  submitMessage: (topicId: string, message: string) => Promise<HcsSubmitResult>;
  fetchMirrorMessage: (
    topicId: string,
    sequenceNumber: string
  ) => Promise<{ messageJson: unknown } | null>;
};

const defaultTransport: HcsTransport = {
  async submitMessage(topicId, message) {
    if (!isHederaNativeConfigured() || !env.hcsTopicId) {
      throw new Error("HCS non configuré (OPERATOR_ACCOUNT_ID / HCS_TOPIC_ID)");
    }
    const sdk = await loadHederaSdk();
    const client = await getHederaNativeClient();
    const tx = await new sdk.TopicMessageSubmitTransaction()
      .setTopicId(sdk.TopicId.fromString(topicId))
      .setMessage(message)
      .execute(client);
    const receipt = await tx.getReceipt(client);
    const seq = receipt.topicSequenceNumber;
    if (seq === null || seq === undefined) {
      throw new Error("HCS: sequenceNumber manquant dans le receipt");
    }
    let consensusTimestamp: string | null = null;
    try {
      const record = await tx.getRecord(client);
      consensusTimestamp = record.consensusTimestamp?.toString() || null;
    } catch {
      consensusTimestamp = null;
    }
    return {
      sequenceNumber: seq.toString(),
      consensusTimestamp,
      topicId
    };
  },

  async fetchMirrorMessage(topicId, sequenceNumber) {
    const base = env.hederaMirrorNodeUrl.replace(/\/$/, "");
    const url = `${base}/api/v1/topics/${encodeURIComponent(topicId)}/messages/${encodeURIComponent(sequenceNumber)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const body = (await res.json()) as { message?: string };
    if (!body.message) return null;
    const decoded = Buffer.from(body.message, "base64").toString("utf8");
    try {
      return { messageJson: JSON.parse(decoded) };
    } catch {
      return { messageJson: decoded };
    }
  }
};

function buildHcsMessage(params: {
  type: AnchorType;
  hash: string;
  ref: string;
  ts?: number;
}) {
  return {
    v: 1 as const,
    type: params.type,
    hash: params.hash,
    ts: params.ts ?? Math.floor(Date.now() / 1000),
    ref: params.ref
  };
}

export async function insertPendingAnchor(
  params: {
    type: AnchorType;
    ref: string;
    hash: string;
    payload: unknown;
  },
  db: Pool = defaultPool
): Promise<AnchorRow> {
  const r = await db.query(
    `INSERT INTO anchors (type, ref, hash, topic_id, status, payload_json)
     VALUES ($1,$2,$3,$4,'pending',$5)
     RETURNING *`,
    [params.type, params.ref, params.hash, env.hcsTopicId || null, JSON.stringify(params.payload)]
  );
  return r.rows[0] as AnchorRow;
}

/** Submit (or retry) an existing anchor row to HCS. Never throws to callers of fire-and-forget. */
export async function submitAnchorById(
  anchorId: string,
  deps: { pool?: Pool; transport?: HcsTransport } = {}
): Promise<AnchorRow> {
  const db = deps.pool || defaultPool;
  const transport = deps.transport || defaultTransport;

  const loaded = await db.query(`SELECT * FROM anchors WHERE id=$1`, [anchorId]);
  if (!loaded.rowCount) {
    throw Object.assign(new Error("Ancrage introuvable"), { statusCode: 404 });
  }
  const row = loaded.rows[0] as AnchorRow;
  if (row.status === "submitted" && row.sequence_number) {
    return row;
  }

  const topicId = row.topic_id || env.hcsTopicId;
  if (!topicId) {
    await db.query(
      `UPDATE anchors SET status='failed', last_error=$2, updated_at=NOW() WHERE id=$1`,
      [anchorId, "HCS_TOPIC_ID manquant"]
    );
    throw Object.assign(new Error("HCS_TOPIC_ID manquant"), { statusCode: 503 });
  }

  const msg = buildHcsMessage({ type: row.type, hash: row.hash, ref: row.ref });
  try {
    const result = await transport.submitMessage(topicId, JSON.stringify(msg));
    const updated = await db.query(
      `UPDATE anchors
       SET status='submitted',
           topic_id=$2,
           sequence_number=$3,
           consensus_timestamp=$4,
           last_error=NULL,
           updated_at=NOW()
       WHERE id=$1
       RETURNING *`,
      [anchorId, result.topicId, result.sequenceNumber, result.consensusTimestamp]
    );
    return updated.rows[0] as AnchorRow;
  } catch (error: any) {
    const message = String(error?.message || "Échec soumission HCS");
    await db.query(
      `UPDATE anchors SET status='failed', last_error=$2, topic_id=$3, updated_at=NOW() WHERE id=$1`,
      [anchorId, message.slice(0, 500), topicId]
    );
    throw Object.assign(new Error(message), { statusCode: 502 });
  }
}

/**
 * Create pending row + attempt submit. On HCS failure row stays failed — caller mint unaffected.
 */
export async function submitAnchor(
  type: AnchorType,
  payloadHash: string,
  meta: { ref: string; payload: unknown },
  deps: { pool?: Pool; transport?: HcsTransport } = {}
): Promise<AnchorRow> {
  const db = deps.pool || defaultPool;
  const row = await insertPendingAnchor(
    { type, ref: meta.ref, hash: payloadHash, payload: meta.payload },
    db
  );
  try {
    return await submitAnchorById(row.id, deps);
  } catch {
    const failed = await db.query(`SELECT * FROM anchors WHERE id=$1`, [row.id]);
    return failed.rows[0] as AnchorRow;
  }
}

export function buildWeeklyImpactPayload(weekKey: string, impact: Awaited<ReturnType<typeof getPlatformImpact>>) {
  return {
    week: weekKey,
    quantityKg: impact.totals.quantityKg,
    co2Kg: impact.totals.co2Kg,
    approvedDeclarations: impact.totals.approvedDeclarations,
    ecoRewarded: impact.totals.ecoRewarded,
    byMaterial: impact.byMaterial.map((m) => ({
      materialKey: m.materialKey,
      quantityKg: m.quantityKg,
      co2Kg: m.co2Kg,
      declarations: m.declarations
    }))
  };
}

export async function anchorWeeklyImpact(
  deps: { pool?: Pool; transport?: HcsTransport; now?: Date } = {}
): Promise<AnchorRow> {
  const db = deps.pool || defaultPool;
  const now = deps.now || new Date();
  const weekKey = isoWeekKey(now);
  const impact = await getPlatformImpact(db);
  const payload = buildWeeklyImpactPayload(weekKey, impact);
  const hash = hashCanonicalPayload(payload);
  return submitAnchor("IMPACT_WEEKLY", hash, { ref: weekKey, payload }, deps);
}

export type DeclarationProofParts = {
  declarationId: string;
  photoSha256: string | null;
  aiConsistency: string | null;
  txHash: string | null;
  voteIds?: string[];
};

export function buildDeclarationProofPayload(parts: DeclarationProofParts) {
  return {
    declarationId: parts.declarationId,
    photoSha256: parts.photoSha256 || null,
    aiConsistency: parts.aiConsistency || null,
    txHash: parts.txHash || null,
    voteIds: [...(parts.voteIds || [])].sort()
  };
}

/** Fire-and-forget after APPROVED — never throws. */
export async function enqueueDeclarationProof(
  declarationId: string,
  deps: { pool?: Pool; transport?: HcsTransport } = {}
): Promise<void> {
  const db = deps.pool || defaultPool;
  try {
    const r = await db.query(
      `SELECT d.id, d.photo_sha256, d.tx_hash, a.consistency
       FROM declarations d
       LEFT JOIN declaration_ai_analyses a ON a.declaration_id = d.id
       WHERE d.id=$1 AND d.status='APPROVED'`,
      [declarationId]
    );
    if (!r.rowCount) return;

    let voteIds: string[] = [];
    try {
      const votes = await db.query(
        `SELECT id FROM votes WHERE declaration_id=$1 ORDER BY id`,
        [declarationId]
      );
      voteIds = votes.rows.map((v: { id: string }) => v.id);
    } catch {
      /* votes table may not exist yet (before feature C) */
      voteIds = [];
    }

    const parts: DeclarationProofParts = {
      declarationId,
      photoSha256: r.rows[0].photo_sha256,
      aiConsistency: r.rows[0].consistency || null,
      txHash: r.rows[0].tx_hash,
      voteIds
    };
    const payload = buildDeclarationProofPayload(parts);
    const hash = hashCanonicalPayload(payload);
    await submitAnchor("DECLARATION_PROOF", hash, { ref: declarationId, payload }, deps);
  } catch (error) {
    console.warn("[hcs] enqueueDeclarationProof failed (mint intact):", (error as Error)?.message);
  }
}

export async function getLatestAnchor(db: Pool = defaultPool): Promise<AnchorRow | null> {
  const r = await db.query(`SELECT * FROM anchors ORDER BY created_at DESC LIMIT 1`);
  return (r.rows[0] as AnchorRow) || null;
}

export async function getAnchorById(id: string, db: Pool = defaultPool): Promise<AnchorRow | null> {
  const r = await db.query(`SELECT * FROM anchors WHERE id=$1`, [id]);
  return (r.rows[0] as AnchorRow) || null;
}

export type VerifyResult = {
  valid: boolean;
  reason: string;
  storedHash: string;
  messageHash: string | null;
  recomputedHash: string | null;
  anchor: AnchorRow;
};

/**
 * Recalculate payload hash from DB payload_json and compare to HCS mirror message.hash.
 */
export async function verifyAnchor(
  id: string,
  deps: { pool?: Pool; transport?: HcsTransport } = {}
): Promise<VerifyResult> {
  const db = deps.pool || defaultPool;
  const transport = deps.transport || defaultTransport;
  const anchor = await getAnchorById(id, db);
  if (!anchor) {
    throw Object.assign(new Error("Ancrage introuvable"), { statusCode: 404 });
  }

  const recomputedHash = hashCanonicalPayload(anchor.payload_json);
  if (recomputedHash !== anchor.hash) {
    return {
      valid: false,
      reason: "Hash stocké ≠ hash recalculé depuis payload_json (base altérée)",
      storedHash: anchor.hash,
      messageHash: null,
      recomputedHash,
      anchor
    };
  }

  if (anchor.status !== "submitted" || !anchor.topic_id || !anchor.sequence_number) {
    return {
      valid: false,
      reason: "Ancrage non soumis sur HCS",
      storedHash: anchor.hash,
      messageHash: null,
      recomputedHash,
      anchor
    };
  }

  const mirror = await transport.fetchMirrorMessage(anchor.topic_id, String(anchor.sequence_number));
  if (!mirror) {
    return {
      valid: false,
      reason: "Message introuvable sur le mirror node",
      storedHash: anchor.hash,
      messageHash: null,
      recomputedHash,
      anchor
    };
  }

  const msg = mirror.messageJson as { hash?: string };
  const messageHash = typeof msg?.hash === "string" ? msg.hash : null;
  if (!messageHash) {
    return {
      valid: false,
      reason: "Message HCS sans champ hash",
      storedHash: anchor.hash,
      messageHash: null,
      recomputedHash,
      anchor
    };
  }

  const valid = messageHash === anchor.hash && messageHash === recomputedHash;
  return {
    valid,
    reason: valid ? "Hash DB = hash HCS = recalcul" : "Hash HCS ≠ hash stocké",
    storedHash: anchor.hash,
    messageHash,
    recomputedHash,
    anchor
  };
}

export function topicHashScanUrl(topicId: string): string {
  return `https://hashscan.io/testnet/topic/${topicId}`;
}
