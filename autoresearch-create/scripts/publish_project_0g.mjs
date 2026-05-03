#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  bigintReplacer,
  buildCreateProjectInputs,
  encodeCreateProjectCalldata,
  loadDeployment,
  parseArgs,
  parseProjectCreated,
  readJson,
  summarizeCreateProject,
  toHexQuantity,
} from "./publish_project_0g_lib.mjs";
import { startLocalWalletPublish } from "./local_wallet_publish.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_DEPLOYMENT = path.join(
  SKILL_DIR,
  "contracts",
  "0g-galileo-testnet",
  "deployment.json",
);

function usage() {
  console.log(`Usage:
  node scripts/publish_project_0g.mjs \\
    --protocol-json ./out/protocol.json \\
    --repo-snapshot-file ./repo-snapshot.tar \\
    --benchmark-file ./benchmark.tar \\
    --baseline-metrics-file ./out/baseline_run.log \\
    --baseline-aggregate-score 12345 \\
    --token-name "My Research Token" \\
    --token-symbol MRT \\
    --base-price 1000000000000000 \\
    --slope 1000000000000 \\
    --miner-pool-cap 1000000000000000000000000 \\
    --yes

Notes:
  - Use --baseline-metric <decimal> --metric-scale <integer> instead of
    --baseline-aggregate-score when the benchmark output needs scaling.
  - Use --dry-run to validate and print calldata without connecting a wallet.
  - Use --unsigned-tx to write an unsigned transaction JSON instead of opening a wallet.
  - By default, publishing opens a temporary localhost browser page for an
    injected wallet extension. Use --no-open to print the URL without opening it.
  - Hash fields can be supplied directly with --protocol-hash, --repo-snapshot-hash,
    --benchmark-hash, and --baseline-metrics-hash.
`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return 0;
  }

  const deploymentPath = path.resolve(options.deployment || DEFAULT_DEPLOYMENT);
  const deployment = loadDeployment(deploymentPath);
  const registryConfig = deployment.contracts.ProjectRegistry;
  const registryArtifactPath = path.resolve(
    path.dirname(deploymentPath),
    registryConfig.artifact,
  );
  const registryArtifact = readJson(registryArtifactPath);
  const registryAbi = registryArtifact.abi;
  const inputs = buildCreateProjectInputs(options);
  const calldata = await encodeCreateProjectCalldata(registryAbi, inputs);
  const txRequest = {
    to: registryConfig.address,
    data: calldata,
    value: "0x0",
    chainId: toHexQuantity(deployment.network.chainId),
  };

  const summary = summarizeCreateProject(inputs, deployment);
  console.log("\n0G Galileo publish transaction\n");
  console.log(JSON.stringify(summary, bigintReplacer, 2));
  console.log(`\ncalldata: ${calldata}\n`);

  const outputDir = path.resolve(
    options.outputDir || path.dirname(path.resolve(options.protocolJson)),
  );
  fs.mkdirSync(outputDir, { recursive: true });

  if (options.dryRun || options.unsignedTx) {
    const unsignedPath = path.join(outputDir, "publish_0g_galileo_unsigned_tx.json");
    fs.writeFileSync(
      unsignedPath,
      JSON.stringify({ deployment, summary, txRequest }, bigintReplacer, 2) + "\n",
    );
    console.log(`unsigned transaction written: ${unsignedPath}`);
    return 0;
  }

  if (!options.yes) {
    throw new Error("refusing to open wallet session without --yes after showing the transaction summary");
  }

  const { createPublicClient, http } = await import("viem");
  const publicClient = createPublicClient({
    transport: http(deployment.network.rpcUrl),
  });

  const walletSession = await startLocalWalletPublish({
    txRequest,
    deployment,
    summary,
    open: !options.noOpen,
  });
  console.log("\nOpen this local wallet signing page in a browser with your wallet extension:\n");
  console.log(walletSession.url);
  console.log("\nWaiting for wallet message signature and transaction approval...\n");

  const { address: account, signature, message: approvalMessage, txHash } = await walletSession.result;
  console.log(`Connected wallet: ${account}`);
  console.log("Verified publish approval signature.");

  console.log(`Transaction submitted: ${txHash}`);
  console.log("Waiting for transaction receipt...");

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
    confirmations: 1,
  });
  if (receipt.status !== "success") {
    throw new Error(`transaction failed: ${txHash}`);
  }
  if (receipt.from && receipt.from.toLowerCase() !== account.toLowerCase()) {
    throw new Error(`transaction sender ${receipt.from} did not match approved wallet ${account}`);
  }
  if (receipt.to && receipt.to.toLowerCase() !== registryConfig.address.toLowerCase()) {
    throw new Error(`transaction target ${receipt.to} did not match ProjectRegistry ${registryConfig.address}`);
  }

  const event = await parseProjectCreated(receipt, registryAbi, registryConfig.address);
  if (event.creator.toLowerCase() !== account.toLowerCase()) {
    throw new Error(`ProjectCreated creator ${event.creator} did not match approved wallet ${account}`);
  }
  if (event.protocolHash.toLowerCase() !== inputs.protocolHash.toLowerCase()) {
    throw new Error(`ProjectCreated protocolHash ${event.protocolHash} did not match requested ${inputs.protocolHash}`);
  }
  const publishRecord = {
    chainId: deployment.network.chainId,
    rpcUrl: deployment.network.rpcUrl,
    projectRegistry: registryConfig.address,
    proposalLedger: deployment.contracts.ProposalLedger.address,
    verifierRegistry: deployment.contracts.VerifierRegistry.address,
    transactionHash: txHash,
    blockNumber: receipt.blockNumber?.toString(),
    from: account,
    publishApprovalSignature: signature,
    publishApprovalMessage: approvalMessage,
    projectId: event.projectId,
    tokenAddr: event.tokenAddr,
    creator: event.creator,
    protocolHash: event.protocolHash,
  };

  const recordPath = path.join(outputDir, "publish_0g_galileo.json");
  fs.writeFileSync(recordPath, JSON.stringify(publishRecord, null, 2) + "\n");
  console.log(`Publish record written: ${recordPath}`);
  console.log(`Project ${event.projectId} token: ${event.tokenAddr}`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`publish failed: ${err.message}`);
    process.exit(1);
  },
);
