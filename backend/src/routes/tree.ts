import { Router } from "express";
import { z } from "zod";
import { authenticate, requireRole } from "../middleware/auth";
import {
  buildHip412Metadata,
  claimTree,
  demoBoost,
  getTreeBySerial,
  getTreeDashboard,
  initTreeForUser,
  svgForTree
} from "../services/treeService";
import { TREE_LEVELS, type TreeLevel } from "../config/treeLevels";

const router = Router();

const levelSchema = z.enum(["seed", "sprout", "sapling", "tree", "forest"]);

/** Public HIP-412 metadata */
router.get("/metadata/:serial", async (req, res, next) => {
  try {
    const serial = z.string().regex(/^\d+$/).parse(req.params.serial);
    const tree = await getTreeBySerial(serial);
    if (!tree) return res.status(404).json({ message: "Arbre introuvable" });
    res.json(buildHip412Metadata(tree));
  } catch (e) {
    next(e);
  }
});

/** Public SVG — accept /image/123 or /image/123.svg */
router.get("/image/:serial", async (req, res, next) => {
  try {
    const serial = z
      .string()
      .regex(/^\d+/)
      .parse(String(req.params.serial).replace(/\.svg$/i, ""));
    const tree = await getTreeBySerial(serial);
    if (!tree) return res.status(404).type("text/plain").send("Not found");
    res.type("image/svg+xml").send(svgForTree(tree));
  } catch (e) {
    next(e);
  }
});

router.use(authenticate);

router.get("/me", requireRole("USER"), async (req, res, next) => {
  try {
    const data = await getTreeDashboard(req.user!.id);
    res.json(data);
  } catch (e) {
    next(e);
  }
});

router.post("/me/init", requireRole("USER"), async (req, res, next) => {
  try {
    const tree = await initTreeForUser(req.user!.id);
    const data = await getTreeDashboard(req.user!.id);
    res.status(201).json({ tree: data.tree, raw: tree, levels: TREE_LEVELS });
  } catch (e) {
    next(e);
  }
});

router.post("/me/claim", requireRole("USER"), async (req, res, next) => {
  try {
    const body = z.object({ hederaAccountId: z.string().min(3).max(40) }).parse(req.body);
    const tree = await claimTree(req.user!.id, body.hederaAccountId);
    res.json({ tree, message: "NFT transféré vers votre compte Hedera" });
  } catch (e) {
    next(e);
  }
});

/** ADMIN demo boost for soutenance — blocked when NODE_ENV=production */
router.post("/demo/boost", requireRole("ADMIN"), async (req, res, next) => {
  try {
    const body = z
      .object({
        userId: z.string().uuid(),
        level: levelSchema
      })
      .parse(req.body);
    const tree = await demoBoost(body.userId, body.level as TreeLevel);
    res.json({ tree, message: `Niveau simulé → ${body.level}` });
  } catch (e) {
    next(e);
  }
});

export default router;
