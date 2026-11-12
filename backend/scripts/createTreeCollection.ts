/**
 * Create EcoTree NFT collection on Hedera Testnet (HTS).
 * Usage: npx tsx backend/scripts/createTreeCollection.ts
 */
import dotenv from "dotenv";
import path from "path";
import {
  AccountId,
  Client,
  PrivateKey,
  TokenCreateTransaction,
  TokenSupplyType,
  TokenType
} from "@hashgraph/sdk";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "backend/.env") });

async function main() {
  const accountId = process.env.OPERATOR_ACCOUNT_ID;
  const keyHex = process.env.BACKEND_OPERATOR_PRIVATE_KEY;
  if (!accountId || !keyHex || !/^0x[0-9a-fA-F]{64}$/.test(keyHex)) {
    console.error("Set OPERATOR_ACCOUNT_ID and BACKEND_OPERATOR_PRIVATE_KEY in .env");
    process.exit(1);
  }

  const client = Client.forTestnet();
  const key = PrivateKey.fromStringECDSA(keyHex.replace(/^0x/, ""));
  const operator = AccountId.fromString(accountId);
  client.setOperator(operator, key);

  const tx = await new TokenCreateTransaction()
    .setTokenName("EcoTree")
    .setTokenSymbol("ETREE")
    .setTokenType(TokenType.NonFungibleUnique)
    .setDecimals(0)
    .setInitialSupply(0)
    .setTreasuryAccountId(operator)
    .setSupplyType(TokenSupplyType.Infinite)
    .setSupplyKey(key.publicKey)
    .setMetadataKey(key.publicKey)
    .setAdminKey(key.publicKey)
    .setTokenMemo("EcoChain virtual tree NFT")
    .execute(client);

  const receipt = await tx.getReceipt(client);
  const tokenId = receipt.tokenId?.toString();
  if (!tokenId) {
    console.error("Token create failed");
    process.exit(1);
  }

  console.log("EcoTree NFT collection created.");
  console.log(`Add to .env:\nTREE_TOKEN_ID=${tokenId}`);
  console.log(`HashScan: https://hashscan.io/testnet/token/${tokenId}`);
  client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
