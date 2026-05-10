#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Keypair } from "@solana/web3.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const VALIDATE_DIR = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_DEPLOYMENT = path.join(
  VALIDATE_DIR,
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
  node scripts/settle_proposal_solana.mjs --action claim-review --proposal-id 0 --keypair verifier.json --yes
  node scripts/settle_proposal_solana.mjs --action approve --proposal-id 0 --verified-metric 0.42 --metrics-log-file out.log --keypair verifier.json --yes
  node scripts/settle_proposal_solana.mjs --action reject --proposal-id 0 --metrics-log-file out.log --keypair verifier.json --yes
  node scripts/settle_proposal_solana.mjs --action expire --proposal-id 0 --keypair cranker.json --yes
  node scripts/settle_proposal_solana.mjs --action release-review --proposal-id 0 --keypair cranker.json --yes
  node scripts/settle_proposal_solana.mjs --action claim-reward --project-id 0 --keypair verifier.json --yes

Dry-runs can use --actor <SOLANA_PUBKEY> instead of --keypair. For approve,
reject, and expire dry-runs also pass --project-id. Approve dry-runs need
--miner and --reward-recipient unless a live RPC fetch is available.`);
}

function parseArgs(argv) {
  const options = {};
  const boolKeys = new Set(["help", "dryRun", "yes"]);
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

function proposalIdRequired(options) {
  if (!options.proposalId) throw new Error("--proposal-id is required");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return 0;
  }
  const action = String(options.action || "");
  const valid = new Set([
    "claim-review",
    "release-review",
    "approve",
    "reject",
    "expire",
    "claim-reward",
  ]);
  if (!valid.has(action)) throw new Error("--action is required");
  if (!options.dryRun && !options.yes) {
    throw new Error("refusing to submit Solana transaction without --yes");
  }

  const solana = await loadSolanaLib();
  const idlPath = resolveBundledIdlPath(options);
  if (!fs.existsSync(idlPath)) throw new Error(`Anchor IDL not found at ${idlPath}`);
  const config = solana.resolveSolanaConfig(options);

  let keypair = null;
  if (options.keypair) {
    keypair = Keypair.fromSecretKey(
      solana.readSolanaKeypair(path.resolve(options.keypair)),
    );
  }
  const actor = options.actor
    ? solana.publicKeyFrom(options.actor, "actor")
    : keypair?.publicKey;
  if (!actor) throw new Error("--actor is required unless --keypair is supplied");

  let program = null;
  if (!options.dryRun || keypair) {
    if (!keypair) throw new Error("--keypair is required for live settlement");
    program = solana.getOpenResearchProgram({
      wallet: solana.createAnchorWallet(keypair),
      idl: readJson(idlPath),
      rpcUrl: config.rpcUrl,
      programId: config.programId,
    });
  }

  let projectId = options.projectId ?? null;
  let miner = options.miner ?? null;
  let rewardRecipient = options.rewardRecipient ?? null;
  if (
    program &&
    options.proposalId &&
    (projectId === null ||
      (action === "approve" && (!miner || !rewardRecipient)))
  ) {
    const pdas = solana.createOpenResearchPdas(config.programId);
    const proposal = await program.account.proposal.fetch(
      pdas.proposal(options.proposalId),
    );
    projectId ??= proposal.projectId.toString();
    miner ??= proposal.miner.toBase58();
    rewardRecipient ??= proposal.rewardRecipient.toBase58();
  }

  let method;
  let accounts;
  let args = {};
  if (action === "claim-review") {
    proposalIdRequired(options);
    method = "open_research.claimReview";
    accounts = solana.claimReviewAccounts({
      verifier: actor,
      proposalId: options.proposalId,
      programId: config.programId,
    });
    args = { proposalId: options.proposalId };
  } else if (action === "release-review") {
    proposalIdRequired(options);
    method = "open_research.releaseReview";
    accounts = solana.releaseReviewAccounts({
      cranker: actor,
      proposalId: options.proposalId,
      programId: config.programId,
    });
    args = { proposalId: options.proposalId };
  } else if (action === "approve") {
    proposalIdRequired(options);
    if (!projectId) throw new Error("--project-id is required");
    if (!miner) throw new Error("--miner is required");
    if (!rewardRecipient) throw new Error("--reward-recipient is required");
    const metricsHash = options.metricsLogFile
      ? hashFileBytes32(path.resolve(options.metricsLogFile))
      : requireBytes32(options.metricsHash, "metricsHash");
    const score =
      options.verifiedScoreInt256 ??
      decimalMetricToScaledInt(
        options.verifiedMetric ?? "",
        options.metricScale ?? process.env.ARAH_METRIC_SCALE ?? "1000000",
      );
    method = "open_research.approve";
    accounts = solana.approveProposalAccounts({
      verifier: actor,
      projectId,
      proposalId: options.proposalId,
      miner,
      rewardRecipient,
      programId: config.programId,
    });
    args = {
      proposalId: options.proposalId,
      verifiedAggregateScore: score,
      metricsHash,
    };
  } else if (action === "reject") {
    proposalIdRequired(options);
    if (!projectId) throw new Error("--project-id is required");
    const metricsHash = options.metricsLogFile
      ? hashFileBytes32(path.resolve(options.metricsLogFile))
      : requireBytes32(options.metricsHash, "metricsHash");
    method = "open_research.reject";
    accounts = solana.rejectProposalAccounts({
      verifier: actor,
      projectId,
      proposalId: options.proposalId,
      programId: config.programId,
    });
    args = { proposalId: options.proposalId, metricsHash };
  } else if (action === "expire") {
    proposalIdRequired(options);
    if (!projectId) throw new Error("--project-id is required");
    method = "open_research.expire";
    accounts = solana.expireProposalAccounts({
      cranker: actor,
      projectId,
      proposalId: options.proposalId,
      programId: config.programId,
    });
    args = { proposalId: options.proposalId };
  } else if (action === "claim-reward") {
    if (!projectId) throw new Error("--project-id is required");
    method = "open_research.claimReward";
    accounts = solana.claimRewardAccounts({
      claimer: actor,
      projectId,
      programId: config.programId,
    });
    args = { projectId };
  }

  const plan = solana.stringifyPublicKeys({
    network: config.cluster,
    rpcUrl: config.rpcUrl,
    programId: config.programId,
    method,
    projectId,
    proposalId: options.proposalId,
    args,
    accounts,
  });
  if (options.dryRun) {
    console.log(JSON.stringify(plan, null, 2));
    return 0;
  }

  let signature;
  if (action === "claim-review") {
    signature = await program.methods
      .claimReview(solana.u64Bn(options.proposalId, "proposalId"))
      .accounts(accounts)
      .rpc();
  } else if (action === "release-review") {
    signature = await program.methods
      .releaseReview(solana.u64Bn(options.proposalId, "proposalId"))
      .accounts(accounts)
      .rpc();
  } else if (action === "approve") {
    signature = await program.methods
      .approve(
        solana.u64Bn(options.proposalId, "proposalId"),
        solana.i64Bn(args.verifiedAggregateScore, "verifiedAggregateScore"),
        solana.hex32ToBytes(args.metricsHash, "metricsHash"),
      )
      .accounts(accounts)
      .rpc();
  } else if (action === "reject") {
    signature = await program.methods
      .reject(
        solana.u64Bn(options.proposalId, "proposalId"),
        solana.hex32ToBytes(args.metricsHash, "metricsHash"),
      )
      .accounts(accounts)
      .rpc();
  } else if (action === "expire") {
    signature = await program.methods
      .expire(solana.u64Bn(options.proposalId, "proposalId"))
      .accounts(accounts)
      .rpc();
  } else if (action === "claim-reward") {
    signature = await program.methods
      .claimReward(solana.u64Bn(projectId, "projectId"))
      .accounts(accounts)
      .rpc();
  }
  console.log(JSON.stringify({ ...plan, signature }, null, 2));
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`settle failed: ${err.message}`);
    process.exit(1);
  },
);
