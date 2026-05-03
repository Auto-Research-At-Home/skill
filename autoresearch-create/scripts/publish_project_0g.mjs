#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import qrcode from "qrcode-terminal";
import SignClient from "@walletconnect/sign-client";
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
    --reown-project-id <project-id>

Notes:
  - Use --baseline-metric <decimal> --metric-scale <integer> instead of
    --baseline-aggregate-score when the benchmark output needs scaling.
  - Use --dry-run to validate and print calldata without connecting a wallet.
  - Use --unsigned-tx to write an unsigned transaction JSON instead of opening WalletConnect.
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
  if (!options.reownProjectId) {
    throw new Error("--reown-project-id is required for WalletConnect QR publishing");
  }

  const { createPublicClient, http } = await import("viem");
  const publicClient = createPublicClient({
    transport: http(deployment.network.rpcUrl),
  });

  const signClient = await SignClient.init({
    projectId: options.reownProjectId,
    metadata: {
      name: "Auto Research At Home",
      description: "Publish an Auto Research project to 0G Galileo",
      url: "https://github.com/Auto-Research-At-Home/skill",
      icons: [],
    },
  });

  const chain = `eip155:${deployment.network.chainId}`;
  const { uri, approval } = await signClient.connect({
    requiredNamespaces: {
      eip155: {
        methods: ["eth_sendTransaction"],
        chains: [chain],
        events: ["chainChanged", "accountsChanged"],
      },
    },
  });

  if (!uri) {
    throw new Error("WalletConnect did not return a pairing URI");
  }

  console.log("\nScan this QR code with your mobile wallet:\n");
  qrcode.generate(uri, { small: true });
  console.log("\nWaiting for wallet connection approval...\n");

  const session = await approval();
  const account = findConnectedAccount(session, chain);
  console.log(`Connected wallet: ${account}`);

  const txWithFrom = {
    ...txRequest,
    from: account,
  };

  try {
    const gas = await publicClient.estimateGas({
      account,
      to: txRequest.to,
      data: txRequest.data,
      value: 0n,
    });
    txWithFrom.gas = toHexQuantity((gas * 12n) / 10n);
  } catch (err) {
    console.warn(`Gas estimation failed; wallet will estimate gas: ${err.message}`);
  }

  console.log("\nRequesting wallet signature and broadcast...\n");
  const txHash = await signClient.request({
    topic: session.topic,
    chainId: chain,
    request: {
      method: "eth_sendTransaction",
      params: [txWithFrom],
    },
  });

  console.log(`Transaction submitted: ${txHash}`);
  console.log("Waiting for transaction receipt...");

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
    confirmations: 1,
  });
  if (receipt.status !== "success") {
    throw new Error(`transaction failed: ${txHash}`);
  }

  const event = await parseProjectCreated(receipt, registryAbi, registryConfig.address);
  const publishRecord = {
    chainId: deployment.network.chainId,
    rpcUrl: deployment.network.rpcUrl,
    projectRegistry: registryConfig.address,
    proposalLedger: deployment.contracts.ProposalLedger.address,
    verifierRegistry: deployment.contracts.VerifierRegistry.address,
    transactionHash: txHash,
    blockNumber: receipt.blockNumber?.toString(),
    from: account,
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

function findConnectedAccount(session, chain) {
  const accounts = session.namespaces?.eip155?.accounts || [];
  const prefix = `${chain}:`;
  const match = accounts.find((account) => account.startsWith(prefix));
  if (!match) {
    throw new Error(`wallet session did not approve ${chain}`);
  }
  return match.slice(prefix.length);
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`publish failed: ${err.message}`);
    process.exit(1);
  },
);
