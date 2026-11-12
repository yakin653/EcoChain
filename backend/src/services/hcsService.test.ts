import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashCanonicalPayload } from "./canonicalHash";
import {
  buildDeclarationProofPayload,
  buildWeeklyImpactPayload,
  enqueueDeclarationProof,
  submitAnchor,
  verifyAnchor,
  type AnchorRow,
  type HcsTransport
} from "./hcsService";

type AnchorStore = AnchorRow[];

function memoryPool(store: AnchorStore) {
  return {
    async query(sql: string, params: unknown[] = []) {
      const q = sql.replace(/\s+/g, " ").trim();

      if (q.startsWith("INSERT INTO anchors")) {
        const row: AnchorRow = {
          id: crypto.randomUUID(),
          type: params[0] as AnchorRow["type"],
          ref: params[1] as string,
          hash: params[2] as string,
          topic_id: (params[3] as string) || "0.0.12345",
          sequence_number: null,
          consensus_timestamp: null,
          status: "pending",
          last_error: null,
          payload_json: typeof params[4] === "string" ? JSON.parse(params[4] as string) : params[4],
          created_at: new Date().toISOString()
        };
        store.push(row);
        return { rowCount: 1, rows: [row] };
      }

      if (q.startsWith("SELECT * FROM anchors WHERE id=")) {
        const row = store.find((a) => a.id === params[0]);
        return { rowCount: row ? 1 : 0, rows: row ? [row] : [] };
      }

      if (q.startsWith("UPDATE anchors") && q.includes("status='submitted'")) {
        const row = store.find((a) => a.id === params[0]);
        if (!row) return { rowCount: 0, rows: [] };
        row.topic_id = params[1] as string;
        row.sequence_number = params[2] as string;
        row.consensus_timestamp = params[3] as string | null;
        row.status = "submitted";
        row.last_error = null;
        return { rowCount: 1, rows: [row] };
      }

      if (q.startsWith("UPDATE anchors") && q.includes("status='failed'")) {
        const row = store.find((a) => a.id === params[0]);
        if (!row) return { rowCount: 0, rows: [] };
        row.status = "failed";
        row.last_error = params[1] as string;
        if (params[2]) row.topic_id = params[2] as string;
        return { rowCount: 1, rows: [row] };
      }

      if (q.includes("FROM declarations d") && q.includes("status='APPROVED'")) {
        return {
          rowCount: 1,
          rows: [
            {
              id: params[0],
              photo_sha256: "abc",
              tx_hash: "0xtx",
              consistency: "MATCH"
            }
          ]
        };
      }

      if (q.includes("FROM votes")) {
        return { rowCount: 0, rows: [] };
      }

      return { rowCount: 0, rows: [] };
    }
  };
}

describe("hcsService", () => {
  it("verify returns valid=true when mirror hash matches", async () => {
    const store: AnchorStore = [];
    const payload = { week: "2026-W45", co2Kg: 1.5 };
    const hash = hashCanonicalPayload(payload);
    const messages = new Map<string, { hash: string }>();

    const transport: HcsTransport = {
      async submitMessage(topicId, message) {
        const parsed = JSON.parse(message) as { hash: string };
        messages.set("1", { hash: parsed.hash });
        return { sequenceNumber: "1", consensusTimestamp: "1234.000000000", topicId };
      },
      async fetchMirrorMessage(_topicId, sequenceNumber) {
        const m = messages.get(String(sequenceNumber));
        return m ? { messageJson: { v: 1, type: "IMPACT_WEEKLY", hash: m.hash, ts: 1, ref: "2026-W45" } } : null;
      }
    };

    const pool = memoryPool(store) as any;
    const row = await submitAnchor("IMPACT_WEEKLY", hash, { ref: "2026-W45", payload }, { pool, transport });
    assert.equal(row.status, "submitted");

    const ok = await verifyAnchor(row.id, { pool, transport });
    assert.equal(ok.valid, true);

    // Alter DB payload → recomputed hash diverges
    store[0]!.payload_json = { week: "2026-W45", co2Kg: 999 };
    const bad = await verifyAnchor(row.id, { pool, transport });
    assert.equal(bad.valid, false);
    assert.match(bad.reason, /altérée|≠/i);
  });

  it("HCS submit failure leaves failed anchor and does not throw from enqueue", async () => {
    const store: AnchorStore = [];
    const transport: HcsTransport = {
      async submitMessage() {
        throw new Error("HCS down");
      },
      async fetchMirrorMessage() {
        return null;
      }
    };
    const pool = memoryPool(store) as any;
    const hash = hashCanonicalPayload({ x: 1 });
    const row = await submitAnchor("DECLARATION_PROOF", hash, { ref: "d1", payload: { x: 1 } }, { pool, transport });
    assert.equal(row.status, "failed");

    await enqueueDeclarationProof("11111111-1111-1111-1111-111111111111", { pool, transport });
    // no throw
  });

  it("declaration proof payload is hash-stable and includes sorted voteIds", () => {
    const p1 = buildDeclarationProofPayload({
      declarationId: "d1",
      photoSha256: "aa",
      aiConsistency: "MISMATCH",
      txHash: "0x1",
      voteIds: ["b", "a"]
    });
    const p2 = buildDeclarationProofPayload({
      declarationId: "d1",
      photoSha256: "aa",
      aiConsistency: "MISMATCH",
      txHash: "0x1",
      voteIds: ["a", "b"]
    });
    assert.equal(hashCanonicalPayload(p1), hashCanonicalPayload(p2));
  });

  it("weekly payload builder keeps approved-only aggregates shape", () => {
    const payload = buildWeeklyImpactPayload("2026-W45", {
      scope: "platform",
      totals: {
        quantityKg: 2,
        co2Kg: 3,
        approvedDeclarations: 1,
        ecoRewarded: "24",
        treesEquivalent: 0.14,
        carKmEquivalent: 25
      },
      byMaterial: [
        {
          materialKey: "plastic",
          label: "Plastique",
          quantityKg: 2,
          co2Kg: 3,
          declarations: 1,
          percentOfTotalKg: 100
        }
      ],
      weekly: [],
      monthly: [],
      recent: [],
      methodology: {
        onlyApproved: true,
        co2FactorsKgPerKg: {},
        treesNote: "",
        carNote: ""
      }
    });
    assert.equal(payload.week, "2026-W45");
    assert.equal(payload.approvedDeclarations, 1);
    assert.ok(payload.byMaterial[0]?.materialKey === "plastic");
  });
});
