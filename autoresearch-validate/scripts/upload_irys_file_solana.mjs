#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CREATE_SCRIPTS = path.resolve(
  SCRIPT_DIR,
  "..",
  "..",
  "autoresearch-create",
  "scripts",
);

function usage() {
  console.log(`Usage:
  node scripts/upload_irys_file_solana.mjs \\
    --file ./metrics.log \\
    --keypair ~/.config/solana/id.json \\
    --artifact-role verifierMetrics

Options:
  --cluster <name>       devnet, testnet, localnet, mainnet-beta. Defaults to devnet.
  --rpc-url <url>        Override Solana RPC URL.
  --irys-network <name>  devnet or mainnet. Defaults from cluster.
  --artifact-role <role> Irys tag Artifact-Role. Defaults to verifierMetrics.
  --dry-run              Print upload plan without uploading/funding.
`);
}

function parseArgs(argv) {
  const options = {};
  const boolKeys = new Set(["help", "dryRun"]);
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    if (!raw.startsWith("--")) throw new Error(`unexpected argument: ${raw}`);
    const key = raw.slice(2).replace(/-([a-z0-9])/g, (_m, c) => c.toUpperCase());
    if (boolKeys.has(key)) {
      options[key] = true;
      continue;
    }
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`${raw} requires a value`);
    options[key] = value;
    i += 1;
  }
  return options;
}

async function loadCreateLib(name) {
  const scriptsDir = path.resolve(
    process.env.AUTORESEARCH_CREATE_SCRIPTS || DEFAULT_CREATE_SCRIPTS,
  );
  return import(pathToFileURL(path.join(scriptsDir, name)));
}

function sha256Bytes32(filePath) {
  const h = crypto.createHash("sha256");
  h.update(fs.readFileSync(filePath));
  return `0x${h.digest("hex")}`;
}

function toComparable(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.ceil(value));
  if (typeof value === "string") return BigInt(value);
  if (value && typeof value.toString === "function") return BigInt(value.toString());
  throw new Error("cannot convert Irys amount to bigint");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return 0;
  }
  if (!options.file) throw new Error("--file is required");
  if (!options.keypair) throw new Error("--keypair is required");

  const filePath = path.resolve(options.file);
  if (!fs.existsSync(filePath)) throw new Error(`file not found: ${filePath}`);

  const solana = await loadCreateLib("solana_open_research.mjs");
  const { resolveIrysNetwork } = await loadCreateLib("irys_storage.mjs");
  const config = solana.resolveSolanaConfig(options);
  const network = resolveIrysNetwork({
    cluster: config.cluster,
    irysNetwork: options.irysNetwork,
  });
  const sha256 = sha256Bytes32(filePath);
  const tags = [
    { name: "Content-Type", value: "text/plain" },
    { name: "App-Name", value: "OpenResearch AutoResearch" },
    { name: "Artifact-Role", value: options.artifactRole || "verifierMetrics" },
    { name: "SHA-256", value: sha256.slice(2) },
  ];
  const plan = {
    file: filePath,
    sizeBytes: fs.statSync(filePath).size,
    sha256Bytes32: sha256,
    cluster: config.cluster,
    rpcUrl: config.rpcUrl,
    irysNetwork: network.name,
    gatewayUrl: network.gatewayUrl,
    tags,
  };

  if (options.dryRun) {
    console.log(JSON.stringify({ ...plan, uploaded: false }, null, 2));
    return 0;
  }

  const [{ Uploader }, { Solana }] = await Promise.all([
    import("@irys/upload"),
    import("@irys/upload-solana"),
  ]);
  const privateKey = JSON.parse(fs.readFileSync(path.resolve(options.keypair), "utf8"));
  let uploader = Uploader(Solana).withWallet(privateKey).withRpc(config.rpcUrl);
  if (network.name === "devnet") {
    uploader = uploader.devnet();
  }
  const irys = await uploader;
  const price = await irys.getPrice(plan.sizeBytes);
  const balance = await irys.getLoadedBalance();
  if (toComparable(balance) < toComparable(price)) {
    const fundAmount = toComparable(price) - toComparable(balance);
    await irys.fund(fundAmount.toString());
  }
  const receipt = await irys.uploadFile(filePath, { tags });
  const id = String(receipt.id);
  console.log(
    JSON.stringify(
      {
        ...plan,
        uploaded: true,
        id,
        gatewayUri: `${network.gatewayUrl}/${id}`,
        receipt,
      },
      null,
      2,
    ),
  );
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`upload failed: ${err.message}`);
    process.exit(1);
  },
);
