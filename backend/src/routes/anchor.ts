import { Router } from "express";
import { z } from "zod";
import { authenticate, requireRole } from "../middleware/auth";
import {
  anchorWeeklyImpact,
  getAnchorById,
  getLatestAnchor,
  submitAnchorById,
  topicHashScanUrl,
  verifyAnchor
} from "../services/hcsService";
import { env } from "../config/env";

const router = Router();
router.use(authenticate);

function present(row: NonNullable<Awaited<ReturnType<typeof getAnchorById>>>) {
  return {
    id: row.id,
    type: row.type,
    ref: row.ref,
    hash: row.hash,
    topicId: row.topic_id,
    sequenceNumber: row.sequence_number,
    consensusTimestamp: row.consensus_timestamp,
    status: row.status,
    lastError: row.last_error,
    createdAt: row.created_at,
    hashScanUrl: row.topic_id ? topicHashScanUrl(row.topic_id) : null,
    configuredTopicId: env.hcsTopicId || null
  };
}

/** ADMIN — anchor this week's platform ECO IMPACT (APPROVED only). */
router.post("/impact", requireRole("ADMIN"), async (_req, res, next) => {
  try {
    const row = await anchorWeeklyImpact();
    res.status(row.status === "submitted" ? 201 : 202).json({
      anchor: present(row),
      message:
        row.status === "submitted"
          ? "Rapport hebdomadaire ancré sur HCS"
          : "Ancrage enregistré (soumission HCS en échec ou en attente — mint intact)"
    });
  } catch (e) {
    next(e);
  }
});

router.get("/latest", async (_req, res, next) => {
  try {
    const row = await getLatestAnchor();
    res.json({
      anchor: row ? present(row) : null,
      configuredTopicId: env.hcsTopicId || null,
      hashScanTopicUrl: env.hcsTopicId ? topicHashScanUrl(env.hcsTopicId) : null
    });
  } catch (e) {
    next(e);
  }
});

router.get("/verify/:id", async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const result = await verifyAnchor(id);
    res.json({
      valid: result.valid,
      reason: result.reason,
      storedHash: result.storedHash,
      messageHash: result.messageHash,
      recomputedHash: result.recomputedHash,
      anchor: present(result.anchor)
    });
  } catch (e) {
    next(e);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const row = await getAnchorById(id);
    if (!row) return res.status(404).json({ message: "Ancrage introuvable" });
    res.json({ anchor: present(row) });
  } catch (e) {
    next(e);
  }
});

router.post("/:id/retry", requireRole("ADMIN"), async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const row = await submitAnchorById(id);
    res.json({ anchor: present(row) });
  } catch (e) {
    next(e);
  }
});

export default router;
