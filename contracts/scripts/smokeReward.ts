/**
 * On-chain smoke test after deploy: reward once, check balance, reject double pay.
 * Uses Hardhat signer = BACKEND_OPERATOR_PRIVATE_KEY from backend/.env.
 * Never prints private keys.
 *
 * Usage (after deploy): npx hardhat run scripts/smokeReward.ts --network hederaTestnet
 */
import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config({ path: "../backend/.env" });

async function main() {
  const registryAddr = (process.env.REGISTRY_CONTRACT_ADDRESS || "").trim();
  const tokenAddr = (process.env.TOKEN_CONTRACT_ADDRESS || "").trim();
  if (!ethers.isAddress(registryAddr) || !ethers.isAddress(tokenAddr)) {
    throw new Error("REGISTRY_CONTRACT_ADDRESS / TOKEN_CONTRACT_ADDRESS missing — deploy first");
  }

  const [operator] = await ethers.getSigners();
  if (!operator) throw new Error("No operator signer");

  const registry = await ethers.getContractAt("RecyclingRegistry", registryAddr, operator);
  const token = await ethers.getContractAt("EcoToken", tokenAddr, operator);

  const minter = await token.minter();
  const owner = await registry.owner();
  if (minter.toLowerCase() !== registryAddr.toLowerCase()) {
    throw new Error(`minter mismatch: ${minter} !== ${registryAddr}`);
  }
  if (owner.toLowerCase() !== operator.address.toLowerCase()) {
    throw new Error(`owner mismatch: ${owner} !== ${operator.address}`);
  }

  // Deterministic test declaration key (not a real UUID path — smoke only)
  const declarationId = ethers.id(`ecochain-smoke-${Date.now()}`);
  const beneficiary = operator.address;
  const amount = ethers.parseEther("1"); // 1 ECO test

  const before = await token.balanceOf(beneficiary);
  const tx = await registry.reward(declarationId, beneficiary, amount);
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) throw new Error("reward tx failed");

  const processed = await registry.isProcessed(declarationId);
  if (!processed) throw new Error("isProcessed=false after reward");

  const after = await token.balanceOf(beneficiary);
  if (after - before !== amount) {
    throw new Error(`balance delta ${after - before} !== ${amount}`);
  }

  let doubleRejected = false;
  try {
    await (await registry.reward(declarationId, beneficiary, amount)).wait();
  } catch {
    doubleRejected = true;
  }
  if (!doubleRejected) throw new Error("double reward was NOT rejected");

  console.log(
    JSON.stringify(
      {
        ok: true,
        txHash: receipt.hash,
        beneficiary,
        amountEco: "1",
        balanceAfter: ethers.formatEther(after),
        doublePayBlocked: true,
        minterMatchesRegistry: true,
        ownerMatchesOperator: true
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
