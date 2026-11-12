import dotenv from "dotenv";
dotenv.config();

const required = ["DATABASE_URL", "JWT_SECRET"] as const;
for (const key of required) if (!process.env[key]) throw new Error(`Missing environment variable: ${key}`);

export const env = {
  port: Number(process.env.PORT || 4001),
  databaseUrl: process.env.DATABASE_URL!,
  jwtSecret: process.env.JWT_SECRET!,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1d",
  frontendOrigin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
  rpcUrl: process.env.HEDERA_RPC_URL || "https://testnet.hashio.io/api",
  chainId: Number(process.env.HEDERA_CHAIN_ID || 296),
  operatorKey: process.env.BACKEND_OPERATOR_PRIVATE_KEY || "",
  registryAddress: process.env.REGISTRY_CONTRACT_ADDRESS || "",
  tokenAddress: process.env.TOKEN_CONTRACT_ADDRESS || "",
  confirmations: Number(process.env.TX_CONFIRMATIONS || 1),
  txTimeoutMs: Number(process.env.TX_WAIT_TIMEOUT_MS || 120000),
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.0-flash",
  rewardMaxEcoPerDeclaration: process.env.REWARD_MAX_ECO_PER_DECLARATION || "1000",
  rewardMinQuantityMillis: process.env.REWARD_MIN_QUANTITY_MILLIS || "100",
  rewardRatesJson: process.env.REWARD_RATES_JSON || "",
  reconcileOnStartup: (process.env.RECONCILE_ON_STARTUP || "true").toLowerCase() !== "false",
  /** Local Trash Classifier V2 service (no paid API). */
  aiServiceUrl: (process.env.AI_SERVICE_URL || "http://127.0.0.1:5001").replace(/\/$/, ""),
  aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS || 60000),
  aiMaxUploadBytes: Number(process.env.AI_MAX_UPLOAD_BYTES || 5 * 1024 * 1024),
  uploadsDir: process.env.UPLOADS_DIR || "",
  /** Hedera native account id (0.0.x) for HCS / HTS */
  operatorAccountId: process.env.OPERATOR_ACCOUNT_ID || "",
  hcsTopicId: process.env.HCS_TOPIC_ID || "",
  hederaMirrorNodeUrl: process.env.HEDERA_MIRROR_NODE_URL || "https://testnet.mirrornode.hedera.com",
  treeTokenId: process.env.TREE_TOKEN_ID || "",
  /** Public base URL used in NFT metadata pointers */
  publicApiBaseUrl: (process.env.PUBLIC_API_BASE_URL || `http://localhost:${process.env.PORT || 4001}`).replace(
    /\/$/,
    ""
  )
};
