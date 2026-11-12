import { Router } from "express";
import { randomUUID } from "crypto";
import { mkdirSync } from "fs";
import { writeFile } from "fs/promises";
import path from "path";
import multer from "multer";
import { z } from "zod";
import { pool } from "../db/pool";
import { env } from "../config/env";
import { authenticate, requireRole } from "../middleware/auth";
import { requireValidWallet } from "../services/blockchainService";
import { declarationKey } from "../services/declarationKey";
import { computeRewardWei, quantityInputToString, weiToEcoString } from "../services/rewardPolicy";
import { processReward, reconcileProcessing } from "../services/rewardService";
import {
  analyzeWastePhoto,
  assertSafeImageBuffer,
  sha256Buffer,
  type AiAnalysisResult
} from "../services/aiWasteService";
import { sendToCommunity, shouldOpenCommunityReview } from "../services/validationService";

const router = Router();
router.use(authenticate);

const uploadsRoot = env.uploadsDir
  ? path.resolve(env.uploadsDir)
  : path.resolve(process.cwd(), "uploads", "declarations");
mkdirSync(uploadsRoot, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.aiMaxUploadBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype === "image/jpeg" || file.mimetype === "image/png";
    if (!ok) {
      cb(new Error("Seuls JPEG et PNG sont acceptés"));
      return;
    }
    cb(null, true);
  }
});

const createSchema = z.object({
  material: z.string().min(2).max(80),
  quantity: z.union([z.string(), z.number()]),
  description: z.string().max(2000).optional(),
  walletAddress: z.string().optional()
  // reward amount is NEVER accepted from the client
});

async function persistAiAnalysis(declarationId: string, analysis: AiAnalysisResult) {
  await pool.query(
    `INSERT INTO declaration_ai_analyses (
       declaration_id, model_name, detected_material, declared_material_key,
       confidence, consistency, admin_review_required, explanation,
       all_scores_json, detected_objects_json, image_sha256, image_format, raw_response_json
     ) VALUES ($1,$2,$3,$4,$5,$6,TRUE,$7,$8::jsonb,$9::jsonb,$10,$11,$12::jsonb)
     ON CONFLICT (declaration_id) DO UPDATE SET
       model_name = EXCLUDED.model_name,
       detected_material = EXCLUDED.detected_material,
       declared_material_key = EXCLUDED.declared_material_key,
       confidence = EXCLUDED.confidence,
       consistency = EXCLUDED.consistency,
       explanation = EXCLUDED.explanation,
       all_scores_json = EXCLUDED.all_scores_json,
       detected_objects_json = EXCLUDED.detected_objects_json,
       image_sha256 = EXCLUDED.image_sha256,
       image_format = EXCLUDED.image_format,
       raw_response_json = EXCLUDED.raw_response_json,
       created_at = NOW()`,
    [
      declarationId,
      analysis.model || "trash_classifier_v2",
      analysis.detected_material,
      analysis.declared_material_key,
      analysis.confidence,
      analysis.consistency,
      analysis.explanation,
      JSON.stringify(analysis.all_scores || {}),
      JSON.stringify(analysis.detected_objects || []),
      analysis.image_sha256,
      analysis.image_format,
      JSON.stringify(analysis)
    ]
  );
}

