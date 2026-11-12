import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { castVote, shouldOpenCommunityReview, type ValidationDeps } from "./validationService";

type Decl = { id: string; user_id: string; status: string };
type Vote = {
  id: string;
  declaration_id: string;
  validator_id: string;
  decision: string;
  comment: string | null;
};

function memoryDb(seed: { declaration: Decl; votes?: Vote[] }) {
  const state = {
    declaration: { ...seed.declaration },
    votes: [...(seed.votes || [])] as Vote[],
    stats: new Map<string, { score: number; votes_cast: number; votes_correct: number }>(),
    mintCalls: 0
  };

  const pool = {
    async query(sql: string, params: unknown[] = []) {
      const q = sql.replace(/\s+/g, " ").trim();

      if (q.startsWith("SELECT id, user_id, status FROM declarations")) {
        if (state.declaration.id === params[0]) {
          return { rowCount: 1, rows: [state.declaration] };
        }
        return { rowCount: 0, rows: [] };
      }

      if (q.startsWith("SELECT COUNT(*)::int AS c FROM votes")) {
        const c = state.votes.filter((v) => v.declaration_id === params[0]).length;
        return { rowCount: 1, rows: [{ c }] };
      }

      if (q.startsWith("INSERT INTO votes")) {
        if (state.votes.some((v) => v.declaration_id === params[0] && v.validator_id === params[1])) {
          const err: any = new Error("duplicate");
          err.code = "23505";
          throw err;
        }
        if (state.votes.filter((v) => v.declaration_id === params[0]).length >= 3) {
          // shouldn't reach if count checked first
        }
        const vote: Vote = {
          id: crypto.randomUUID(),
          declaration_id: params[0] as string,
          validator_id: params[1] as string,
          decision: params[2] as string,
          comment: (params[3] as string) || null
        };
        state.votes.push(vote);
        return { rowCount: 1, rows: [vote] };
      }

      if (q.startsWith("INSERT INTO validator_stats")) {
        const id = params[0] as string;
        if (!state.stats.has(id)) state.stats.set(id, { score: 0, votes_cast: 0, votes_correct: 0 });
        return { rowCount: 1, rows: [] };
      }

      if (q.includes("COUNT(*) FILTER") && q.includes("FROM votes")) {
        const vs = state.votes.filter((v) => v.declaration_id === params[0]);
        return {
          rowCount: 1,
          rows: [
            {
              approves: vs.filter((v) => v.decision === "APPROVE").length,
              rejects: vs.filter((v) => v.decision === "REJECT").length,
              total: vs.length
            }
          ]
        };
      }

      if (q.startsWith("UPDATE declarations") && q.includes("REJECTED")) {
        if (state.declaration.id === params[0] && state.declaration.status === "COMMUNITY_REVIEW") {
          state.declaration.status = "REJECTED";
          return { rowCount: 1, rows: [{ id: state.declaration.id }] };
        }
        return { rowCount: 0, rows: [] };
      }

      if (q.startsWith("SELECT status FROM declarations")) {
        return { rowCount: 1, rows: [{ status: state.declaration.status }] };
      }

      if (q.startsWith("SELECT validator_id, decision FROM votes")) {
        return {
          rowCount: state.votes.length,
          rows: state.votes.filter((v) => v.declaration_id === params[0])
        };
      }

      if (q.startsWith("UPDATE validator_stats")) {
        const st = state.stats.get(params[0] as string) || { score: 0, votes_cast: 0, votes_correct: 0 };
        st.score += Number(params[1]);
        st.votes_cast += 1;
        st.votes_correct += Number(params[2]);
        state.stats.set(params[0] as string, st);
        return { rowCount: 1, rows: [] };
      }

      if (q.includes("FROM votes v") && q.includes("JOIN users")) {
        return {
          rowCount: state.votes.length,
          rows: state.votes.map((v) => ({
            ...v,
            full_name: "V",
            email: "v@test.local",
            created_at: new Date().toISOString()
          }))
        };
      }

      return { rowCount: 0, rows: [] };
    }
  };

  return { state, pool };
}

describe("validationService", () => {
  it("routes uncertain AI to community review", () => {
    assert.equal(shouldOpenCommunityReview("MATCH"), false);
    assert.equal(shouldOpenCommunityReview("MISMATCH"), true);
    assert.equal(shouldOpenCommunityReview("UNCERTAIN"), true);
    assert.equal(shouldOpenCommunityReview("DEGRADED"), true);
  });

  it("rejects self-vote and double vote", async () => {
    const owner = "11111111-1111-1111-1111-111111111111";
    const v1 = "22222222-2222-2222-2222-222222222222";
    const { state, pool } = memoryDb({
      declaration: { id: "d1", user_id: owner, status: "COMMUNITY_REVIEW" }
    });

    await assert.rejects(
      () =>
        castVote(
          { declarationId: "d1", validatorId: owner, decision: "APPROVE" },
          { pool: pool as any }
        ),
      /Auto-vote/
    );

    await castVote(
      { declarationId: "d1", validatorId: v1, decision: "APPROVE" },
      { pool: pool as any, processRewardFn: async () => ({ status: "APPROVED" }) }
    );
    await assert.rejects(
      () =>
        castVote(
          { declarationId: "d1", validatorId: v1, decision: "REJECT" },
          { pool: pool as any }
        ),
      /Double vote/
    );
    assert.equal(state.votes.length, 1);
  });

  it("2 APPROVE triggers a single mint; replay cannot remint", async () => {
    const owner = "11111111-1111-1111-1111-111111111111";
    const v1 = "22222222-2222-2222-2222-222222222222";
    const v2 = "33333333-3333-3333-3333-333333333333";
    const { state, pool } = memoryDb({
      declaration: { id: "d1", user_id: owner, status: "COMMUNITY_REVIEW" }
    });

    let mintCalls = 0;
    const deps: ValidationDeps = {
      pool: pool as any,
      processRewardFn: async () => {
        mintCalls += 1;
        state.declaration.status = "APPROVED";
        return { status: "APPROVED" };
      }
    };

    await castVote({ declarationId: "d1", validatorId: v1, decision: "APPROVE" }, deps);
    assert.equal(mintCalls, 0);
    await castVote({ declarationId: "d1", validatorId: v2, decision: "APPROVE" }, deps);
    assert.equal(mintCalls, 1);

    await assert.rejects(
      () =>
        castVote(
          {
            declarationId: "d1",
            validatorId: "44444444-4444-4444-4444-444444444444",
            decision: "APPROVE"
          },
          deps
        ),
      /non ouverte|COMMUNITY/
    );
    assert.equal(mintCalls, 1);
  });

  it("2 REJECT → REJECTED without mint", async () => {
    const owner = "11111111-1111-1111-1111-111111111111";
    const { state, pool } = memoryDb({
      declaration: { id: "d1", user_id: owner, status: "COMMUNITY_REVIEW" }
    });
    let mintCalls = 0;
    const deps: ValidationDeps = {
      pool: pool as any,
      processRewardFn: async () => {
        mintCalls += 1;
        return {};
      }
    };
    await castVote(
      { declarationId: "d1", validatorId: "22222222-2222-2222-2222-222222222222", decision: "REJECT" },
      deps
    );
    await castVote(
      { declarationId: "d1", validatorId: "33333333-3333-3333-3333-333333333333", decision: "REJECT" },
      deps
    );
    assert.equal(state.declaration.status, "REJECTED");
    assert.equal(mintCalls, 0);
  });
});
