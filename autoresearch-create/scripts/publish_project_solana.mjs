#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Keypair } from "@solana/web3.js";
import {
  applyStorageRootHashes,
  bigintReplacer,
  buildCreateProjectInputs,
  buildPublishArtifactPaths,
  loadDeployment,
  parseArgs,
  prepare0gStorageArtifacts,
  readJson,
  storageIndexerRpc,
  storagePrivateKeyEnv,
} from "./publish_project_0g_lib.mjs";
import {
  createAnchorWallet,
  createOpenResearchPdas,
  createProjectAccounts,
  createProjectInstructionArgs,
  getOpenResearchProgram,
  readSolanaKeypair,
  resolveSolanaConfig,
  stringifyPublicKeys,
  summarizeSolanaCreateProject,
  u64BigInt,
} from "./solana_open_research.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_0G_DEPLOYMENT = path.join(
  SKILL_DIR,
  "contracts",
  "0g-galileo-testnet",
  "deployment.json",
);

function usage() {
  console.log(`Usage:
  node scripts/publish_project_solana.mjs \\
    --protocol-json ./out/protocol.json \\
    --repo-snapshot-file ./repo-snapshot.tar \\
    --benchmark-file ./benchmark.tar \\
    --baseline-metrics-file ./out/baseline_run.log \\
    --baseline-aggregate-score 12345 \\
    --token-name "My Research Token" \\
    --token-symbol MRT \\
    --base-price 100000 \\
    --slope 1000 \\
    --miner-pool-cap 21000000 \\
    --creator <solana-pubkey> \\
    --project-id 0 \\
    --upload-artifacts-to-0g \\
    --dry-run

Live Solana submit:
  add --idl ./target/idl/open_research.json --keypair ~/.config/solana/id.json --yes

Notes:
  - 0G Storage remains the artifact storage layer. With --dry-run, this computes
    0G Merkle roots but does not upload. Without --dry-run, set ZG_STORAGE_PRIVATE_KEY
    for the 0G/EVM storage upload signer.
  - Solana writes use the Anchor IDL and the supplied Solana keypair. The keypair
    must match --creator when --creator is provided.
  - RPC defaults to devnet. Override with --cluster, --rpc-url, or env vars:
    NEXT_PUBLIC_SOLANA_CLUSTER, NEXT_PUBLIC_SOLANA_RPC_URL,
    NEXT_PUBLIC_OPEN_RESEARCH_PROGRAM_ID.
`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return 0;
  }

  const live = !options.dryRun;
  if (live && !options.yes) {
    throw new Error("refusing to submit Solana transaction without --yes");
  }
  if (live && !options.uploadArtifactsTo0g && !options.allowSkipStorage) {
    throw new Error(
      "refusing to create on-chain project without 0G Storage uploads. " +
        "Pass --upload-artifacts-to-0g or --allow-skip-storage.",
    );
  }
  if (live && (!options.idl || !options.keypair)) {
    throw new Error("live Solana submit requires --idl and --keypair");
  }
  if (!live && !options.projectId) {
    throw new Error("--dry-run requires --project-id because nextProjectId is on-chain");
  }

  const outputDir = path.resolve(
    options.outputDir || path.dirname(path.resolve(options.protocolJson)),
  );
  fs.mkdirSync(outputDir, { recursive: true });

  const solanaConfig = resolveSolanaConfig(options);
  const storageDeploymentPath = path.resolve(
    options.zgDeployment || DEFAULT_0G_DEPLOYMENT,
  );
  const storageDeployment = loadDeployment(storageDeploymentPath);

  let storageArtifacts = null;
  let inputOptions = options;
  if (options.uploadArtifactsTo0g) {
    const artifactPaths = buildPublishArtifactPaths(options);
    const upload = live;
    const signer = upload
      ? await resolve0gStorageEnvSigner({ options, deployment: storageDeployment })
      : null;
    storageArtifacts = await prepare0gStorageArtifacts({
      artifactPaths,
      blockchainRpc: storageDeployment.network.rpcUrl,
      indexerRpc: storageIndexerRpc(options, storageDeployment),
      signer,
      upload,
      taskSize: options.zgStorageTaskSize,
      expectedReplica: options.zgStorageExpectedReplica,
      onProgress: (message) => console.log(`[0G Storage] ${message}`),
    });
    writeStorageManifest({
      outputDir,
      deployment: storageDeployment,
      indexerRpc: storageIndexerRpc(options, storageDeployment),
      storageArtifacts,
      upload,
    });
    inputOptions = applyStorageRootHashes(options, storageArtifacts);
  }

  const inputs = buildCreateProjectInputs(inputOptions);
  const keypair = options.keypair
    ? Keypair.fromSecretKey(readSolanaKeypair(path.resolve(options.keypair)))
    : null;
  const creator = options.creator || keypair?.publicKey;
  if (!creator) {
    throw new Error("--creator is required when --keypair is not supplied");
  }
  if (keypair && options.creator && keypair.publicKey.toBase58() !== String(options.creator)) {
    throw new Error("--creator does not match --keypair public key");
  }

  let projectId = options.projectId ? u64BigInt(options.projectId, "project id") : null;
  let program = null;
  if (live) {
    const idl = readJson(path.resolve(options.idl));
    program = getOpenResearchProgram({
      wallet: createAnchorWallet(keypair),
      idl,
      rpcUrl: solanaConfig.rpcUrl,
      programId: solanaConfig.programId,
    });
    if (projectId === null) {
      const pdas = createOpenResearchPdas(solanaConfig.programId);
      const config = await program.account.globalConfig.fetch(pdas.config());
      projectId = u64BigInt(config.nextProjectId.toString(), "nextProjectId");
    }
  }

  const summary = summarizeSolanaCreateProject({
    inputs,
    creator,
    projectId,
    config: solanaConfig,
  });
  console.log("\nSolana OpenResearch publish plan\n");
  console.log(JSON.stringify(summary, bigintReplacer, 2));
  if (storageArtifacts) {
    console.log("\n0G Storage artifacts\n");
    console.log(JSON.stringify(storageArtifacts, bigintReplacer, 2));
  }

  if (!live) {
    const planPath = path.join(outputDir, "publish_solana_plan.json");
    fs.writeFileSync(
      planPath,
      JSON.stringify({ solana: summary, storageArtifacts }, bigintReplacer, 2) + "\n",
    );
    console.log(`Solana publish plan written: ${planPath}`);
    return 0;
  }

  const signature = await program.methods
    .createProject(createProjectInstructionArgs(inputs))
    .accounts(createProjectAccounts({ creator, projectId, programId: solanaConfig.programId }))
    .rpc();
  const record = {
    cluster: solanaConfig.cluster,
    rpcUrl: solanaConfig.rpcUrl,
    programId: solanaConfig.programId.toBase58(),
    signature,
    projectId: projectId.toString(),
    creator: keypair.publicKey.toBase58(),
    accounts: summary.accounts,
    args: stringifyPublicKeys(summary.args),
    storageArtifacts,
  };
  const recordPath = path.join(outputDir, "publish_solana.json");
  fs.writeFileSync(recordPath, JSON.stringify(record, bigintReplacer, 2) + "\n");
  console.log(`Publish record written: ${recordPath}`);
  console.log(`Solana transaction signature: ${signature}`);
  return 0;
}

async function resolve0gStorageEnvSigner({ options, deployment }) {
  const envName = storagePrivateKeyEnv(options);
  const privateKey = process.env[envName];
  if (!privateKey) {
    throw new Error(`${envName} is required for live 0G Storage upload in Solana publish flow`);
  }
  const { ethers } = await import("ethers");
  const provider = new ethers.JsonRpcProvider(deployment.network.rpcUrl);
  return new ethers.Wallet(privateKey, provider);
}

function writeStorageManifest({ outputDir, deployment, indexerRpc, storageArtifacts, upload }) {
  const manifest = {
    storageNetwork: deployment.network.name,
    storageChainId: deployment.network.chainId,
    storageRpcUrl: deployment.network.rpcUrl,
    indexerRpc,
    uploaded: upload,
    artifacts: storageArtifacts,
    note: "Solana project hash fields use these 0G Storage rootHash values when --upload-artifacts-to-0g is set.",
  };
  const manifestPath = path.join(outputDir, "storage_0g_solana.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, bigintReplacer, 2) + "\n");
  console.log(`0G Storage manifest written: ${manifestPath}`);
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`publish failed: ${err.message}`);
    process.exit(1);
  },
);
