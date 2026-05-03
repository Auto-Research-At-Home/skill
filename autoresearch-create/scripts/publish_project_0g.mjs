#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  applyStorageRootHashes,
  bigintReplacer,
  buildPublishArtifactPaths,
  buildCreateProjectInputs,
  encodeCreateProjectCalldata,
  loadDeployment,
  parseArgs,
  parseProjectCreated,
  prepare0gStorageArtifacts,
  readJson,
  summarizeCreateProject,
  storageIndexerRpc,
  storagePrivateKeyEnv,
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
    --upload-artifacts-to-0g \\
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
  - Use --upload-artifacts-to-0g to upload protocol/repo/benchmark/baseline files
    to 0G Storage and use their 0G root hashes as the on-chain bytes32 fields.
  - 0G Storage uploads use the same localhost browser wallet flow by default.
    Set ZG_STORAGE_PRIVATE_KEY only for an intentionally local unattended
    publisher wallet with 0G testnet gas.
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
  const outputDir = path.resolve(
    options.outputDir || path.dirname(path.resolve(options.protocolJson)),
  );
  fs.mkdirSync(outputDir, { recursive: true });

  let walletSession = null;
  let storageArtifacts = null;
  let inputOptions = options;

  const storageUsesBrowserWallet =
    options.uploadArtifactsTo0g &&
    !(options.dryRun || options.unsignedTx) &&
    !process.env[storagePrivateKeyEnv(options)];

  if (storageUsesBrowserWallet) {
    if (!options.yes) {
      throw new Error("refusing to open wallet session for 0G Storage without --yes");
    }
    walletSession = await startLocalWalletPublish({
      deployment,
      open: !options.noOpen,
    });
    console.log("\nOpen this local wallet signing page in a browser with your wallet extension:\n");
    console.log(walletSession.url);
    console.log("\nConnect your wallet there to approve 0G Storage transactions as the CLI prepares artifacts.\n");
  }

  if (options.uploadArtifactsTo0g) {
    const artifactPaths = buildPublishArtifactPaths(options);
    const indexerRpc = storageIndexerRpc(options, deployment);
    const upload = !(options.dryRun || options.unsignedTx);
    const signer = upload
      ? await resolve0gStorageSigner({ options, deployment, walletSession })
      : null;

    storageArtifacts = await prepare0gStorageArtifacts({
      artifactPaths,
      blockchainRpc: deployment.network.rpcUrl,
      indexerRpc,
      signer,
      upload,
      taskSize: options.zgStorageTaskSize,
      expectedReplica: options.zgStorageExpectedReplica,
      onProgress: (message) => console.log(`[0G Storage] ${message}`),
    });

    writeStorageManifest({
      outputDir,
      deployment,
      indexerRpc,
      storageArtifacts,
      upload,
    });
    walletSession?.setStorageArtifacts(storageArtifacts);
    inputOptions = applyStorageRootHashes(options, storageArtifacts);

    if (options.storageOnly) {
      console.log("Storage upload complete; skipping registry transaction.");
      walletSession?.close();
      return 0;
    }
  } else if (options.storageOnly) {
    throw new Error("--storage-only requires --upload-artifacts-to-0g");
  }

  const inputs = buildCreateProjectInputs(inputOptions);
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
  if (storageArtifacts) {
    console.log("\n0G Storage artifacts\n");
    console.log(JSON.stringify(storageArtifacts, bigintReplacer, 2));
  }
  console.log(`\ncalldata: ${calldata}\n`);

  if (options.dryRun || options.unsignedTx) {
    const unsignedPath = path.join(outputDir, "publish_0g_galileo_unsigned_tx.json");
    fs.writeFileSync(
      unsignedPath,
      JSON.stringify(
        { deployment, summary, txRequest, storageArtifacts },
        bigintReplacer,
        2,
      ) + "\n",
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

  if (!walletSession) {
    walletSession = await startLocalWalletPublish({
      txRequest,
      deployment,
      summary,
      storageArtifacts,
      open: !options.noOpen,
    });
    console.log("\nOpen this local wallet signing page in a browser with your wallet extension:\n");
    console.log(walletSession.url);
  } else {
    walletSession.setPublishRequest({ txRequest, summary });
  }

  console.log("\nWaiting for browser wallet approval and final project transaction...\n");

  const {
    address: account,
    signature,
    message: approvalMessage,
    txHash,
  } = await walletSession.result;
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
    storageArtifacts,
  };

  const recordPath = path.join(outputDir, "publish_0g_galileo.json");
  fs.writeFileSync(recordPath, JSON.stringify(publishRecord, null, 2) + "\n");
  console.log(`Publish record written: ${recordPath}`);
  console.log(`Project ${event.projectId} token: ${event.tokenAddr}`);
  return 0;
}

async function resolve0gStorageSigner({ options, deployment, walletSession }) {
  const envName = storagePrivateKeyEnv(options);
  const privateKey = process.env[envName];
  const { ethers } = await import("ethers");

  if (privateKey) {
    const provider = new ethers.JsonRpcProvider(deployment.network.rpcUrl);
    return new ethers.Wallet(privateKey, provider);
  }

  if (!walletSession) {
    throw new Error(`0G Storage upload requires a local wallet session or ${envName}`);
  }

  const account = await walletSession.waitForAccount();
  const provider = new ethers.BrowserProvider(walletSession.eip1193Provider);
  return provider.getSigner(account);
}

function writeStorageManifest({ outputDir, deployment, indexerRpc, storageArtifacts, upload }) {
  const manifest = {
    network: deployment.network.name,
    chainId: deployment.network.chainId,
    rpcUrl: deployment.network.rpcUrl,
    indexerRpc,
    uploaded: upload,
    artifacts: storageArtifacts,
    note: "On-chain project hash fields use these 0G Storage rootHash values when --upload-artifacts-to-0g is set.",
  };
  const manifestPath = path.join(outputDir, "storage_0g_galileo.json");
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
