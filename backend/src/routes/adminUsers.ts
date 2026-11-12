import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { authenticate, requireRole } from "../middleware/auth";

const router = Router();
router.use(authenticate);
router.use(requireRole("ADMIN"));

/** Promote/demote USER ↔ VALIDATOR only (never touch ADMIN here). */
router.post("/users/:id/role", async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const body = z.object({ role: z.enum(["USER", "VALIDATOR"]) }).parse(req.body);

    const target = await pool.query(`SELECT id, role FROM users WHERE id=$1`, [id]);
    if (!target.rowCount) return res.status(404).json({ message: "Utilisateur introuvable" });
    if (target.rows[0].role === "ADMIN") {
      return res.status(403).json({ message: "Impossible de modifier un ADMIN via cet endpoint" });
    }

    const updated = await pool.query(
      `UPDATE users SET role=$2 WHERE id=$1 AND role IN ('USER','VALIDATOR')
       RETURNING id, full_name, email, role, wallet_address`,
      [id, body.role]
    );
    if (updated.rowCount !== 1) {
      return res.status(409).json({ message: "Transition de rôle refusée" });
    }
    res.json({ user: updated.rows[0] });
  } catch (e) {
    next(e);
  }
});

router.get("/users", async (_req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT id, full_name, email, role, wallet_address, created_at
       FROM users ORDER BY created_at DESC LIMIT 200`
    );
    res.json({ users: r.rows });
  } catch (e) {
    next(e);
  }
});

export default router;
