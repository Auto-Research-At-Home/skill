#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
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
const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;

function usage() {
  console.log(`Usage:
  node scripts/submit_proposal_solana.mjs \\
    --project-id 0 \\
    --code-file ./repo-snapshot.tar \\
    --benchmark-log-file ./.autoresearch/mine/runs/trial/stdout.log \\
    --claimed-metric 0.123 \\
    --stake 1 \\
    --reward-recipient <SOLANA_PUBKEY> \\
    --keypair ~/.config/solana/id.json \\
    --yes

Dry-run:
  node scripts/submit_proposal_solana.mjs ... --miner <SOLANA_PUBKEY> --proposal-id 0 --dry-run

Options:
  --idl <path>             Anchor IDL. Defaults to bundled contracts/solana-open-research/open_research.json.
  --cluster <name>         devnet, testnet, localnet, mainnet-beta. Defaults to devnet.
  --rpc-url <url>          Override Solana RPC URL.
  --program-id <pubkey>    Override OpenResearch program id.
  --metric-scale <n>       Decimal metric scale. Defaults to ARAH_METRIC_SCALE or 1000000.
  --claimed-score-int256   Use an already scaled i64 score instead of --claimed-metric.
  --code-hash              0x-prefixed SHA-256 bytes32, instead of --code-file.
  --code-irys-id           Irys/Arweave transaction id for the code archive.
  --benchmark-log-hash     0x-prefixed SHA-256 bytes32, instead of --benchmark-log-file.
  --benchmark-log-irys-id  Irys/Arweave transaction id for the benchmark log.
  --allow-missing-irys-ids Use zero Irys ids. Intended only for legacy dry-runs.
`);
}

