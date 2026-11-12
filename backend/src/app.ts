import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env";
import authRoutes from "./routes/auth";
import declarationRoutes from "./routes/declarations";
import rewardRoutes from "./routes/rewards";
import assistantRoutes from "./routes/assistant";
import challengeRoutes from "./routes/challenges";
import impactRoutes from "./routes/impact";
import anchorRoutes from "./routes/anchor";
import treeRoutes from "./routes/tree";
import validationRoutes from "./routes/validation";
import adminUsersRoutes from "./routes/adminUsers";
import { getChainReadiness } from "./services/chainReadiness";
import { probeAiHealth } from "./services/aiWasteService";
import { errorHandler, notFound } from "./middleware/errors";
import { isHederaNativeConfigured } from "./services/hederaNativeClient";
const app = express();
app.use(helmet());
app.use(cors({ origin: env.frontendOrigin }));
app.use(express.json({ limit: "1mb" }));
app.get("/api/health", async (_req, res) => {
  const chain = getChainReadiness();
  const ai = await probeAiHealth();
  res.json({
    status: "ok",
    chainId: env.chainId,
    chain: {
      readyForMint: chain.readyForMint,
      operatorKeyConfigured: chain.operatorKeyConfigured,
      registryConfigured: chain.registryConfigured,
      tokenConfigured: chain.tokenConfigured,
      blockers: chain.blockers
    },
    hcs: {
      configured: Boolean(env.hcsTopicId) && isHederaNativeConfigured(),
      topicId: env.hcsTopicId || null
    },
    tree: {
      configured: Boolean(env.treeTokenId) && isHederaNativeConfigured(),
      tokenId: env.treeTokenId || null
    },
    ai: {
      serviceUrl: env.aiServiceUrl,
      reachable: ai.reachable,
      modelReady: ai.modelReady,
      assistiveOnly: true,
      neverApproves: true,
      neverMints: true,
      detail: ai.detail
    }
  });
});
app.use("/api/auth", authRoutes);
app.use("/api/declarations", declarationRoutes);
app.use("/api/rewards", rewardRoutes);
app.use("/api/assistant", assistantRoutes);
app.use("/api/challenges", challengeRoutes);
app.use("/api/impact", impactRoutes);
app.use("/api/anchor", anchorRoutes);
app.use("/api/tree", treeRoutes);
app.use("/api/validation", validationRoutes);
app.use("/api/admin", adminUsersRoutes);
app.use(notFound);
app.use(errorHandler);
export default app;
