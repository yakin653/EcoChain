import { Router } from "express";
import { z } from "zod";
import { authenticate, requireRole } from "../middleware/auth";
import {
  castVote,
  listCommunityQueue,
  listValidatorLeaderboard,
  listVotes
} from "../services/validationService";

const router = Router();
router.use(authenticate);

router.get("/queue", requireRole("VALIDATOR"), async (_req, res, next) => {
  try {
    res.json({ queue: await listCommunityQueue() });
  } catch (e) {
    next(e);
  }
});

router.get("/leaderboard", requireRole("VALIDATOR", "ADMIN"), async (_req, res, next) => {
  try {
    res.json({ leaderboard: await listValidatorLeaderboard() });
  } catch (e) {
    next(e);
  }
});

router.get("/:id/votes", requireRole("VALIDATOR", "ADMIN"), async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    res.json({ votes: await listVotes(id) });
  } catch (e) {
    next(e);
  }
});

router.post("/:id/vote", requireRole("VALIDATOR"), async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        decision: z.enum(["APPROVE", "REJECT"]),
        comment: z.string().max(500).optional()
      })
      .parse(req.body);
    const result = await castVote({
      declarationId: id,
      validatorId: req.user!.id,
      decision: body.decision,
      comment: body.comment
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
});

export default router;
