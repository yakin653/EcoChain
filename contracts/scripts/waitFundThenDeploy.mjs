/**
 * Poll operator balance on Hedera Testnet; when funded, run Hardhat deploy.
 * Never prints private keys.
 *
 * Usage: node scripts/waitFundThenDeploy.mjs [--timeout-ms=600000]
 */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Wallet, JsonRpcProvider, formatEther } from "ethers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const envPath = path.join(root, "backend/.env");

const timeoutArg = process.argv.find((a) => a.startsWith("--timeout-ms="));
const timeoutMs = Number(timeoutArg?.split("=")[1] || 600_000);
const pollMs = 5_000;

function readEnvKey(name) {
  const text = fs.readFileSync(envPath, "utf8");
  const m = text.match(new RegExp(`^${name}=(.*)$`, "m"));
  return (m?.[1] || "").trim().replace(/^["']|["']$/g, "");
}

const key = readEnvKey("BACKEND_OPERATOR_PRIVATE_KEY");
if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
  console.error("BACKEND_OPERATOR_PRIVATE_KEY missing or invalid in backend/.env");
  process.exit(1);
}

const rpc = readEnvKey("HEDERA_RPC_URL") || "https://testnet.hashio.io/api";
const chainId = Number(readEnvKey("HEDERA_CHAIN_ID") || 296);
const wallet = new Wallet(key);
const provider = new JsonRpcProvider(rpc, chainId);

console.log(
  JSON.stringify(
    {
      operatorAddress: wallet.address,
      rpc,
      chainId,
      faucet: "https://portal.hedera.com/faucet",
      timeoutMs
    },
    null,
    2
  )
);
console.log("Waiting for HBAR funding…");

const started = Date.now();
while (Date.now() - started < timeoutMs) {
  const bal = await provider.getBalance(wallet.address);
  console.log(
    JSON.stringify({
      elapsedSec: Math.round((Date.now() - started) / 1000),
      balanceHbar: formatEther(bal)
    })
  );
  if (bal > 0n) {
    console.log("Funds detected — starting deploy:testnet…");
    const child = spawn(
      process.platform === "win32" ? "npm.cmd" : "npm",
      ["run", "deploy:testnet", "-w", "contracts"],
      // Windows: spawning .cmd without shell throws EINVAL on Node 20+
      { cwd: root, stdio: "inherit", env: process.env, shell: process.platform === "win32" }
    );
    const code = await new Promise((resolve) => child.on("close", resolve));
    process.exit(code ?? 1);
  }
  await new Promise((r) => setTimeout(r, pollMs));
}

console.error("Timed out waiting for operator funding.");
process.exit(1);
