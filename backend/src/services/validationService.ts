/**
 * Community validation — 2 of 3 votes. Never mints directly; calls processReward.
 */

import type { Pool } from "pg";
import { pool as defaultPool } from "../db/pool";
import { processReward, type ProcessRewardOptions, type RewardDeps } from "./rewardService";

export type VoteDecision = "APPROVE" | "REJECT";

const MAX_VOTES = 3;
const QUORUM = 2;

export type ValidationDeps = {
  pool?: Pool;
  processRewardFn?: (
    declarationId: string,
    retry?: boolean,
    options?: ProcessRewardOptions & { fromStatus?: "PENDING" | "COMMUNITY_REVIEW" },
    deps?: RewardDeps
  ) => Promise<unknown>;
};

async function ensureValidatorStats(db: Pool, userId: string) {
  await db.query(
    `INSERT INTO validator_stats (user_id, score, votes_cast, votes_correct)
     VALUES ($1, 0, 0, 0)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
}

export async function listCommunityQueue(db: Pool = defaultPool) {
  const r = await db.query(
    `SELECT d.*, u.full_name, u.email,
            a.consistency AS ai_consistency,
            a.detected_material AS ai_detected_material,
            a.explanation AS ai_explanation,
            a.confidence AS ai_confidence,
            (SELECT COUNT(*)::int FROM votes v WHERE v.declaration_id = d.id) AS vote_count,
            (SELECT COUNT(*)::int FROM votes v WHERE v.declaration_id = d.id AND v.decision='APPROVE') AS approve_count,
            (SELECT COUNT(*)::int FROM votes v WHERE v.declaration_id = d.id AND v.decision='REJECT') AS reject_count
     FROM declarations d
     JOIN users u ON u.id = d.user_id
     LEFT JOIN declaration_ai_analyses a ON a.declaration_id = d.id
     WHERE d.status = 'COMMUNITY_REVIEW'
     ORDER BY d.created_at ASC`
  );
  return r.rows;
}

export async function listVotes(declarationId: string, db: Pool = defaultPool) {
  const r = await db.query(
    `SELECT v.id, v.declaration_id, v.validator_id, v.decision, v.comment, v.created_at,
            u.full_name, u.email
     FROM votes v
     JOIN users u ON u.id = v.validator_id
     WHERE v.declaration_id = $1
     ORDER BY v.created_at ASC`,
    [declarationId]
  );
  return r.rows;
}

export async function listValidatorLeaderboard(db: Pool = defaultPool, limit = 20) {
  const r = await db.query(
    `SELECT s.user_id, s.score, s.votes_cast, s.votes_correct, s.updated_at,
            u.full_name, u.email
     FROM validator_stats s
     JOIN users u ON u.id = s.user_id
     ORDER BY s.score DESC, s.votes_correct DESC
     LIMIT $1`,
    [limit]
  );
  return r.rows;
}

async function applyReputation(db: Pool, declarationId: string, finalOutcome: "APPROVED" | "REJECTED") {
  const votes = await db.query(
    `SELECT validator_id, decision FROM votes WHERE declaration_id=$1`,
    [declarationId]
  );
  for (const v of votes.rows) {
    const correct =
      (finalOutcome === "APPROVED" && v.decision === "APPROVE") ||
      (finalOutcome === "REJECTED" && v.decision === "REJECT");
    await ensureValidatorStats(db, v.validator_id);
    await db.query(
      `UPDATE validator_stats
       SET score = score + $2,
           votes_cast = votes_cast + 1,
           votes_correct = votes_correct + $3,
           updated_at = NOW()
       WHERE user_id = $1`,
      [v.validator_id, correct ? 1 : -1, correct ? 1 : 0]
    );
  }
}

/**
 * Cast a vote. On 2 APPROVE → processReward from COMMUNITY_REVIEW (idempotent via claim).
 * On 2 REJECT → REJECTED.
 */
export async function castVote(
  params: {
    declarationId: string;
    validatorId: string;
    decision: VoteDecision;
    comment?: string;
  },
  deps: ValidationDeps = {}
) {
  const db = deps.pool || defaultPool;
  const mint = deps.processRewardFn || processReward;

  const decl = await db.query(`SELECT id, user_id, status FROM declarations WHERE id=$1`, [
    params.declarationId
  ]);
  if (!decl.rowCount) {
    throw Object.assign(new Error("Déclaration introuvable"), { statusCode: 404 });
  }
  const row = decl.rows[0];
  if (row.status !== "COMMUNITY_REVIEW") {
    throw Object.assign(new Error("Déclaration non ouverte à la validation communautaire"), {
      statusCode: 409
    });
  }
  if (row.user_id === params.validatorId) {
    throw Object.assign(new Error("Auto-vote interdit"), { statusCode: 403 });
  }

  const existingCount = await db.query(
    `SELECT COUNT(*)::int AS c FROM votes WHERE declaration_id=$1`,
    [params.declarationId]
  );
  if (Number(existingCount.rows[0].c) >= MAX_VOTES) {
    throw Object.assign(new Error("Maximum 3 votes atteint"), { statusCode: 409 });
  }

  try {
    await db.query(
      `INSERT INTO votes (declaration_id, validator_id, decision, comment)
       VALUES ($1,$2,$3,$4)`,
      [params.declarationId, params.validatorId, params.decision, params.comment || null]
    );
  } catch (e: any) {
    if (String(e?.code) === "23505") {
      throw Object.assign(new Error("Double vote refusé"), { statusCode: 409 });
    }
    throw e;
  }

  await ensureValidatorStats(db, params.validatorId);

  const tallies = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE decision='APPROVE')::int AS approves,
       COUNT(*) FILTER (WHERE decision='REJECT')::int AS rejects,
       COUNT(*)::int AS total
     FROM votes WHERE declaration_id=$1`,
    [params.declarationId]
  );
  const approves = Number(tallies.rows[0].approves);
  const rejects = Number(tallies.rows[0].rejects);

  let outcome: "PENDING_VOTES" | "APPROVED_PATH" | "REJECTED" = "PENDING_VOTES";
  let mintResult: unknown = null;

  if (rejects >= QUORUM) {
    const updated = await db.query(
      `UPDATE declarations
       SET status='REJECTED', last_error='Rejeté par validation communautaire (2/3)', updated_at=NOW()
       WHERE id=$1 AND status='COMMUNITY_REVIEW'
       RETURNING id`,
      [params.declarationId]
    );
    if (updated.rowCount === 1) {
      await applyReputation(db, params.declarationId, "REJECTED");
      outcome = "REJECTED";
    }
  } else if (approves >= QUORUM) {
    // Single mint path — processReward claims COMMUNITY_REVIEW → PROCESSING atomically
    mintResult = await mint(params.declarationId, false, { fromStatus: "COMMUNITY_REVIEW" });
    outcome = "APPROVED_PATH";
    // Reputation when finally APPROVED is applied after mint success if status APPROVED
    const check = await db.query(`SELECT status FROM declarations WHERE id=$1`, [params.declarationId]);
    if (check.rows[0]?.status === "APPROVED") {
      await applyReputation(db, params.declarationId, "APPROVED");
    }
  }

  return {
    outcome,
    approves,
    rejects,
    mintResult,
    votes: await listVotes(params.declarationId, db)
  };
}

export async function sendToCommunity(declarationId: string, db: Pool = defaultPool) {
  const r = await db.query(
    `UPDATE declarations
     SET status='COMMUNITY_REVIEW', updated_at=NOW()
     WHERE id=$1 AND status IN ('PENDING', 'FAILED')
     RETURNING *`,
    [declarationId]
  );
  if (r.rowCount !== 1) {
    throw Object.assign(new Error("Seules PENDING/FAILED peuvent aller en COMMUNITY_REVIEW"), {
      statusCode: 409
    });
  }
  return r.rows[0];
}

export function shouldOpenCommunityReview(aiConsistency: string | null | undefined): boolean {
  return aiConsistency === "MISMATCH" || aiConsistency === "UNCERTAIN" || aiConsistency === "DEGRADED";
}
