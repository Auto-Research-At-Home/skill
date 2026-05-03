import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertBytes32,
  buildCreateProjectInputs,
  createProjectArgsFromInputs,
  decimalMetricToScaledInt,
  encodeCreateProjectCalldata,
  hashFileBytes32,
  loadDeployment,
  parseArgs,
  parseProjectCreated,
  toHexQuantity,
} from "../autoresearch-create/scripts/publish_project_0g_lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEPLOYMENT = path.join(
  ROOT,
  "autoresearch-create",
  "contracts",
  "0g-galileo-testnet",
  "deployment.json",
);
const REGISTRY_ARTIFACT = path.join(
  ROOT,
  "autoresearch-create",
  "contracts",
  "0g-galileo-testnet",
  "artifacts",
  "ProjectRegistry.json",
);

test("validates bytes32 inputs", () => {
  assert.equal(
    assertBytes32(`0x${"ab".repeat(32)}`, "hash"),
    `0x${"ab".repeat(32)}`,
  );
  assert.throws(() => assertBytes32("0x1234", "hash"), /bytes32/);
});

test("hashes files as bytes32 SHA-256 digests", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arah-publish-"));
  const file = path.join(dir, "artifact.txt");
  fs.writeFileSync(file, "hello\n");
  assert.match(hashFileBytes32(file), /^0x[0-9a-f]{64}$/);
  assert.equal(
    hashFileBytes32(file),
    "0x5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03",
  );
});

test("scales decimal metrics exactly", () => {
  assert.equal(decimalMetricToScaledInt("12.345", "1000"), 12345n);
  assert.equal(decimalMetricToScaledInt("-0.25", "100"), -25n);
  assert.throws(
    () => decimalMetricToScaledInt("0.001", "100"),
    /cannot be represented exactly/,
  );
});

test("builds createProject args from files and explicit values", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arah-publish-"));
  const protocolJson = path.join(dir, "protocol.json");
  const repo = path.join(dir, "repo.tar");
  const benchmark = path.join(dir, "benchmark.tar");
  const baseline = path.join(dir, "baseline.log");
  fs.writeFileSync(protocolJson, "{}\n");
  fs.writeFileSync(repo, "repo");
  fs.writeFileSync(benchmark, "bench");
  fs.writeFileSync(baseline, "metric=1");

  const oldCwd = process.cwd();
  process.chdir(dir);
  try {
    const inputs = buildCreateProjectInputs({
      protocolJson,
      repoSnapshotFile: repo,
      benchmarkFile: benchmark,
      baselineMetricsFile: baseline,
      baselineMetric: "1.25",
      metricScale: "100",
      tokenName: "Research Token",
      tokenSymbol: "RCH",
      basePrice: "100",
      slope: "2",
      minerPoolCap: "1000000",
    });

    assert.match(inputs.protocolHash, /^0x[0-9a-f]{64}$/);
    assert.equal(inputs.baselineAggregateScore, 125n);
    assert.deepEqual(createProjectArgsFromInputs(inputs).slice(5), [
      "Research Token",
      "RCH",
      100n,
      2n,
      1000000n,
    ]);
  } finally {
    process.chdir(oldCwd);
  }
});

test("loads the 0G Galileo deployment manifest", () => {
  const deployment = loadDeployment(DEPLOYMENT);
  assert.equal(deployment.network.chainId, 16602);
  assert.equal(
    deployment.contracts.ProjectRegistry.address,
    "0xc84768e450534974C0DD5BAb7c1b695744124136",
  );
});

test("encodes createProject calldata with the bundled ABI", async () => {
  const artifact = JSON.parse(fs.readFileSync(REGISTRY_ARTIFACT, "utf8"));
  const inputs = {
    protocolHash: `0x${"01".repeat(32)}`,
    repoSnapshotHash: `0x${"02".repeat(32)}`,
    benchmarkHash: `0x${"03".repeat(32)}`,
    baselineAggregateScore: -7n,
    baselineMetricsHash: `0x${"04".repeat(32)}`,
    tokenName: "Research Token",
    tokenSymbol: "RCH",
    basePrice: 100n,
    slope: 2n,
    minerPoolCap: 1000000n,
  };
  const calldata = await encodeCreateProjectCalldata(artifact.abi, inputs);
  assert.match(calldata, /^0x[a-f0-9]+$/);
  assert.equal(calldata.slice(0, 10), "0xc9892888");
});

test("parses ProjectCreated from a receipt", async () => {
  const { encodeEventTopics, encodeAbiParameters } = await import("viem");
  const artifact = JSON.parse(fs.readFileSync(REGISTRY_ARTIFACT, "utf8"));
  const deployment = loadDeployment(DEPLOYMENT);
  const registry = deployment.contracts.ProjectRegistry.address;
  const protocolHash = `0x${"aa".repeat(32)}`;
  const creator = "0x1111111111111111111111111111111111111111";
  const token = "0x2222222222222222222222222222222222222222";
  const projectId = 42n;

  const eventAbi = artifact.abi.find((item) => item.type === "event" && item.name === "ProjectCreated");
  const topics = encodeEventTopics({
    abi: [eventAbi],
    eventName: "ProjectCreated",
    args: { projectId, creator },
  });
  const data = encodeAbiParameters(
    [
      { type: "address", name: "token" },
      { type: "bytes32", name: "protocolHash" },
    ],
    [token, protocolHash],
  );

  const parsed = await parseProjectCreated(
    { logs: [{ address: registry, topics, data }] },
    artifact.abi,
    registry,
  );

  assert.deepEqual(parsed, {
    projectId: "42",
    creator,
    tokenAddr: token,
    protocolHash,
  });
});

test("parses CLI flags and quantities", () => {
  assert.deepEqual(parseArgs(["--yes", "--token-name", "T"]), {
    yes: true,
    tokenName: "T",
  });
  assert.equal(toHexQuantity(16602), "0x40da");
  assert.throws(() => toHexQuantity(-1), /negative/);
});
