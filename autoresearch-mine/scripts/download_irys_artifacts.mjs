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
    --protocol-irys-id <id> \\
    --repo-snapshot-hash 0x... \\
    --repo-snapshot-irys-id <id> \\
    --benchmark-hash 0x... \\
    --benchmark-irys-id <id> \\
    --baseline-metrics-hash 0x... \\
    --baseline-metrics-irys-id <id>

  node scripts/download_irys_artifacts.mjs \\
    --output-dir /tmp/arah-proposal/artifacts \\
    --code-hash 0x... \\
    --code-irys-id <id> \\
    --benchmark-log-hash 0x... \\
    --benchmark-log-irys-id <id>

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

function normalizeIrysId(value, label) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (BYTES32_RE.test(text)) {
    const hex = text.startsWith("0x") ? text.slice(2) : text;
    return Buffer.from(hex, "hex")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }
  const normalized = text.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const decoded = Buffer.from(padded, "base64");
  if (decoded.length !== 32) {
    throw new Error(`${label} must be a 32-byte Irys/Arweave transaction id`);
  }
  return text;
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

async function findIrysId({ gatewayUrl, name, hash, irysId, manifest }) {
  if (irysId) return normalizeIrysId(irysId, `${name}IrysId`);
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

async function downloadOne({ gatewayUrl, name, hash, irysId, filePath, manifest, skipExisting }) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const id = await findIrysId({ gatewayUrl, name, hash, irysId, manifest });
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
  const specs = [];
  if (options.protocolHash) {
    specs.push(
      {
        name: "protocol",
        hash: requireBytes32(options.protocolHash, "protocolHash"),
        irysId: options.protocolIrysId,
        output: path.join(outputDir, "protocol.json"),
      },
      {
        name: "repoSnapshot",
        hash: requireBytes32(options.repoSnapshotHash, "repoSnapshotHash"),
        irysId: options.repoSnapshotIrysId,
        output: path.join(outputDir, "repo-snapshot.tar"),
      },
      {
        name: "benchmark",
        hash: requireBytes32(options.benchmarkHash, "benchmarkHash"),
        irysId: options.benchmarkIrysId,
        output: path.join(outputDir, "benchmark.tar"),
      },
      {
        name: "baselineMetrics",
        hash: requireBytes32(options.baselineMetricsHash, "baselineMetricsHash"),
        irysId: options.baselineMetricsIrysId,
        output: path.join(outputDir, "baseline-metrics.log"),
      },
    );
  }
  if (options.codeHash) {
    specs.push(
      {
        name: "code",
        hash: requireBytes32(options.codeHash, "codeHash"),
        irysId: options.codeIrysId,
        output: path.join(outputDir, "code.tar"),
      },
      {
        name: "benchmarkLog",
        hash: requireBytes32(options.benchmarkLogHash, "benchmarkLogHash"),
        irysId: options.benchmarkLogIrysId,
        output: path.join(outputDir, "benchmark.log"),
      },
    );
  }
  if (options.metricsHash) {
    specs.push({
      name: "metrics",
      hash: requireBytes32(options.metricsHash, "metricsHash"),
      irysId: options.metricsIrysId,
      output: path.join(outputDir, "metrics.log"),
    });
  }
  if (specs.length === 0) {
    throw new Error("provide either project artifact hashes or proposal artifact hashes");
  }

  const artifacts = {};
  for (const spec of specs) {
    artifacts[spec.name] = await downloadOne({
      gatewayUrl,
      name: spec.name,
      hash: spec.hash,
      irysId: spec.irysId,
      filePath: spec.output,
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
