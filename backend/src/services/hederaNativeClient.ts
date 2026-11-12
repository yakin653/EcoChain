/**
 * Shared Hedera native (non-EVM) client for HCS / HTS via @hashgraph/sdk.
 * Lazy-loaded to keep unit tests light (SDK is large).
 */

import { env } from "../config/env";

type HederaSdk = typeof import("@hashgraph/sdk");
type Client = import("@hashgraph/sdk").Client;
type PrivateKey = import("@hashgraph/sdk").PrivateKey;

let cachedClient: Client | null = null;
let sdkPromise: Promise<HederaSdk> | null = null;

export function isHederaNativeConfigured(): boolean {
  return Boolean(env.operatorAccountId && env.operatorKey && /^0x[0-9a-fA-F]{64}$/.test(env.operatorKey));
}

export async function loadHederaSdk(): Promise<HederaSdk> {
  if (!sdkPromise) {
    sdkPromise = import("@hashgraph/sdk");
  }
  return sdkPromise;
}

export async function getHederaNativeClient(): Promise<Client> {
  if (cachedClient) return cachedClient;
  if (!env.operatorAccountId) {
    throw Object.assign(new Error("OPERATOR_ACCOUNT_ID manquant pour HCS/HTS"), { statusCode: 503 });
  }
  if (!env.operatorKey || !/^0x[0-9a-fA-F]{64}$/.test(env.operatorKey)) {
    throw Object.assign(new Error("BACKEND_OPERATOR_PRIVATE_KEY invalide pour HCS/HTS"), { statusCode: 503 });
  }
  const sdk = await loadHederaSdk();
  const client = sdk.Client.forTestnet();
  const accountId = sdk.AccountId.fromString(env.operatorAccountId);
  const key = sdk.PrivateKey.fromStringECDSA(env.operatorKey.replace(/^0x/, ""));
  client.setOperator(accountId, key);
  cachedClient = client;
  return client;
}

export async function getOperatorPrivateKey(): Promise<PrivateKey> {
  if (!env.operatorKey || !/^0x[0-9a-fA-F]{64}$/.test(env.operatorKey)) {
    throw Object.assign(new Error("BACKEND_OPERATOR_PRIVATE_KEY invalide"), { statusCode: 503 });
  }
  const sdk = await loadHederaSdk();
  return sdk.PrivateKey.fromStringECDSA(env.operatorKey.replace(/^0x/, ""));
}
