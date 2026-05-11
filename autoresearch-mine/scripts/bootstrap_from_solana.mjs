#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Keypair } from "@solana/web3.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const MINE_DIR = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_DEPLOYMENT = path.join(
  MINE_DIR,
  "contracts",
  "solana-open-research",
  "deployment.json",
);
const DEFAULT_CREATE_SCRIPTS = path.resolve(
  SCRIPT_DIR,
  "..",
  "..",
  "autoresearch-create",
  "scripts",
);

function usage() {
  console.log(`Usage:
  node scripts/bootstrap_from_solana.mjs \\
    --project-id 0 \\
    --output-dir /tmp/arah-solana-project \\
    --unpack-repo

Options:
  --idl <path>             Anchor IDL. Defaults to bundled contracts/solana-open-research/open_research.json.
  --cluster <name>         devnet, testnet, localnet, mainnet-beta. Defaults to devnet.
  --rpc-url <url>          Override Solana RPC URL.
  --program-id <pubkey>    Override OpenResearch program id.
  --gateway-url <url>      Irys gateway override.
  --network <devnet|mainnet>
  --repo-root <path>       Where --unpack-repo extracts repo-snapshot.tar.
  --unpack-repo            Extract repo snapshot and initialize .autoresearch/mine.
  --skip-existing          Reuse existing downloads after hash verification.
`);
}

function parseArgs(argv) {
  const options = {};
  const boolKeys = new Set(["help", "unpackRepo", "skipExisting"]);
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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function resolveBundledIdlPath(options) {
  if (options.idl) return path.resolve(options.idl);
  const deployment = readJson(DEFAULT_DEPLOYMENT);
  return path.resolve(
    path.dirname(DEFAULT_DEPLOYMENT),
    deployment.programs.OpenResearch.idl,
  );
}

async function loadSolanaLib() {
  const scriptsDir = path.resolve(
    process.env.AUTORESEARCH_CREATE_SCRIPTS || DEFAULT_CREATE_SCRIPTS,
  );
  return import(pathToFileURL(path.join(scriptsDir, "solana_open_research.mjs")));
}

function readonlyWallet() {
  const keypair = Keypair.generate();
  return {
    publicKey: keypair.publicKey,
    signTransaction: async () => {
      throw new Error("read-only wallet cannot sign");
    },
    signAllTransactions: async () => {
      throw new Error("read-only wallet cannot sign");
    },
  };
}

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    text: true,
    cwd: options.cwd,
  });
  if (result.status !== 0) {
    const stderr = result.stderr ? `\n${result.stderr}` : "";
    throw new Error(`${cmd} ${args.join(" ")} failed${stderr}`);
  }
  return result.stdout || "";
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return 0;
  }
  if (!options.projectId) throw new Error("--project-id is required");
  if (!options.outputDir) throw new Error("--output-dir is required");

  const solana = await loadSolanaLib();
  const idlPath = resolveBundledIdlPath(options);
  const config = solana.resolveSolanaConfig(options);
  const program = solana.getOpenResearchProgram({
    wallet: readonlyWallet(),
    idl: readJson(idlPath),
    rpcUrl: config.rpcUrl,
    programId: config.programId,
  });
  const pdas = solana.createOpenResearchPdas(config.programId);
  const projectPda = pdas.project(options.projectId);
  const project = await program.account.project.fetch(projectPda);

  const artifacts = {
    protocol: {
      hash: solana.bytes32ToHex(project.protocolHash, "protocolHash"),
      irysId: solana.bytes32ToIrysId(project.protocolIrysId, "protocolIrysId"),
    },
    repoSnapshot: {
      hash: solana.bytes32ToHex(project.repoSnapshotHash, "repoSnapshotHash"),
      irysId: solana.bytes32ToIrysId(project.repoSnapshotIrysId, "repoSnapshotIrysId"),
    },
    benchmark: {
      hash: solana.bytes32ToHex(project.benchmarkHash, "benchmarkHash"),
      irysId: solana.bytes32ToIrysId(project.benchmarkIrysId, "benchmarkIrysId"),
    },
    baselineMetrics: {
      hash: solana.bytes32ToHex(project.baselineMetricsHash, "baselineMetricsHash"),
      irysId: solana.bytes32ToIrysId(
        project.baselineMetricsIrysId,
        "baselineMetricsIrysId",
      ),
    },
  };

  const outputDir = path.resolve(options.outputDir);
  const artifactsDir = path.join(outputDir, "artifacts");
  fs.mkdirSync(outputDir, { recursive: true });

  const downloadArgs = [
    path.join(SCRIPT_DIR, "download_irys_artifacts.mjs"),
    "--output-dir",
    artifactsDir,
    "--protocol-hash",
    artifacts.protocol.hash,
    "--protocol-irys-id",
    artifacts.protocol.irysId,
    "--repo-snapshot-hash",
    artifacts.repoSnapshot.hash,
    "--repo-snapshot-irys-id",
    artifacts.repoSnapshot.irysId,
    "--benchmark-hash",
    artifacts.benchmark.hash,
    "--benchmark-irys-id",
    artifacts.benchmark.irysId,
    "--baseline-metrics-hash",
    artifacts.baselineMetrics.hash,
    "--baseline-metrics-irys-id",
    artifacts.baselineMetrics.irysId,
  ];
  if (options.gatewayUrl) downloadArgs.push("--gateway-url", options.gatewayUrl);
  if (options.network) downloadArgs.push("--network", options.network);
  if (options.skipExisting) downloadArgs.push("--skip-existing");
  run("node", downloadArgs);

  let repoRoot = null;
  if (options.unpackRepo) {
    repoRoot = path.resolve(options.repoRoot || path.join(outputDir, "repo"));
    fs.mkdirSync(repoRoot, { recursive: true });
    run("tar", ["-xf", path.join(artifactsDir, "repo-snapshot.tar"), "-C", repoRoot]);
    run("bash", [path.join(SCRIPT_DIR, "init_mine_workspace.sh"), repoRoot]);
  }

  const record = {
    schemaVersion: "1",
    source: "solana",
    cluster: config.cluster,
    rpcUrl: config.rpcUrl,
    programId: config.programId.toBase58(),
    projectId: String(options.projectId),
    projectPda: projectPda.toBase58(),
    artifacts,
    artifactsDir,
    protocolJson: path.join(artifactsDir, "protocol.json"),
    repoRoot,
    currentBestAggregateScore: project.currentBestAggregateScore?.toString?.() ?? null,
  };
  const recordPath = path.join(outputDir, "bootstrap_solana.json");
  fs.writeFileSync(recordPath, JSON.stringify(record, null, 2) + "\n");
  console.log(recordPath);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`bootstrap failed: ${err.message}`);
    process.exit(1);
  },
);
