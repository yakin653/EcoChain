/**
 * EcoTree NFT — mint/update never blocks ECO mint.
 */

import type { Pool } from "pg";
import { pool as defaultPool } from "../db/pool";
import { env } from "../config/env";
import { levelFromCo2Kg, nextLevelInfo, type TreeLevel } from "../config/treeLevels";
import { getUserImpact } from "./impactService";
import {
  getHederaNativeClient,
  getOperatorPrivateKey,
  isHederaNativeConfigured,
  loadHederaSdk
} from "./hederaNativeClient";
import { renderTreeSvg } from "./treeSvg";

export type TreeRow = {
  id: string;
  user_id: string;
  token_id: string;
  serial: string;
  level: TreeLevel;
  last_co2_kg: string | number;
  metadata_uri: string | null;
  sync_status: "ok" | "pending" | "failed";
  last_error: string | null;
  claimed_at: Date | string | null;
  claimed_wallet: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export type TreeHtsTransport = {
  mintNft: (tokenId: string, metadata: Uint8Array) => Promise<{ serial: string }>;
  updateNftMetadata: (tokenId: string, serial: number, metadata: Uint8Array) => Promise<void>;
  transferNft: (tokenId: string, serial: number, toAccountId: string) => Promise<void>;
};

const defaultHts: TreeHtsTransport = {
  async mintNft(tokenId, metadata) {
    const sdk = await loadHederaSdk();
    const client = await getHederaNativeClient();
    const tx = await new sdk.TokenMintTransaction()
      .setTokenId(sdk.TokenId.fromString(tokenId))
      .setMetadata([metadata])
      .execute(client);
    const receipt = await tx.getReceipt(client);
    const serial = receipt.serials[0];
    if (serial === undefined || serial === null) throw new Error("Mint NFT: serial manquant");
    return { serial: serial.toString() };
  },

  async updateNftMetadata(tokenId, serial, metadata) {
    const sdk = await loadHederaSdk();
    const client = await getHederaNativeClient();
    const key = await getOperatorPrivateKey();
    await (
      await new sdk.TokenUpdateNftsTransaction()
        .setTokenId(sdk.TokenId.fromString(tokenId))
        .setSerialNumbers([serial])
        .setMetadata(metadata)
        .freezeWith(client)
        .sign(key)
    ).execute(client);
  },

  async transferNft(tokenId, serial, toAccountId) {
    const sdk = await loadHederaSdk();
    const client = await getHederaNativeClient();
    const treasury = sdk.AccountId.fromString(env.operatorAccountId);
    const to = sdk.AccountId.fromString(toAccountId);
    await new sdk.TransferTransaction()
      .addNftTransfer(sdk.TokenId.fromString(tokenId), serial, treasury, to)
      .execute(client);
  }
};

function treeTokenId(): string {
  return process.env.TREE_TOKEN_ID || env.treeTokenId || "";
}

function publicApiBase(): string {
  return (process.env.PUBLIC_API_BASE_URL || env.publicApiBaseUrl || "http://localhost:4001").replace(/\/$/, "");
}

function metadataBytes(serial: number | string, level: TreeLevel): Uint8Array {
  // HIP-412 pointer kept ≤ 100 bytes
  const path = `/api/tree/metadata/${serial}`;
  const pointer = `${publicApiBase()}${path}?l=${level}`.slice(0, 100);
  return Buffer.from(pointer, "utf8");
}

export function hashScanNftUrl(tokenId: string, serial: string | number): string {
  return `https://hashscan.io/testnet/token/${tokenId}/${serial}`;
}

export async function getTreeByUser(userId: string, db: Pool = defaultPool): Promise<TreeRow | null> {
  const r = await db.query(`SELECT * FROM trees WHERE user_id=$1`, [userId]);
  return (r.rows[0] as TreeRow) || null;
}

export async function getTreeBySerial(serial: string | number, db: Pool = defaultPool): Promise<TreeRow | null> {
  const r = await db.query(`SELECT * FROM trees WHERE serial=$1 LIMIT 1`, [String(serial)]);
  return (r.rows[0] as TreeRow) || null;
}

/**
 * Ensure one tree per user. Mint NFT if TREE_TOKEN_ID configured; otherwise pending local row.
 */
export async function initTreeForUser(
  userId: string,
  deps: { pool?: Pool; hts?: TreeHtsTransport } = {}
): Promise<TreeRow> {
  const db = deps.pool || defaultPool;
  const hts = deps.hts || defaultHts;

  const existing = await getTreeByUser(userId, db);
  if (existing) return existing;

  const tokenId = treeTokenId();
  if (!tokenId) {
    throw Object.assign(new Error("TREE_TOKEN_ID non configuré"), { statusCode: 503 });
  }

  const impact = await getUserImpact(userId, db);
  const co2 = impact.totals.co2Kg;
  const level = levelFromCo2Kg(co2);

  // Provisional serial placeholder until mint returns
  let serial = "0";
  let sync: TreeRow["sync_status"] = "pending";
  let lastError: string | null = null;

  try {
    // In unit tests, injectable hts runs even without live operator keys.
    if (!deps.hts && !isHederaNativeConfigured()) throw new Error("Opérateur Hedera native non configuré");
    const minted = await hts.mintNft(tokenId, metadataBytes("pending", level));
    serial = minted.serial;
    // Update metadata with real serial pointer
    try {
      await hts.updateNftMetadata(tokenId, Number(serial), metadataBytes(serial, level));
      sync = "ok";
    } catch (e: any) {
      sync = "failed";
      lastError = String(e?.message || "metadata update failed").slice(0, 500);
    }
  } catch (e: any) {
    // Allocate a local serial via time to keep UNIQUE without chain
    serial = String(Date.now() % 1_000_000_000);
    sync = "failed";
    lastError = String(e?.message || "mint failed").slice(0, 500);
  }

  try {
    const inserted = await db.query(
      `INSERT INTO trees (user_id, token_id, serial, level, last_co2_kg, metadata_uri, sync_status, last_error)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (user_id) DO UPDATE SET updated_at=NOW()
       RETURNING *`,
      [
        userId,
        tokenId,
        serial,
        level,
        co2,
        `${publicApiBase()}/api/tree/metadata/${serial}`,
        sync,
        lastError
      ]
    );
    const tree = inserted.rows[0] as TreeRow;
    await db.query(
      `INSERT INTO tree_level_history (tree_id, from_level, to_level, co2_kg) VALUES ($1,NULL,$2,$3)`,
      [tree.id, level, co2]
    );
    return tree;
  } catch (e: any) {
    // Race: another init won
    const again = await getTreeByUser(userId, db);
    if (again) return again;
    throw e;
  }
}

export async function syncTreeLevel(
  userId: string,
  deps: { pool?: Pool; hts?: TreeHtsTransport; co2Override?: number } = {}
): Promise<TreeRow> {
  const db = deps.pool || defaultPool;
  const hts = deps.hts || defaultHts;

  let tree = await getTreeByUser(userId, db);
  if (!tree) {
    tree = await initTreeForUser(userId, deps);
  }

  const co2 =
    deps.co2Override !== undefined ? deps.co2Override : (await getUserImpact(userId, db)).totals.co2Kg;
  const newLevel = levelFromCo2Kg(co2);
  const oldLevel = tree.level as TreeLevel;

  if (newLevel === oldLevel && Number(tree.last_co2_kg) === co2 && tree.sync_status === "ok") {
    await db.query(`UPDATE trees SET last_co2_kg=$2, updated_at=NOW() WHERE id=$1`, [tree.id, co2]);
    return (await getTreeByUser(userId, db))!;
  }

  let sync: TreeRow["sync_status"] = tree.sync_status;
  let lastError = tree.last_error;

  if (newLevel !== oldLevel) {
    try {
      await hts.updateNftMetadata(tree.token_id, Number(tree.serial), metadataBytes(tree.serial, newLevel));
      sync = "ok";
      lastError = null;
    } catch (e: any) {
      sync = "failed";
      lastError = String(e?.message || "NFT metadata update failed").slice(0, 500);
    }
    await db.query(
      `INSERT INTO tree_level_history (tree_id, from_level, to_level, co2_kg) VALUES ($1,$2,$3,$4)`,
      [tree.id, oldLevel, newLevel, co2]
    );
  }

  const updated = await db.query(
    `UPDATE trees
     SET level=$2, last_co2_kg=$3, sync_status=$4, last_error=$5,
         metadata_uri=$6, updated_at=NOW()
     WHERE id=$1
     RETURNING *`,
    [
      tree.id,
      newLevel,
      co2,
      sync,
      lastError,
      `${publicApiBase()}/api/tree/metadata/${tree.serial}`
    ]
  );
  return updated.rows[0] as TreeRow;
}

/** Fire-and-forget after APPROVED. */
export async function onDeclarationApproved(
  userId: string,
  deps: { pool?: Pool; hts?: TreeHtsTransport } = {}
): Promise<void> {
  try {
    await syncTreeLevel(userId, deps);
  } catch (e: any) {
    console.warn("[tree] onDeclarationApproved (mint intact):", e?.message || e);
  }
}

export async function getTreeDashboard(userId: string, db: Pool = defaultPool) {
  const tree = await getTreeByUser(userId, db);
  const impact = await getUserImpact(userId, db);
  const co2 = tree ? Number(tree.last_co2_kg) : impact.totals.co2Kg;
  const progress = nextLevelInfo(co2);
  let history: Array<{ from_level: string | null; to_level: string; co2_kg: string; created_at: string }> = [];
  if (tree) {
    const h = await db.query(
      `SELECT from_level, to_level, co2_kg::text, created_at FROM tree_level_history
       WHERE tree_id=$1 ORDER BY created_at DESC LIMIT 20`,
      [tree.id]
    );
    history = h.rows;
  }
  return {
    tree: tree
      ? {
          id: tree.id,
          tokenId: tree.token_id,
          serial: String(tree.serial),
          level: tree.level,
          lastCo2Kg: Number(tree.last_co2_kg),
          syncStatus: tree.sync_status,
          lastError: tree.last_error,
          claimedAt: tree.claimed_at,
          claimedWallet: tree.claimed_wallet,
          hashScanUrl: hashScanNftUrl(tree.token_id, tree.serial),
          metadataUrl: `${publicApiBase()}/api/tree/metadata/${tree.serial}`,
          imageUrl: `${publicApiBase()}/api/tree/image/${tree.serial}.svg`
        }
      : null,
    progress,
    history,
    configured: Boolean(treeTokenId())
  };
}

export function buildHip412Metadata(tree: TreeRow) {
  const level = tree.level as TreeLevel;
  return {
    name: `EcoTree #${tree.serial}`,
    description: `Arbre virtuel EcoChain — niveau ${level}. CO₂ cumulé (APPROVED) : ${tree.last_co2_kg} kg.`,
    image: `${publicApiBase()}/api/tree/image/${tree.serial}.svg`,
    type: "image/svg+xml",
    format: "HIP412",
    attributes: [
      { trait_type: "level", value: level },
      { trait_type: "co2_kg", value: Number(tree.last_co2_kg) },
      { trait_type: "serial", value: Number(tree.serial) }
    ]
  };
}

export function svgForTree(tree: TreeRow): string {
  return renderTreeSvg(tree.level as TreeLevel, tree.serial);
}

/**
 * Optional claim: transfer NFT to user's Hedera account id if provided.
 * Requires users to store a Hedera account separately — we use env mapping via wallet note.
 * Simplest safe path: require `hederaAccountId` in body and user wallet associated.
 */
export async function claimTree(
  userId: string,
  hederaAccountId: string,
  deps: { pool?: Pool; hts?: TreeHtsTransport } = {}
) {
  const db = deps.pool || defaultPool;
  const hts = deps.hts || defaultHts;
  const tree = await getTreeByUser(userId, db);
  if (!tree) throw Object.assign(new Error("Arbre introuvable — init d'abord"), { statusCode: 404 });
  if (tree.claimed_at) throw Object.assign(new Error("Arbre déjà récupéré"), { statusCode: 409 });

  const user = await db.query(`SELECT wallet_address FROM users WHERE id=$1`, [userId]);
  if (!user.rows[0]?.wallet_address) {
    throw Object.assign(new Error("Associez d'abord un wallet MetaMask"), { statusCode: 400 });
  }

  try {
    const sdk = await loadHederaSdk();
    sdk.AccountId.fromString(hederaAccountId);
  } catch {
    throw Object.assign(new Error("Account ID Hedera invalide (ex: 0.0.x)"), { statusCode: 400 });
  }

  try {
    await hts.transferNft(tree.token_id, Number(tree.serial), hederaAccountId);
    const updated = await db.query(
      `UPDATE trees SET claimed_at=NOW(), claimed_wallet=$2, sync_status='ok', last_error=NULL, updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [tree.id, hederaAccountId]
    );
    return updated.rows[0] as TreeRow;
  } catch (e: any) {
    await db.query(
      `UPDATE trees SET sync_status='failed', last_error=$2, updated_at=NOW() WHERE id=$1`,
      [tree.id, String(e?.message || "transfer failed").slice(0, 500)]
    );
    throw Object.assign(new Error(String(e?.message || "Transfert NFT échoué")), { statusCode: 502 });
  }
}

/** Demo boost — disabled in production. */
export async function demoBoost(
  userId: string,
  targetLevel: TreeLevel,
  deps: { pool?: Pool; hts?: TreeHtsTransport } = {}
) {
  if (process.env.NODE_ENV === "production") {
    throw Object.assign(new Error("demoBoost désactivé en production"), { statusCode: 403 });
  }
  const thresholds: Record<TreeLevel, number> = {
    seed: 0,
    sprout: 1,
    sapling: 10,
    tree: 50,
    forest: 200
  };
  return syncTreeLevel(userId, { ...deps, co2Override: thresholds[targetLevel] });
}
