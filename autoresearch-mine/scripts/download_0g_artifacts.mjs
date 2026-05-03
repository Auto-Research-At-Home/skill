#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;
const DEFAULT_INDEXER_RPC = "https://indexer-storage-testnet-turbo.0g.ai";

function usage() {
  console.log(`Usage:
  node scripts/download_0g_artifacts.mjs \\
    --output-dir /tmp/arah-project/artifacts \\
    --protocol-root 0x... \\
    --repo-snapshot-root 0x... \\
    --benchmark-root 0x... \\
    --baseline-metrics-root 0x...

Options:
  --indexer-rpc <url>      0G Storage indexer RPC.
  --skip-existing          Reuse existing files.
  --no-proof               Disable download proof requests.

The root values must be 0G Storage root hashes. The script downloads each
artifact, recomputes the 0G Merkle root with ZgFile, and writes
download_0g_artifacts.json next to the files.`);
}

function parseArgs(argv) {
  const options = {};
  const boolKeys = new Set(["help", "skipExisting", "noProof"]);
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

function requireRoot(value, label) {
  if (!BYTES32_RE.test(String(value || ""))) {
    throw new Error(`${label} must be a 0x-prefixed bytes32 root hash`);
  }
  return value;
}

async function loadSdk() {
  try {
    return await import("@0gfoundation/0g-storage-ts-sdk");
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      "missing 0G Storage SDK. Run `npm install` in autoresearch-mine " +
        "or install @0gfoundation/0g-storage-ts-sdk and ethers near this script. " +
        `Import error: ${detail}`,
    );
  }
}

async function verifyRoot({ ZgFile, filePath, expectedRoot, label }) {
  const file = await ZgFile.fromFilePath(filePath);
  try {
    const [tree, treeErr] = await file.merkleTree();
    if (treeErr !== null || !tree?.rootHash()) {
      throw new Error(`failed to compute Merkle root for ${label}: ${treeErr}`);
    }
    const actual = tree.rootHash();
    if (actual.toLowerCase() !== expectedRoot.toLowerCase()) {
      throw new Error(`${label} root mismatch: downloaded ${actual} != expected ${expectedRoot}`);
    }
    return actual;
  } finally {
    await file.close();
  }
}

async function downloadOne({ indexer, ZgFile, label, root, filePath, proof, skipExisting }) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (!skipExisting || !fs.existsSync(filePath)) {
    console.log(`[0G Storage] downloading ${label}: ${root}`);
    const err = await indexer.download(root, filePath, proof);
    if (err !== null) {
      throw new Error(`0G download failed for ${label}: ${err.message}`);
    }
  } else {
    console.log(`[0G Storage] reusing ${label}: ${filePath}`);
  }
  const verifiedRoot = await verifyRoot({ ZgFile, filePath, expectedRoot: root, label });
  return {
    rootHash: verifiedRoot,
    path: path.resolve(filePath),
    sizeBytes: fs.statSync(filePath).size,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return 0;
  }

  const outputDir = path.resolve(options.outputDir || "arah-registry-artifacts");
  const indexerRpc = options.indexerRpc || process.env.ZG_STORAGE_INDEXER_RPC || DEFAULT_INDEXER_RPC;
  const proof = !options.noProof;
  const roots = {
    protocol: requireRoot(options.protocolRoot, "protocolRoot"),
    repoSnapshot: requireRoot(options.repoSnapshotRoot, "repoSnapshotRoot"),
    benchmark: requireRoot(options.benchmarkRoot, "benchmarkRoot"),
    baselineMetrics: requireRoot(options.baselineMetricsRoot, "baselineMetricsRoot"),
  };
  const outputs = {
    protocol: path.join(outputDir, "protocol.json"),
    repoSnapshot: path.join(outputDir, "repo-snapshot.tar"),
    benchmark: path.join(outputDir, "benchmark.tar"),
    baselineMetrics: path.join(outputDir, "baseline-metrics.log"),
  };

  const { Indexer, ZgFile } = await loadSdk();
  const indexer = new Indexer(indexerRpc);
  const artifacts = {};
  for (const [label, root] of Object.entries(roots)) {
    artifacts[label] = await downloadOne({
      indexer,
      ZgFile,
      label,
      root,
      filePath: outputs[label],
      proof,
      skipExisting: Boolean(options.skipExisting),
    });
  }

  const manifest = {
    indexerRpc,
    proof,
    artifacts,
  };
  const manifestPath = path.join(outputDir, "download_0g_artifacts.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(manifestPath);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`download failed: ${err.message}`);
    process.exit(1);
  },
);
