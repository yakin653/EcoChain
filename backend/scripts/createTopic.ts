/**
 * Create an HCS topic on Hedera Testnet (296) and print HCS_TOPIC_ID.
 *
 * Usage (from monorepo root, with .env loaded):
 *   npx tsx backend/scripts/createTopic.ts
 */
import dotenv from "dotenv";
import path from "path";
import {
  AccountId,
  Client,
  PrivateKey,
  TopicCreateTransaction
} from "@hashgraph/sdk";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "backend/.env") });

async function main() {
  const accountId = process.env.OPERATOR_ACCOUNT_ID;
  const keyHex = process.env.BACKEND_OPERATOR_PRIVATE_KEY;
  if (!accountId || !keyHex || !/^0x[0-9a-fA-F]{64}$/.test(keyHex)) {
    console.error("Set OPERATOR_ACCOUNT_ID and BACKEND_OPERATOR_PRIVATE_KEY (0x + 64 hex) in .env");
    process.exit(1);
  }

  const client = Client.forTestnet();
  const key = PrivateKey.fromStringECDSA(keyHex.replace(/^0x/, ""));
  client.setOperator(AccountId.fromString(accountId), key);

  const tx = await new TopicCreateTransaction()
    .setTopicMemo("EcoChain IMPACT anchors (HCS)")
    .setAdminKey(key.publicKey)
    .setSubmitKey(key.publicKey)
    .execute(client);
  const receipt = await tx.getReceipt(client);
  const topicId = receipt.topicId?.toString();
  if (!topicId) {
    console.error("Topic create failed — no topicId in receipt");
    process.exit(1);
  }

  console.log("HCS topic created on Testnet.");
  console.log(`Add to .env:\nHCS_TOPIC_ID=${topicId}`);
  console.log(`HashScan: https://hashscan.io/testnet/topic/${topicId}`);
  client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
