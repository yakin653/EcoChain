import {
  Contract,
  Interface,
  JsonRpcProvider,
  Wallet,
  getAddress,
  isAddress,
  type Log,
  type TransactionReceipt
} from "ethers";
import { env } from "../config/env";
import { assertChainReadyForMint, getChainReadiness, isOperatorKeyConfigured } from "./chainReadiness";

const registryAbi = [
  "function reward(bytes32 declarationId,address beneficiary,uint256 amount) external",
  "function isProcessed(bytes32 declarationId) view returns (bool)",
  "event Rewarded(bytes32 indexed declarationId,address indexed beneficiary,uint256 amount)"
];
const tokenAbi = ["function balanceOf(address account) view returns (uint256)"];
const registryIface = new Interface(registryAbi);

/** Hashio rejects eth_getLogs spans > 7 days — stay under that window. */
const LOG_LOOKBACK_BLOCKS = 200_000;

export type RewardedProof = {
  txHash: string;
  beneficiary: string;
  amount: bigint;
  declarationId: string;
};

export { getChainReadiness, isOperatorKeyConfigured };

function getProvider() {
  return new JsonRpcProvider(env.rpcUrl, env.chainId);
}

function proofFromRewardedLog(
  log: Log,
  expectedDeclarationId?: string
): RewardedProof | null {
  try {
    const parsed = registryIface.parseLog({ topics: log.topics as string[], data: log.data });
    if (!parsed || parsed.name !== "Rewarded") return null;
    const declarationId = String(parsed.args.declarationId);
    if (
      expectedDeclarationId &&
      declarationId.toLowerCase() !== expectedDeclarationId.toLowerCase()
    ) {
      return null;
    }
    return {
      declarationId,
      txHash: log.transactionHash,
      beneficiary: getAddress(String(parsed.args.beneficiary)),
      amount: BigInt(parsed.args.amount.toString())
    };
  } catch {
    return null;
  }
}

function getSigner() {
  assertChainReadyForMint();
  if (!isOperatorKeyConfigured()) {
    throw Object.assign(new Error("BACKEND_OPERATOR_PRIVATE_KEY is not configured"), { statusCode: 503 });
  }
  return new Wallet(env.operatorKey.trim(), getProvider());
}

function getRegistry(signerOrProvider?: Wallet | JsonRpcProvider) {
  const readiness = getChainReadiness();
  if (!readiness.registryConfigured) {
    throw Object.assign(new Error("REGISTRY_CONTRACT_ADDRESS is invalid"), { statusCode: 503 });
  }
  const runner = signerOrProvider ?? getSigner();
  return new Contract(env.registryAddress, registryAbi, runner);
}

/** Normalize and validate an EVM address; throws if invalid. */
export function requireValidWallet(wallet: string): string {
  if (!wallet || !isAddress(wallet)) {
    throw Object.assign(new Error("Adresse wallet invalide"), { statusCode: 400 });
  }
  return getAddress(wallet);
}

export async function submitReward(declarationId: string, wallet: string, amount: bigint) {
  assertChainReadyForMint();
  const beneficiary = requireValidWallet(wallet);
  const registry = getRegistry();
  const tx = await registry.reward(declarationId, beneficiary, amount);
  // Persist tx.hash immediately in the caller. Wait is separate so a timeout
  // does not erase the fact that a transaction was broadcast.
  return { txHash: tx.hash as string, wait: () => tx.wait(env.confirmations, env.txTimeoutMs) };
}

export async function isDeclarationProcessed(declarationId: string): Promise<boolean> {
  if (!getChainReadiness().registryConfigured) {
    throw Object.assign(new Error("REGISTRY_CONTRACT_ADDRESS is invalid"), { statusCode: 503 });
  }
  return Boolean(await getRegistry(getProvider()).isProcessed(declarationId));
}

export async function getRewardReceipt(txHash: string) {
  return getProvider().getTransactionReceipt(txHash);
}

/**
 * Parse Rewarded from a known transaction receipt (preferred on Hedera/Hashio).
 * Read-only — never mints.
 */
export async function findRewardedProofInReceipt(
  txHash: string,
  declarationId?: string
): Promise<RewardedProof | null> {
  const receipt: TransactionReceipt | null = await getRewardReceipt(txHash);
  if (!receipt || receipt.status !== 1) return null;
  const registryAddr = env.registryAddress.toLowerCase();
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== registryAddr) continue;
    const proof = proofFromRewardedLog(log as Log, declarationId);
    if (proof) return proof;
  }
  return null;
}

/**
 * Look up the on-chain Rewarded event for a declaration key.
 * Uses a bounded block window (Hashio max ~7 days). Prefer findRewardedProofInReceipt when txHash is known.
 * Read-only — never mints / never submits a transaction.
 */
export async function findRewardedProof(declarationId: string): Promise<RewardedProof | null> {
  const provider = getProvider();
  const registry = getRegistry(provider);
  const latest = await provider.getBlockNumber();
  const fromBlock = Math.max(0, latest - LOG_LOOKBACK_BLOCKS);
  const filter = registry.filters.Rewarded(declarationId);
  const events = await registry.queryFilter(filter, fromBlock, latest);
  if (!events.length) return null;
  const last = events[events.length - 1]!;
  return proofFromRewardedLog(last as Log, declarationId);
}

export async function findRewardedTxHash(declarationId: string): Promise<string | null> {
  const proof = await findRewardedProof(declarationId);
  return proof?.txHash ?? null;
}

export async function readEcoBalance(wallet: string): Promise<string> {
  const account = requireValidWallet(wallet);
  if (!getChainReadiness().tokenConfigured) {
    throw Object.assign(new Error("TOKEN_CONTRACT_ADDRESS is invalid"), { statusCode: 503 });
  }
  const token = new Contract(env.tokenAddress, tokenAbi, getProvider());
  return (await token.balanceOf(account)).toString();
}
