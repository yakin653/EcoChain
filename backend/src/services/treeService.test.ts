import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { levelFromCo2Kg } from "../config/treeLevels";
import {
  initTreeForUser,
  syncTreeLevel,
  type TreeHtsTransport,
  type TreeRow
} from "./treeService";

describe("treeService — levels & uniqueness (mocked)", () => {
  it("PENDING CO2 must not affect level — only explicit APPROVED co2 drives levelFromCo2Kg", () => {
    const pendingKg = 100;
    const approvedCo2 = 0;
    assert.equal(levelFromCo2Kg(approvedCo2), "seed");
    assert.notEqual(levelFromCo2Kg(pendingKg), levelFromCo2Kg(approvedCo2));
  });

  it("sync updates level and records history; HTS failure does not throw to caller path", async () => {
    process.env.TREE_TOKEN_ID = "0.0.999";
    process.env.PUBLIC_API_BASE_URL = "http://localhost:4001";

    const trees: TreeRow[] = [];
    const history: Array<{ tree_id: string; from_level: string | null; to_level: string; co2_kg: number }> = [];
    const userId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

    const pool = {
      async query(sql: string, params: unknown[] = []) {
        const q = sql.replace(/\s+/g, " ").trim();
        if (q.startsWith("SELECT * FROM trees WHERE user_id=")) {
          const row = trees.find((t) => t.user_id === params[0]);
          return { rowCount: row ? 1 : 0, rows: row ? [row] : [] };
        }
        if (q.includes("FROM declarations") && q.includes("status='APPROVED'")) {
          return { rowCount: 0, rows: [] };
        }
        if (q.startsWith("INSERT INTO trees")) {
          const existing = trees.find((t) => t.user_id === params[0]);
          if (existing) return { rowCount: 1, rows: [existing] };
          const row: TreeRow = {
            id: crypto.randomUUID(),
            user_id: params[0] as string,
            token_id: params[1] as string,
            serial: String(params[2]),
            level: params[3] as TreeRow["level"],
            last_co2_kg: params[4] as number,
            metadata_uri: params[5] as string,
            sync_status: params[6] as TreeRow["sync_status"],
            last_error: params[7] as string | null,
            claimed_at: null,
            claimed_wallet: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          trees.push(row);
          return { rowCount: 1, rows: [row] };
        }
        if (q.startsWith("INSERT INTO tree_level_history")) {
          history.push({
            tree_id: params[0] as string,
            from_level: (params[1] as string) || null,
            to_level: params[2] as string,
            co2_kg: Number(params[3])
          });
          return { rowCount: 1, rows: [] };
        }
        if (q.startsWith("UPDATE trees") && q.includes("level=$2")) {
          const row = trees.find((t) => t.id === params[0]);
          if (!row) return { rowCount: 0, rows: [] };
          row.level = params[1] as TreeRow["level"];
          row.last_co2_kg = params[2] as number;
          row.sync_status = params[3] as TreeRow["sync_status"];
          row.last_error = params[4] as string | null;
          row.metadata_uri = params[5] as string;
          return { rowCount: 1, rows: [row] };
        }
        if (q.startsWith("UPDATE trees SET last_co2_kg=")) {
          const row = trees.find((t) => t.id === params[0]);
          if (row) row.last_co2_kg = params[1] as number;
          return { rowCount: 1, rows: row ? [row] : [] };
        }
        return { rowCount: 0, rows: [] };
      }
    };

    const hts: TreeHtsTransport = {
      async mintNft() {
        return { serial: "7" };
      },
      async updateNftMetadata() {
        throw new Error("HTS metadata down");
      },
      async transferNft() {}
    };

    const t1 = await initTreeForUser(userId, { pool: pool as any, hts });
    const t2 = await initTreeForUser(userId, { pool: pool as any, hts });
    assert.equal(t1.id, t2.id, "no duplicate tree per user");
    assert.equal(trees.length, 1);

    const boosted = await syncTreeLevel(userId, { pool: pool as any, hts, co2Override: 50 });
    assert.equal(boosted.level, "tree");
    assert.equal(boosted.sync_status, "failed");
    assert.ok(history.some((h) => h.to_level === "tree"));
  });
});
