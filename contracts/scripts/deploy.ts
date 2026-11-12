/**
 * Deploy EcoToken + RecyclingRegistry on Hedera Testnet (or any Hardhat network).
 * After setMinter, optionally writes addresses into ../backend/.env
 * (DEPLOY_WRITE_ENV=false to skip). Never prints private keys.
 *
 * Usage: npm run deploy:testnet -w contracts
 */
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

function upsertEnv(filePath: string, updates: Record<string, string>): void {
  let text = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  if (!text.endsWith("\n") && text.length > 0) text += "\n";
  for (const [key, value] of Object.entries(updates)) {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, "m");
    if (re.test(text)) text = text.replace(re, line);
    else text += `${line}\n`;
  }
  fs.writeFileSync(filePath, text, "utf8");
}

async function main() {
  const [operator] = await ethers.getSigners();
  if (!operator) throw new Error("No deployer account configured (BACKEND_OPERATOR_PRIVATE_KEY)");

  const balance = await ethers.provider.getBalance(operator.address);
  if (balance === 0n) {
    throw new Error(
      `Operator ${operator.address} has 0 HBAR — fund via https://portal.hedera.com/faucet then retry`
    );
  }

  console.log("DEPLOYER=", operator.address);
  console.log("BALANCE_WEI=", balance.toString());

  const Token = await ethers.getContractFactory("EcoToken");
  const token = await Token.deploy(operator.address);
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log("TOKEN_CONTRACT_ADDRESS=", tokenAddress);

  // Cap aligned with backend REWARD_MAX_ECO_PER_DECLARATION (1000 ECO, 18 decimals).
  const maxRewardWei = ethers.parseEther(process.env.ONCHAIN_MAX_REWARD_ECO || "1000");
  const Registry = await ethers.getContractFactory("RecyclingRegistry");
  const registry = await Registry.deploy(tokenAddress, operator.address, maxRewardWei);
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log("REGISTRY_CONTRACT_ADDRESS=", registryAddress);
  console.log("MAX_REWARD_WEI=", maxRewardWei.toString());

  // Irreversible one-shot: registry becomes the only minter.
  const currentMinter = await token.minter();
  if (currentMinter === ethers.ZeroAddress) {
    console.log("Configuring minter → registry (one-shot, irreversible)...");
    console.log("  token=", tokenAddress);
    console.log("  registry=", registryAddress);
    const setup = await token.setMinter(registryAddress);
    const receipt = await setup.wait();
    if (!receipt || receipt.status !== 1) {
      throw new Error("setMinter transaction failed or missing receipt");
    }
  } else if (currentMinter.toLowerCase() !== registryAddress.toLowerCase()) {
    throw new Error(
      `Token minter already set to ${currentMinter}, cannot point to new registry ${registryAddress}`
    );
  } else {
    console.log("Minter already equals registry — skipping setMinter");
  }

  const finalMinter = await token.minter();
  const registryOwner = await registry.owner();
  console.log("TOKEN_MINTER (must equal registry)=", finalMinter);
  console.log("REGISTRY_OWNER (must equal deployer)=", registryOwner);

  if (finalMinter.toLowerCase() !== registryAddress.toLowerCase()) {
    throw new Error("Post-deploy check failed: token.minter() !== registry");
  }
  if (registryOwner.toLowerCase() !== operator.address.toLowerCase()) {
    throw new Error("Post-deploy check failed: registry.owner() !== deployer");
  }

  const writeEnv = process.env.DEPLOY_WRITE_ENV !== "false";
  if (writeEnv) {
    const envPath = path.resolve(__dirname, "../../backend/.env");
    upsertEnv(envPath, {
      TOKEN_CONTRACT_ADDRESS: tokenAddress,
      REGISTRY_CONTRACT_ADDRESS: registryAddress,
      OPERATOR_EVM_ADDRESS: operator.address,
      HEDERA_RPC_URL: process.env.HEDERA_RPC_URL || "https://testnet.hashio.io/api",
      HEDERA_CHAIN_ID: String(process.env.HEDERA_CHAIN_ID || 296)
    });
    console.log("Updated backend/.env with TOKEN_CONTRACT_ADDRESS + REGISTRY_CONTRACT_ADDRESS");
  }

  console.log("\nDeploy OK — restart backend and check GET /api/health → chain.readyForMint");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