router.post("/", requireRole("USER"), (req, res, next) => {
  upload.single("photo")(req, res, (err) => {
    if (err) {
      return res.status(400).json({ message: err.message || "Upload invalide" });
    }
    void (async () => {
      try {
        const body = {
          material: req.body.material,
          quantity: req.body.quantity,
          description: req.body.description || undefined,
          walletAddress: req.body.walletAddress || undefined
        };
        const input = createSchema.parse(body);
        const quantityStr = quantityInputToString(input.quantity);
        const estimated = computeRewardWei(input.material, quantityStr);

        const userRow = await pool.query(`SELECT wallet_address FROM users WHERE id=$1`, [req.user!.id]);
        const profileWallet = userRow.rows[0]?.wallet_address as string | null;
        const wallet = input.walletAddress
          ? requireValidWallet(input.walletAddress)
          : profileWallet
            ? requireValidWallet(profileWallet)
            : null;

        const uuid = randomUUID();
        const key = declarationKey(uuid);

        let photoPath: string | null = null;
        let photoSha: string | null = null;
        let aiAnalysis: AiAnalysisResult | null = null;

        if (req.file?.buffer?.length) {
          const format = assertSafeImageBuffer(req.file.buffer);
          photoSha = sha256Buffer(req.file.buffer);
          const filename = `${uuid}.${format === "jpeg" ? "jpg" : "png"}`;
          const abs = path.join(uploadsRoot, filename);
          await writeFile(abs, req.file.buffer);
          photoPath = filename;

          // Assistive AI — never mints. Uncertain results open COMMUNITY_REVIEW (not auto-approve).
          aiAnalysis = await analyzeWastePhoto(req.file.buffer, input.material, filename);
        }

        const initialStatus = shouldOpenCommunityReview(aiAnalysis?.consistency)
          ? "COMMUNITY_REVIEW"
          : "PENDING";

        const result = await pool.query(
          `INSERT INTO declarations(
             id, user_id, material, quantity, description, wallet_address, declaration_key,
             estimated_reward_amount, reward_amount, photo_path, photo_sha256, status
           ) VALUES ($1,$2,$3,$4::numeric,$5,$6,$7,$8,NULL,$9,$10,$11::declaration_status)
           RETURNING *`,
          [
            uuid,
            req.user!.id,
            input.material,
            quantityStr,
            input.description || null,
            wallet,
            key,
            estimated.rewardWei.toString(),
            photoPath,
            photoSha,
            initialStatus
          ]
        );

        if (aiAnalysis) {
          await persistAiAnalysis(uuid, aiAnalysis);
        }

        const row = result.rows[0];
        res.status(201).json({
          ...row,
          estimated_reward_eco: weiToEcoString(estimated.rewardWei),
          material_key: estimated.materialKey,
          rate_eco_per_kg: estimated.rateEcoPerKg,
          ai_analysis: aiAnalysis,
          note:
            "estimated_reward_amount est informatif; reward_amount définitif à la validation. L'IA n'approuve jamais et ne mint jamais. MISMATCH/UNCERTAIN/DEGRADED → COMMUNITY_REVIEW."
        });
      } catch (e) {
        next(e);
      }
    })();
  });
});

