import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const INTEGER_RE = /^-?[0-9]+$/;
const UINT_RE = /^[0-9]+$/;
export const DEFAULT_ZG_STORAGE_INDEXER_RPC =
  "https://indexer-storage-testnet-turbo.0g.ai";
export const DEFAULT_ZG_STORAGE_PRIVATE_KEY_ENV = "ZG_STORAGE_PRIVATE_KEY";

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function assertBytes32(value, label) {
  if (!BYTES32_RE.test(String(value))) {
    throw new Error(`${label} must be a 0x-prefixed bytes32 hex string`);
  }
  return value;
}

export function assertAddress(value, label) {
  if (!ADDRESS_RE.test(String(value))) {
    throw new Error(`${label} must be a 0x-prefixed 20-byte address`);
  }
  return value;
}

export function parseInt256(value, label) {
  const text = String(value);
  if (!INTEGER_RE.test(text)) {
    throw new Error(`${label} must be an integer`);
  }
  return BigInt(text);
}

export function parseUint256(value, label) {
  const text = String(value);
  if (!UINT_RE.test(text)) {
    throw new Error(`${label} must be an unsigned integer`);
  }
  return BigInt(text);
}

export function hashFileBytes32(filePath) {
  const bytes = fs.readFileSync(filePath);
  return `0x${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}

export function decimalMetricToScaledInt(metricValue, scaleFactor) {
  const metricText = String(metricValue);
  const scale = parseUint256(scaleFactor, "metric scale");
  const match = metricText.match(/^(-?)([0-9]+)(?:\.([0-9]+))?$/);
  if (!match) {
    throw new Error("baseline metric must be a decimal number");
  }

  const sign = match[1] === "-" ? -1n : 1n;
  const whole = BigInt(match[2]);
  const fractional = match[3] || "";
  const denominator = 10n ** BigInt(fractional.length);
  const numerator = (whole * denominator + BigInt(fractional || "0")) * scale;

  if (numerator % denominator !== 0n) {
    throw new Error(
      "baseline metric cannot be represented exactly with the provided metric scale",
    );
  }
  return sign * (numerator / denominator);
}

export function toHexQuantity(value) {
  const n = typeof value === "bigint" ? value : BigInt(value);
  if (n < 0n) {
    throw new Error("hex quantity cannot be negative");
  }
  return `0x${n.toString(16)}`;
}

export function bigintReplacer(_key, value) {
  return typeof value === "bigint" ? value.toString() : value;
}

export function normalizePath(baseDir, maybePath) {
  if (!maybePath) {
    return null;
  }
  return path.isAbsolute(maybePath) ? maybePath : path.resolve(baseDir, maybePath);
}

export function resolveHash({ explicitHash, artifactPath, label }) {
  if (explicitHash) {
    return assertBytes32(explicitHash, label);
  }
  if (!artifactPath) {
    throw new Error(`${label} requires either --${kebab(label)} or --${kebab(label)}-file`);
  }
  return hashFileBytes32(artifactPath);
}

function kebab(label) {
  return label.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).replace(/\s+/g, "-");
}

export function loadDeployment(deploymentPath) {
  const deployment = readJson(deploymentPath);
  const network = deployment.network || {};
  const contracts = deployment.contracts || {};
  if (network.chainId !== 16602) {
    throw new Error(`expected 0G Galileo chainId 16602, got ${network.chainId}`);
  }
  if (!network.rpcUrl) {
    throw new Error("deployment is missing network.rpcUrl");
  }
  assertAddress(contracts.ProjectRegistry?.address, "ProjectRegistry address");
  if (!contracts.ProjectRegistry?.artifact) {
    throw new Error("deployment is missing ProjectRegistry artifact path");
  }
  return deployment;
}

export function buildPublishArtifactPaths(options) {
  const protocolJson = normalizePath(process.cwd(), options.protocolJson);
  if (!protocolJson || !fs.existsSync(protocolJson)) {
    throw new Error("--protocol-json must point to an existing protocol.json");
  }

  const artifacts = {
    protocol: {
      hashOption: "protocolHash",
      fileOption: "protocolJson",
      path: protocolJson,
    },
    repoSnapshot: {
      hashOption: "repoSnapshotHash",
      fileOption: "repoSnapshotFile",
      path: normalizePath(process.cwd(), options.repoSnapshotFile),
    },
    benchmark: {
      hashOption: "benchmarkHash",
      fileOption: "benchmarkFile",
      path: normalizePath(process.cwd(), options.benchmarkFile),
    },
    baselineMetrics: {
      hashOption: "baselineMetricsHash",
      fileOption: "baselineMetricsFile",
      path: normalizePath(process.cwd(), options.baselineMetricsFile),
    },
  };

  for (const [name, artifact] of Object.entries(artifacts)) {
    if (!artifact.path) {
      throw new Error(`${name} artifact requires --${kebab(artifact.fileOption)}`);
    }
    if (!fs.existsSync(artifact.path)) {
      throw new Error(`${name} artifact file does not exist: ${artifact.path}`);
    }
  }

  return artifacts;
}

export function applyStorageRootHashes(options, storageArtifacts) {
  return {
    ...options,
    protocolHash: assertBytes32(storageArtifacts.protocol.rootHash, "protocolHash"),
    repoSnapshotHash: assertBytes32(
      storageArtifacts.repoSnapshot.rootHash,
      "repoSnapshotHash",
    ),
    benchmarkHash: assertBytes32(storageArtifacts.benchmark.rootHash, "benchmarkHash"),
    baselineMetricsHash: assertBytes32(
      storageArtifacts.baselineMetrics.rootHash,
      "baselineMetricsHash",
    ),
  };
}

export function storageIndexerRpc(options, deployment) {
  return (
    options.zgStorageIndexerRpc ||
    deployment.storage?.indexerRpc ||
    DEFAULT_ZG_STORAGE_INDEXER_RPC
  );
}

export function storagePrivateKeyEnv(options) {
  return options.zgStoragePrivateKeyEnv || DEFAULT_ZG_STORAGE_PRIVATE_KEY_ENV;
}

export async function prepare0gStorageArtifacts({
  artifactPaths,
  blockchainRpc,
  indexerRpc,
  signer,
  upload,
  onProgress,
  taskSize,
  expectedReplica,
}) {
  const { Indexer, ZgFile } = await import("@0gfoundation/0g-storage-ts-sdk");
  const indexer = new Indexer(indexerRpc);
  const artifacts = {};

  for (const [name, artifact] of Object.entries(artifactPaths)) {
    onProgress?.(`${upload ? "Uploading" : "Preparing"} ${name}: ${artifact.path}`);
    const file = await ZgFile.fromFilePath(artifact.path);
    try {
      const [tree, treeErr] = await file.merkleTree();
      if (treeErr !== null || !tree?.rootHash()) {
        throw new Error(`failed to compute 0G Merkle root for ${name}: ${treeErr}`);
      }

      const record = {
        path: artifact.path,
        sizeBytes: fs.statSync(artifact.path).size,
        sha256Bytes32: hashFileBytes32(artifact.path),
        rootHash: assertBytes32(tree.rootHash(), `${name} rootHash`),
      };

      if (upload) {
        const [tx, uploadErr] = await indexer.upload(
          file,
          blockchainRpc,
          signer,
          {
            tags: "0x",
            finalityRequired: true,
            taskSize: taskSize === undefined ? 1 : Number(taskSize),
            expectedReplica:
              expectedReplica === undefined ? 1 : Number(expectedReplica),
            skipTx: false,
            skipIfFinalized: true,
            onProgress: (message) => onProgress?.(`${name}: ${message}`),
          },
        );
        if (uploadErr !== null) {
          throw new Error(`0G Storage upload failed for ${name}: ${uploadErr.message}`);
        }
        Object.assign(record, normalizeStorageUploadResult(tx));
      }

      artifacts[name] = record;
    } finally {
      await file.close();
    }
  }

  return artifacts;
}

function normalizeStorageUploadResult(tx) {
  if (tx.rootHashes && tx.txHashes) {
    return {
      rootHashes: tx.rootHashes,
      txHashes: tx.txHashes,
      txSeqs: tx.txSeqs,
    };
  }

  return {
    txHash: tx.txHash,
    txSeq: tx.txSeq,
  };
}

export function buildCreateProjectInputs(options) {
  const protocolJson = normalizePath(process.cwd(), options.protocolJson);
  if (!protocolJson || !fs.existsSync(protocolJson)) {
    throw new Error("--protocol-json must point to an existing protocol.json");
  }

  const baselineAggregateScore =
    options.baselineAggregateScore !== undefined
      ? parseInt256(options.baselineAggregateScore, "baselineAggregateScore")
      : decimalMetricToScaledInt(options.baselineMetric, options.metricScale);

  const tokenName = requireNonEmpty(options.tokenName, "--token-name");
  const tokenSymbol = requireNonEmpty(options.tokenSymbol, "--token-symbol");

  return {
    protocolHash: resolveHash({
      explicitHash: options.protocolHash,
      artifactPath: protocolJson,
      label: "protocolHash",
    }),
    repoSnapshotHash: resolveHash({
      explicitHash: options.repoSnapshotHash,
      artifactPath: normalizePath(process.cwd(), options.repoSnapshotFile),
      label: "repoSnapshotHash",
    }),
    benchmarkHash: resolveHash({
      explicitHash: options.benchmarkHash,
      artifactPath: normalizePath(process.cwd(), options.benchmarkFile),
      label: "benchmarkHash",
    }),
    baselineAggregateScore,
    baselineMetricsHash: resolveHash({
      explicitHash: options.baselineMetricsHash,
      artifactPath: normalizePath(process.cwd(), options.baselineMetricsFile),
      label: "baselineMetricsHash",
    }),
    tokenName,
    tokenSymbol,
    basePrice: parseUint256(options.basePrice, "basePrice"),
    slope: parseUint256(options.slope, "slope"),
    minerPoolCap: parseUint256(options.minerPoolCap, "minerPoolCap"),
  };
}

function requireNonEmpty(value, flag) {
  if (!value || !String(value).trim()) {
    throw new Error(`${flag} is required`);
  }
  return String(value);
}

export function createProjectArgsFromInputs(inputs) {
  return [
    inputs.protocolHash,
    inputs.repoSnapshotHash,
    inputs.benchmarkHash,
    inputs.baselineAggregateScore,
    inputs.baselineMetricsHash,
    inputs.tokenName,
    inputs.tokenSymbol,
    inputs.basePrice,
    inputs.slope,
    inputs.minerPoolCap,
  ];
}

export function summarizeCreateProject(inputs, deployment, fromAddress = "(browser wallet after approval)") {
  const registry = deployment.contracts.ProjectRegistry.address;
  return {
    network: deployment.network.name,
    chainId: deployment.network.chainId,
    rpcUrl: deployment.network.rpcUrl,
    from: fromAddress,
    to: registry,
    method: "ProjectRegistry.createProject",
    args: {
      protocolHash: inputs.protocolHash,
      repoSnapshotHash: inputs.repoSnapshotHash,
      benchmarkHash: inputs.benchmarkHash,
      baselineAggregateScore: inputs.baselineAggregateScore,
      baselineMetricsHash: inputs.baselineMetricsHash,
      tokenName: inputs.tokenName,
      tokenSymbol: inputs.tokenSymbol,
      basePrice: inputs.basePrice,
      slope: inputs.slope,
      minerPoolCap: inputs.minerPoolCap,
    },
  };
}

export async function encodeCreateProjectCalldata(projectRegistryAbi, inputs) {
  const { encodeFunctionData } = await import("viem");
  return encodeFunctionData({
    abi: projectRegistryAbi,
    functionName: "createProject",
    args: createProjectArgsFromInputs(inputs),
  });
}

export async function parseProjectCreated(receipt, projectRegistryAbi, projectRegistryAddress) {
  const { decodeEventLog } = await import("viem");
  const registry = projectRegistryAddress.toLowerCase();

  for (const log of receipt.logs || []) {
    if (String(log.address).toLowerCase() !== registry) {
      continue;
    }
    try {
      const decoded = decodeEventLog({
        abi: projectRegistryAbi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "ProjectCreated") {
        return {
          projectId: decoded.args.projectId.toString(),
          creator: decoded.args.creator,
          tokenAddr: decoded.args.token,
          protocolHash: decoded.args.protocolHash,
        };
      }
    } catch {
      // Ignore unrelated registry logs.
    }
  }

  throw new Error("transaction receipt did not include ProjectCreated event");
}

export function parseArgs(argv) {
  const options = {};
  const boolKeys = new Set([
    "yes",
    "dryRun",
    "unsignedTx",
    "help",
    "noOpen",
    "uploadArtifactsTo0g",
    "storageOnly",
  ]);
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
