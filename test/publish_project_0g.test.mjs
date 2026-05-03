import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  applyStorageRootHashes,
  assertBytes32,
  buildPublishArtifactPaths,
  buildCreateProjectInputs,
  createProjectArgsFromInputs,
  decimalMetricToScaledInt,
  encodeCreateProjectCalldata,
  hashFileBytes32,
  loadDeployment,
  parseArgs,
  parseProjectCreated,
  storageIndexerRpc,
  toHexQuantity,
} from "../autoresearch-create/scripts/publish_project_0g_lib.mjs";
import {
  buildApprovalMessage,
  buildSiweMessage,
  calldataDigest,
  startLocalWalletPublish,
  verifySiweSignature,
} from "../autoresearch-create/scripts/local_wallet_publish.mjs";

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

test("uses 0G Storage root hashes as createProject hashes when supplied", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arah-publish-"));
  const protocolJson = path.join(dir, "protocol.json");
  const repo = path.join(dir, "repo.tar");
  const benchmark = path.join(dir, "benchmark.tar");
  const baseline = path.join(dir, "baseline.log");
  fs.writeFileSync(protocolJson, "{}\n");
  fs.writeFileSync(repo, "repo");
  fs.writeFileSync(benchmark, "bench");
  fs.writeFileSync(baseline, "metric=1");

  const options = {
    protocolJson,
    repoSnapshotFile: repo,
    benchmarkFile: benchmark,
    baselineMetricsFile: baseline,
    baselineAggregateScore: "7",
    tokenName: "Research Token",
    tokenSymbol: "RCH",
    basePrice: "100",
    slope: "2",
    minerPoolCap: "1000000",
  };

  const storageOptions = applyStorageRootHashes(options, {
    protocol: { rootHash: `0x${"11".repeat(32)}` },
    repoSnapshot: { rootHash: `0x${"22".repeat(32)}` },
    benchmark: { rootHash: `0x${"33".repeat(32)}` },
    baselineMetrics: { rootHash: `0x${"44".repeat(32)}` },
  });
  const inputs = buildCreateProjectInputs(storageOptions);

  assert.equal(inputs.protocolHash, `0x${"11".repeat(32)}`);
  assert.equal(inputs.repoSnapshotHash, `0x${"22".repeat(32)}`);
  assert.equal(inputs.benchmarkHash, `0x${"33".repeat(32)}`);
  assert.equal(inputs.baselineMetricsHash, `0x${"44".repeat(32)}`);
});

test("plans publish artifact files for 0G Storage upload", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arah-publish-"));
  const protocolJson = path.join(dir, "protocol.json");
  const repo = path.join(dir, "repo.tar");
  const benchmark = path.join(dir, "benchmark.tar");
  const baseline = path.join(dir, "baseline.log");
  for (const file of [protocolJson, repo, benchmark, baseline]) {
    fs.writeFileSync(file, "x");
  }

  const artifacts = buildPublishArtifactPaths({
    protocolJson,
    repoSnapshotFile: repo,
    benchmarkFile: benchmark,
    baselineMetricsFile: baseline,
  });

  assert.equal(artifacts.protocol.path, protocolJson);
  assert.equal(artifacts.repoSnapshot.path, repo);
  assert.equal(artifacts.benchmark.path, benchmark);
  assert.equal(artifacts.baselineMetrics.path, baseline);
});

