#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;
const DEFAULT_DEVNET_GATEWAY = "https://devnet.irys.xyz";
const DEFAULT_MAINNET_GATEWAY = "https://gateway.irys.xyz";

function usage() {
  console.log(`Usage:
  node scripts/download_irys_artifacts.mjs \\
    --output-dir /tmp/arah-project/artifacts \\
    --protocol-hash 0x... \\
    --repo-snapshot-hash 0x... \\
    --benchmark-hash 0x... \\
    --baseline-metrics-hash 0x...

Options:
  --gateway-url <url>      Irys gateway (default: devnet gateway).
  --network <devnet|mainnet>
  --manifest <path>        Optional storage_irys.json from publish.
  --skip-existing          Reuse existing files after SHA-256 verification.

The hash values are raw SHA-256 bytes32 values stored by the Solana
OpenResearch project account. This script downloads matching Irys objects,
verifies SHA-256(file bytes), and writes download_irys_artifacts.json.`);
}

function parseArgs(argv) {
  const options = {};
  const boolKeys = new Set(["help", "skipExisting"]);
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

function requireBytes32(value, label) {
  if (!BYTES32_RE.test(String(value || ""))) {
    throw new Error(`${label} must be a 0x-prefixed bytes32 SHA-256 hash`);
  }
  return String(value).toLowerCase();
}

function gatewayFor(options) {
  if (options.gatewayUrl) return String(options.gatewayUrl).replace(/\/+$/, "");
  if (String(options.network || "").toLowerCase() === "mainnet") {
    return DEFAULT_MAINNET_GATEWAY;
  }
  return DEFAULT_DEVNET_GATEWAY;
}

function sha256Bytes32(filePath) {
  const h = crypto.createHash("sha256");
  h.update(fs.readFileSync(filePath));
  return `0x${h.digest("hex")}`;
}

async function fetchJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "autoresearch-mine",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Irys GraphQL request failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = JSON.parse(text);
  if (data.errors?.length) {
    throw new Error(`Irys GraphQL error: ${JSON.stringify(data.errors)}`);
  }
  return data;
}

function idFromManifest(manifest, name) {
  const artifact = manifest?.artifacts?.[name];
  return artifact?.irys?.id || artifact?.id || null;
}

async function findIrysId({ gatewayUrl, name, hash, manifest }) {
  const fromManifest = idFromManifest(manifest, name);
  if (fromManifest) return fromManifest;

  const hashNoPrefix = hash.slice(2);
  const query = `
    query($tags: [TagFilter!]) {
      transactions(tags: $tags, first: 10) {
        edges { node { id tags { name value } } }
      }
    }
  `;
  const variables = {
    tags: [
      { name: "App-Name", values: ["OpenResearch AutoResearch"] },
      { name: "Artifact-Role", values: [name] },
      { name: "SHA-256", values: [hashNoPrefix] },
    ],
  };
  const data = await fetchJson(`${gatewayUrl}/graphql`, { query, variables });
  const edges = data?.data?.transactions?.edges || [];
  const id = edges[0]?.node?.id;
  if (!id) {
    throw new Error(`no Irys transaction found for ${name} hash ${hash}`);
  }
  return id;
}

async function downloadOne({ gatewayUrl, name, hash, filePath, manifest, skipExisting }) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const id = await findIrysId({ gatewayUrl, name, hash, manifest });
  const uri = `${gatewayUrl}/${id}`;
  if (!skipExisting || !fs.existsSync(filePath)) {
    console.log(`[Irys] downloading ${name}: ${uri}`);
    const res = await fetch(uri, { headers: { "user-agent": "autoresearch-mine" } });
    if (!res.ok) {
      throw new Error(`Irys download failed for ${name} (${res.status})`);
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    fs.writeFileSync(filePath, bytes);
  } else {
    console.log(`[Irys] reusing ${name}: ${filePath}`);
  }

  const actual = sha256Bytes32(filePath);
  if (actual !== hash) {
    throw new Error(`${name} SHA-256 mismatch: downloaded ${actual} != expected ${hash}`);
  }
  return {
    id,
    gatewayUri: uri,
    sha256Bytes32: actual,
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

  const outputDir = path.resolve(options.outputDir || "arah-irys-artifacts");
  const gatewayUrl = gatewayFor(options);
  const manifest = options.manifest
    ? JSON.parse(fs.readFileSync(path.resolve(options.manifest), "utf8"))
    : null;
  const hashes = {
    protocol: requireBytes32(options.protocolHash, "protocolHash"),
    repoSnapshot: requireBytes32(options.repoSnapshotHash, "repoSnapshotHash"),
    benchmark: requireBytes32(options.benchmarkHash, "benchmarkHash"),
    baselineMetrics: requireBytes32(options.baselineMetricsHash, "baselineMetricsHash"),
  };
  const outputs = {
    protocol: path.join(outputDir, "protocol.json"),
    repoSnapshot: path.join(outputDir, "repo-snapshot.tar"),
    benchmark: path.join(outputDir, "benchmark.tar"),
    baselineMetrics: path.join(outputDir, "baseline-metrics.log"),
  };

  const artifacts = {};
  for (const [name, hash] of Object.entries(hashes)) {
    artifacts[name] = await downloadOne({
      gatewayUrl,
      name,
      hash,
      filePath: outputs[name],
      manifest,
      skipExisting: Boolean(options.skipExisting),
    });
  }

  const manifestPath = path.join(outputDir, "download_irys_artifacts.json");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({ gatewayUrl, artifacts }, null, 2) + "\n",
  );
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