router.get("/mine", requireRole("USER"), async (req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT d.*,
              a.detected_material AS ai_detected_material,
              a.confidence AS ai_confidence,
              a.consistency AS ai_consistency,
              a.explanation AS ai_explanation,
              a.admin_review_required AS ai_admin_review_required
       FROM declarations d
       LEFT JOIN declaration_ai_analyses a ON a.declaration_id = d.id
       WHERE d.user_id=$1
       ORDER BY d.created_at DESC`,
      [req.user!.id]
    );
    res.json(r.rows);
  } catch (e) {
    next(e);
  }
});

router.get("/admin/list", requireRole("ADMIN"), async (req, res, next) => {
  try {
    const status = String(req.query.status || "PENDING");
    const r = await pool.query(
      `SELECT d.*, u.full_name, u.email, u.wallet_address AS user_wallet_address,
              a.id AS ai_analysis_id,
              a.model_name AS ai_model,
              a.detected_material AS ai_detected_material,
              a.declared_material_key AS ai_declared_material_key,
              a.confidence AS ai_confidence,
              a.consistency AS ai_consistency,
              a.explanation AS ai_explanation,
              a.admin_review_required AS ai_admin_review_required,
              a.all_scores_json AS ai_all_scores,
              a.detected_objects_json AS ai_detected_objects,
              a.image_sha256 AS ai_image_sha256,
              a.created_at AS ai_analyzed_at
       FROM declarations d
       JOIN users u ON u.id = d.user_id
       LEFT JOIN declaration_ai_analyses a ON a.declaration_id = d.id
       WHERE d.status=$1
       ORDER BY d.created_at`,
      [status]
    );
    res.json(r.rows);
  } catch (e) {
    next(e);
  }
});

/** Stream declaration photo to ADMIN / VALIDATOR only (never public). */
router.get("/admin/:id/photo", requireRole("ADMIN", "VALIDATOR"), async (req, res, next) => {
  try {
    const r = await pool.query(`SELECT photo_path FROM declarations WHERE id=$1`, [String(req.params.id)]);
    const photoPath = r.rows[0]?.photo_path as string | null;
    if (!photoPath) return res.status(404).json({ message: "Aucune photo pour cette déclaration" });
    const abs = path.join(uploadsRoot, path.basename(photoPath));
    if (!abs.startsWith(uploadsRoot)) {
      return res.status(400).json({ message: "Chemin photo invalide" });
    }
    return res.sendFile(abs, (err) => {
      if (err) next(err);
    });
  } catch (e) {
    next(e);
  }
});

router.post("/admin/:id/reject", requireRole("ADMIN"), async (req, res, next) => {
  try {
    const r = await pool.query(
      `UPDATE declarations SET status='REJECTED', updated_at=NOW()
       WHERE id=$1 AND status IN ('PENDING','COMMUNITY_REVIEW') RETURNING *`,
      [String(req.params.id)]
    );
    if (!r.rowCount) {
      return res.status(409).json({
        message: "Seules les déclarations PENDING ou COMMUNITY_REVIEW peuvent être refusées"
      });
    }
    res.json(r.rows[0]);
  } catch (e) {
    next(e);
  }
});

router.post("/admin/:id/send-to-community", requireRole("ADMIN"), async (req, res, next) => {
  try {
    res.json({ declaration: await sendToCommunity(String(req.params.id)) });
  } catch (e) {
    next(e);
  }
});

const validateSchema = z.object({
  amountEco: z.string().optional(),
  justification: z.string().min(5).max(2000).optional()
});

router.post("/admin/:id/validate", requireRole("ADMIN"), async (req, res, next) => {
  try {
    const declarationId = String(req.params.id);
    const body = validateSchema.parse(req.body ?? {});
    if (body.amountEco !== undefined && !body.justification) {
      return res.status(400).json({ message: "Justification obligatoire pour un override de montant" });
    }
    const cur = await pool.query(`SELECT status FROM declarations WHERE id=$1`, [declarationId]);
    if (!cur.rowCount) return res.status(404).json({ message: "Déclaration introuvable" });
    const status = cur.rows[0].status as string;
    if (status !== "PENDING" && status !== "COMMUNITY_REVIEW") {
      return res.status(409).json({ message: `Validation refusée depuis le statut ${status}` });
    }
    // Same mint path (triple proof). Admin may bypass community queue.
    res.json(
      await processReward(declarationId, false, {
        amountEco: body.amountEco,
        justification: body.justification,
        adminUserId: req.user!.id,
        fromStatus: status as "PENDING" | "COMMUNITY_REVIEW"
      })
    );
  } catch (e: any) {
    res.status(e.statusCode || 502).json({ message: e.message });
  }
});

router.post("/admin/:id/retry", requireRole("ADMIN"), async (req, res, next) => {
  try {
    res.json(await processReward(String(req.params.id), true));
  } catch (e: any) {
    res.status(e.statusCode || 502).json({ message: e.message });
  }
});

router.post("/admin/:id/reconcile", requireRole("ADMIN"), async (req, res, next) => {
  try {
    res.json(await reconcileProcessing(String(req.params.id)));
  } catch (e: any) {
    res.status(e.statusCode || 502).json({ message: e.message });
  }
});

export default router;