function parseArgs(argv) {
  const options = {};
  const boolKeys = new Set(["help", "dryRun", "yes", "allowMissingIrysIds"]);
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    if (!raw.startsWith("--")) {
      throw new Error(`unexpected argument: ${raw}`);
    }
    const key = raw.slice(2).replace(/-([a-z0-9])/g, (_m, c) => c.toUpperCase());
    if (boolKeys.has(key)) {
      options[key] = true;
      continue;
    }
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${raw} requires a value`);
    }
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

function requireBytes32(value, label) {
  if (!BYTES32_RE.test(String(value || ""))) {
    throw new Error(`${label} must be a 0x-prefixed SHA-256 bytes32 value`);
  }
  return String(value).toLowerCase();
}

function hashFileBytes32(filePath) {
  const h = crypto.createHash("sha256");
  h.update(fs.readFileSync(filePath));
  return `0x${h.digest("hex")}`;
}

function resolveIrysIdOption({ solana, value, label, live, allowMissing }) {
  if (value) {
    solana.irysIdToBytes32(value, label);
    return String(value);
  }
  if (live && !allowMissing) {
    throw new Error(`${label} is required for live Solana submission`);
  }
  return solana.ZERO_IRYS_ID;
}

function decimalMetricToScaledInt(text, scale) {
  const scaleBig = BigInt(scale);
  if (scaleBig <= 0n) throw new Error("metric scale must be positive");
  let s = String(text).trim();
  const negative = s.startsWith("-");
  if (negative) s = s.slice(1);
  let value;
  if (s.includes(".")) {
    const [wholeRaw, fracRaw] = s.split(".", 2);
    const whole = wholeRaw || "0";
    const frac = fracRaw || "";
    const den = 10n ** BigInt(frac.length);
    const num = (BigInt(whole) * den + BigInt(frac || "0")) * scaleBig;
    if (num % den !== 0n) {
      throw new Error("metric cannot be represented exactly at this scale");
    }
    value = num / den;
  } else {
    value = BigInt(s) * scaleBig;
  }
  return (negative ? -value : value).toString();
}

async function loadSolanaLib() {
  const scriptsDir = path.resolve(
    process.env.AUTORESEARCH_CREATE_SCRIPTS || DEFAULT_CREATE_SCRIPTS,
  );
  return import(pathToFileURL(path.join(scriptsDir, "solana_open_research.mjs")));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return 0;
  }
  if (!options.projectId) throw new Error("--project-id is required");
  if (!options.rewardRecipient) throw new Error("--reward-recipient is required");
  if (!options.dryRun && !options.yes) {
    throw new Error("refusing to submit Solana transaction without --yes");
  }

  const solana = await loadSolanaLib();
  const idlPath = resolveBundledIdlPath(options);
  if (!fs.existsSync(idlPath)) throw new Error(`Anchor IDL not found at ${idlPath}`);

  const codeHash = options.codeFile
    ? hashFileBytes32(path.resolve(options.codeFile))
    : requireBytes32(options.codeHash, "codeHash");
  const codeIrysId = resolveIrysIdOption({
    solana,
    value: options.codeIrysId,
    label: "codeIrysId",
    live: !options.dryRun,
    allowMissing: Boolean(options.allowMissingIrysIds),
  });
  const benchmarkLogHash = options.benchmarkLogFile
    ? hashFileBytes32(path.resolve(options.benchmarkLogFile))
    : requireBytes32(options.benchmarkLogHash, "benchmarkLogHash");
  const benchmarkLogIrysId = resolveIrysIdOption({
    solana,
    value: options.benchmarkLogIrysId,
    label: "benchmarkLogIrysId",
    live: !options.dryRun,
    allowMissing: Boolean(options.allowMissingIrysIds),
  });
  const claimedAggregateScore =
    options.claimedScoreInt256 ??
    decimalMetricToScaledInt(
      options.claimedMetric ?? "",
      options.metricScale ?? process.env.ARAH_METRIC_SCALE ?? "1000000",
    );
  const stake = options.stake ?? process.env.ARAH_STAKE ?? "1";
  const config = solana.resolveSolanaConfig(options);

  let keypair = null;
  if (options.keypair) {
    keypair = Keypair.fromSecretKey(
      solana.readSolanaKeypair(path.resolve(options.keypair)),
    );
  }
  const miner = options.miner
    ? solana.publicKeyFrom(options.miner, "miner")
    : keypair?.publicKey;
  if (!miner) throw new Error("--miner is required unless --keypair is supplied");

  let proposalId = options.proposalId ?? null;
  let program = null;
  if (!options.dryRun || proposalId === null) {
    if (!keypair) {
      throw new Error("--keypair is required unless dry-run has --proposal-id");
    }
    program = solana.getOpenResearchProgram({
      wallet: solana.createAnchorWallet(keypair),
      idl: readJson(idlPath),
      rpcUrl: config.rpcUrl,
      programId: config.programId,
    });
    if (proposalId === null) {
      const pdas = solana.createOpenResearchPdas(config.programId);
      const globalConfig = await program.account.globalConfig.fetch(pdas.config());
      proposalId = globalConfig.nextProposalId.toString();
    }
  }
  if (proposalId === null) proposalId = "0";

  const instructionArgs = solana.submitInstructionArgs({
    projectId: options.projectId,
    codeHash,
    codeIrysId,
    benchmarkLogHash,
    benchmarkLogIrysId,
    claimedAggregateScore,
    stake,
    rewardRecipient: options.rewardRecipient,
  });
  const accounts = solana.submitProposalAccounts({
    miner,
    projectId: options.projectId,
    proposalId,
    programId: config.programId,
  });
  const plan = solana.stringifyPublicKeys({
    network: config.cluster,
    rpcUrl: config.rpcUrl,
    programId: config.programId,
    method: "open_research.submit",
    projectId: options.projectId,
    proposalId,
    args: instructionArgs,
    accounts,
  });

  if (options.dryRun) {
    console.log(JSON.stringify(plan, null, 2));
    return 0;
  }

  const signature = await program.methods
    .submit(
      instructionArgs.projectId,
      instructionArgs.codeHash,
      instructionArgs.codeIrysId,
      instructionArgs.benchmarkLogHash,
      instructionArgs.benchmarkLogIrysId,
      instructionArgs.claimedAggregateScore,
      instructionArgs.stake,
      instructionArgs.rewardRecipient,
    )
    .accounts(accounts)
    .rpc();
  console.log(JSON.stringify({ ...plan, signature }, null, 2));
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`submit failed: ${err.message}`);
    process.exit(1);
  },
);