test("loads the 0G Galileo deployment manifest", () => {
  const deployment = loadDeployment(DEPLOYMENT);
  assert.equal(deployment.network.chainId, 16602);
  assert.equal(
    deployment.contracts.ProjectRegistry.address,
    "0xc84768e450534974C0DD5BAb7c1b695744124136",
  );
  assert.equal(
    storageIndexerRpc({}, deployment),
    "https://indexer-storage-testnet-turbo.0g.ai",
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
  assert.deepEqual(parseArgs(["--yes", "--no-open", "--upload-artifacts-to-0g", "--token-name", "T"]), {
    yes: true,
    noOpen: true,
    uploadArtifactsTo0g: true,
    tokenName: "T",
  });
  assert.equal(toHexQuantity(16602), "0x40da");
  assert.throws(() => toHexQuantity(-1), /negative/);
});

test("builds SIWE-style publish approval messages", () => {
  const message = buildSiweMessage({
    domain: "127.0.0.1:49152",
    address: "0x1111111111111111111111111111111111111111",
    statement: "Approve publishing this project.",
    uri: "http://127.0.0.1:49152/session/sign",
    chainId: 16602,
    nonce: "abc123",
    issuedAt: "2026-05-03T00:00:00.000Z",
    expirationTime: "2026-05-03T00:05:00.000Z",
    resources: ["urn:arah:chain:16602"],
  });

  assert.match(message, /wants you to sign in with your Ethereum account/);
  assert.match(message, /Chain ID: 16602/);
  assert.match(message, /Nonce: abc123/);
  assert.match(message, /Resources:\n- urn:arah:chain:16602/);
});

test("verifies SIWE-style signatures against the approving wallet", async () => {
  const { privateKeyToAccount } = await import("viem/accounts");
  const account = privateKeyToAccount(
    "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  );
  const message = buildSiweMessage({
    domain: "127.0.0.1:49152",
    address: account.address,
    statement: "Approve publishing this project.",
    uri: "http://127.0.0.1:49152/session/sign",
    chainId: 16602,
    nonce: "abc123",
    issuedAt: "2026-05-03T00:00:00.000Z",
  });
  const signature = await account.signMessage({ message });

  assert.equal(await verifySiweSignature({ message, address: account.address, signature }), true);
  assert.equal(
    await verifySiweSignature({
      message,
      address: "0x1111111111111111111111111111111111111111",
      signature,
    }),
    false,
  );
});

test("builds publish approval resources from deployment and transaction", () => {
  const deployment = loadDeployment(DEPLOYMENT);
  const summary = {
    args: {
      protocolHash: `0x${"ab".repeat(32)}`,
    },
  };
  const txRequest = {
    to: deployment.contracts.ProjectRegistry.address,
    data: "0x1234",
    chainId: "0x40da",
    value: "0x0",
  };
  const message = buildApprovalMessage({
    address: "0x1111111111111111111111111111111111111111",
    deployment,
    nonce: "nonce",
    issuedAt: "2026-05-03T00:00:00.000Z",
    expirationTime: "2026-05-03T00:05:00.000Z",
    txRequest,
    summary,
    origin: "http://127.0.0.1:49152",
    token: "session",
  });

  assert.match(message, /urn:arah:project-registry:0xc84768e450534974C0DD5BAb7c1b695744124136/);
  assert.match(message, new RegExp(`urn:arah:create-project-calldata-sha256:${calldataDigest("0x1234").slice(2)}`));
  assert.match(message, /urn:arah:protocol-hash:abab/);
});

test("local wallet publish server verifies approval before accepting tx hash", async () => {
  const { privateKeyToAccount } = await import("viem/accounts");
  const account = privateKeyToAccount(
    "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  );
  const deployment = loadDeployment(DEPLOYMENT);
  const txRequest = {
    to: deployment.contracts.ProjectRegistry.address,
    data: "0x1234",
    chainId: "0x40da",
    value: "0x0",
  };
  const summary = {
    network: deployment.network.name,
    chainId: deployment.network.chainId,
    args: {
      protocolHash: `0x${"ab".repeat(32)}`,
    },
  };
  const session = await startLocalWalletPublish({
    txRequest,
    deployment,
    summary,
    open: false,
    timeoutMs: 30_000,
  });

  try {
    const sessionResponse = await fetch(`${session.url.replace("/sign", "/session")}`);
    assert.equal(sessionResponse.status, 200);
    const sessionJson = await sessionResponse.json();
    assert.equal(sessionJson.chain.chainId, "0x40da");
    assert.equal(sessionJson.txRequest.to, txRequest.to);

    const txBeforeApproval = await postJson(`${session.url.replace("/sign", "/tx")}`, {
      address: account.address,
      signature: "0x1234",
      message: "wrong",
      txHash: `0x${"12".repeat(32)}`,
    });
    assert.equal(txBeforeApproval.status, 400);
    assert.match(txBeforeApproval.body.error, /message does not match/);

    const messageResponse = await postJson(`${session.url.replace("/sign", "/message")}`, {
      address: account.address,
    });
    assert.equal(messageResponse.status, 200);
    const { message } = messageResponse.body;
    const signature = await account.signMessage({ message });

    const approvalResponse = await postJson(`${session.url.replace("/sign", "/approve")}`, {
      address: account.address,
      signature,
      message,
    });
    assert.equal(approvalResponse.status, 200);

    const txHash = `0x${"34".repeat(32)}`;
    const txResponse = await postJson(`${session.url.replace("/sign", "/tx")}`, {
      address: account.address,
      signature,
      message,
      txHash,
    });
    assert.equal(txResponse.status, 200);

    assert.deepEqual(await session.result, {
      address: account.address,
      signature,
      message,
      txHash,
    });
  } finally {
    session.close();
  }
});

test("local wallet publish server bridges wallet RPC requests", async () => {
  const deployment = loadDeployment(DEPLOYMENT);
  const session = await startLocalWalletPublish({
    deployment,
    open: false,
    timeoutMs: 30_000,
  });

  try {
    const accountPromise = session.eip1193Provider.request({
      method: "eth_requestAccounts",
    });
    const accountResponse = await postJson(`${session.url.replace("/sign", "/account")}`, {
      address: "0x1111111111111111111111111111111111111111",
    });
    assert.equal(accountResponse.status, 200);
    assert.deepEqual(await accountPromise, [
      "0x1111111111111111111111111111111111111111",
    ]);

    const txPromise = session.eip1193Provider.request({
      method: "eth_sendTransaction",
      params: [{ to: deployment.contracts.ProjectRegistry.address, value: "0x0" }],
    });
    const requestResponse = await fetch(`${session.url.replace("/sign", "/wallet-request")}`);
    assert.equal(requestResponse.status, 200);
    const { request } = await requestResponse.json();
    assert.equal(request.method, "eth_sendTransaction");
    assert.equal(request.params[0].to, deployment.contracts.ProjectRegistry.address);

    const txHash = `0x${"56".repeat(32)}`;
    const resultResponse = await postJson(`${session.url.replace("/sign", "/wallet-result")}`, {
      id: request.id,
      result: txHash,
    });
    assert.equal(resultResponse.status, 200);
    assert.equal(await txPromise, txHash);
  } finally {
    session.close();
  }
});

test("local wallet publish server exposes progress and step transitions", async () => {
  const deployment = loadDeployment(DEPLOYMENT);
  const session = await startLocalWalletPublish({
    deployment,
    flow: "storage+register",
    open: false,
    timeoutMs: 30_000,
  });

  try {
    const initial = await (await fetch(`${session.url.replace("/sign", "/progress")}`)).json();
    assert.equal(initial.progress.flow, "storage+register");
    assert.equal(initial.progress.status, "in-progress");
    assert.deepEqual(
      initial.progress.steps.map((step) => step.id),
      ["connect", "storage", "register"],
    );
    const storageStep = initial.progress.steps.find((step) => step.id === "storage");
    assert.equal(storageStep.items.length, 4);

    const accountResponse = await postJson(`${session.url.replace("/sign", "/account")}`, {
      address: "0x1111111111111111111111111111111111111111",
    });
    assert.equal(accountResponse.status, 200);

    const afterConnect = await (await fetch(`${session.url.replace("/sign", "/progress")}`)).json();
    const connectStep = afterConnect.progress.steps.find((step) => step.id === "connect");
    assert.equal(connectStep.status, "done");
    assert.equal(connectStep.detail, "0x1111111111111111111111111111111111111111");
    assert.equal(afterConnect.progress.currentStepId, "storage");

    session.setStepStatus("storage", "active");
    session.setStepItemStatus("storage", "protocol", "active");
    session.setStepItemStatus("storage", "protocol", "done", "root 0xabcd");
    const midUpload = await (await fetch(`${session.url.replace("/sign", "/progress")}`)).json();
    const protocolItem = midUpload.progress.steps
      .find((step) => step.id === "storage")
      .items.find((item) => item.id === "protocol");
    assert.equal(protocolItem.status, "done");
    assert.equal(protocolItem.detail, "root 0xabcd");

    session.setComplete({ txHash: `0x${"ab".repeat(32)}`, projectId: "42", tokenAddr: "0x2222222222222222222222222222222222222222" });
    const finalProgress = await (await fetch(`${session.url.replace("/sign", "/progress")}`)).json();
    assert.equal(finalProgress.progress.status, "complete");
    assert.equal(finalProgress.progress.completion.projectId, "42");
    for (const step of finalProgress.progress.steps) {
      assert.equal(step.status, "done");
    }
  } finally {
    await session.close();
  }
});

test("publish refuses on-chain createProject when storage was skipped", () => {
  const options = parseArgs([
    "--protocol-json", "/tmp/x.json",
    "--token-name", "T",
    "--token-symbol", "T",
    "--base-price", "1",
    "--slope", "1",
    "--miner-pool-cap", "1",
    "--baseline-aggregate-score", "1",
    "--yes",
  ]);
  assert.equal(options.uploadArtifactsTo0g, undefined);
  assert.equal(options.allowSkipStorage, undefined);
  assert.equal(options.dryRun, undefined);
  assert.equal(options.unsignedTx, undefined);
});

test("publish parseArgs accepts --allow-skip-storage", () => {
  const options = parseArgs(["--allow-skip-storage", "--yes"]);
  assert.equal(options.allowSkipStorage, true);
  assert.equal(options.yes, true);
});

test("local wallet publish server rejects cross-origin posts", async () => {
  const deployment = loadDeployment(DEPLOYMENT);
  const session = await startLocalWalletPublish({
    txRequest: {
      to: deployment.contracts.ProjectRegistry.address,
      data: "0x1234",
      chainId: "0x40da",
      value: "0x0",
    },
    deployment,
    summary: {},
    open: false,
    timeoutMs: 30_000,
  });

  try {
    const response = await fetch(`${session.url.replace("/sign", "/message")}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://evil.example",
      },
      body: JSON.stringify({
        address: "0x1111111111111111111111111111111111111111",
      }),
    });
    assert.equal(response.status, 403);
  } finally {
    session.close();
  }
});

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: await response.json(),
  };
}
