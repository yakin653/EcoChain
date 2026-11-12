import { Router } from "express";
import { authenticate, requireRole } from "../middleware/auth";
import { getPlatformImpact, getUserImpact } from "../services/impactService";

const router = Router();
router.use(authenticate);

/** Personal environmental impact — APPROVED declarations only. */
router.get("/me", requireRole("USER"), async (req, res, next) => {
  try {
    const data = await getUserImpact(req.user!.id);
    res.json(data);
  } catch (e) {
    next(e);
  }
});

/** Platform-wide impact for admins. */
router.get("/admin", requireRole("ADMIN"), async (_req, res, next) => {
  try {
    const data = await getPlatformImpact();
    res.json(data);
  } catch (e) {
    next(e);
  }
});

export default router;
