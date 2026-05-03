import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileP = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SEND = path.join(ROOT, "autoresearch-mine", "scripts", "axl_sidechat_send.py");
const POLL = path.join(ROOT, "autoresearch-mine", "scripts", "axl_sidechat_poll.py");
const PYTHON = process.env.PYTHON || "python3";
const PEER = "ab".repeat(32);
const OUR_PEER = "cd".repeat(32);

function writeTrialJsonl(dir) {
  const file = path.join(dir, "trials.jsonl");
  fs.writeFileSync(
    file,
    `${JSON.stringify({
      schemaVersion: "1",
      trial_id: "trial-001",
      utc_timestamp: "2026-05-03T12:00:00Z",
      protocol_bundle_id: "proto-example",
      run_ok: true,
      primary_metric_name: "val_bpb",
      primary_metric_value: 2.41,
      direction: "minimize",
      beats_local_best: true,
      beats_network_best: false,
      stdout_log_path: ".autoresearch/mine/runs/trial-001/stdout.log",
      git_head_before: "abc1234",
      git_head_after: "def5678",
      harness_exit_code: 0,
      error: "",
      hypothesis: "Tune learning rate schedule.",
    })}\n`,
  );
  return file;
}

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve(`http://${addr.address}:${addr.port}`);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

test("AXL sidechat send builds miner experience from latest trial", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arah-axl-send-"));
  const recordFile = writeTrialJsonl(dir);

  const { stdout } = await execFileP(PYTHON, [
    SEND,
    "--record-file",
    recordFile,
    "--peer",
    PEER,
    "--miner-id",
    OUR_PEER,
    "--dry-run",
  ]);
  const parsed = JSON.parse(stdout);

  assert.deepEqual(parsed.peers, [PEER]);
  assert.equal(parsed.message.type, "MINER_EXPERIENCE");
  assert.equal(parsed.message.protocolBundleId, "proto-example");
  assert.equal(parsed.message.trialId, "trial-001");
  assert.equal(parsed.message.minerId, OUR_PEER);
  assert.equal(parsed.message.beatsLocalBest, true);
});

test("AXL sidechat send posts JSON to configured peers", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arah-axl-post-"));
  const recordFile = writeTrialJsonl(dir);
  const received = [];
  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/topology") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ our_public_key: OUR_PEER }));
      return;
    }
    if (req.method === "POST" && req.url === "/send") {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        const body = Buffer.concat(chunks);
        received.push({
          peer: req.headers["x-destination-peer-id"],
          body: JSON.parse(body.toString("utf8")),
        });
        res.setHeader("X-Sent-Bytes", String(body.length));
        res.end("OK");
      });
      return;
    }
    res.statusCode = 404;
    res.end("not found");
  });
  const axlApi = await listen(server);

  try {
    const { stdout } = await execFileP(PYTHON, [
      SEND,
      "--record-file",
      recordFile,
      "--peer",
      PEER,
      "--axl-api",
      axlApi,
    ]);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.failed.length, 0);
    assert.equal(parsed.sent.length, 1);
    assert.equal(received.length, 1);
    assert.equal(received[0].peer, PEER);
    assert.equal(received[0].body.minerId, OUR_PEER);
    assert.equal(received[0].body.metricValue, 2.41);
  } finally {
    await close(server);
  }
});

test("AXL sidechat poll appends received messages to JSONL", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arah-axl-poll-"));
  const sidechatFile = path.join(dir, "sidechat.jsonl");
  let recvCount = 0;
  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/recv") {
      recvCount += 1;
      if (recvCount > 1) {
        res.statusCode = 204;
        res.end();
        return;
      }
      res.setHeader("Content-Type", "application/json");
      res.setHeader("X-From-Peer-Id", PEER);
      res.end(JSON.stringify({
        schemaVersion: "1",
        type: "MINER_EXPERIENCE",
        trialId: "trial-remote",
        summary: "Remote trial improved local best.",
      }));
      return;
    }
    res.statusCode = 404;
    res.end("not found");
  });
  const axlApi = await listen(server);

  try {
    const { stdout } = await execFileP(PYTHON, [
      POLL,
      "--sidechat-file",
      sidechatFile,
      "--axl-api",
      axlApi,
      "--max-messages",
      "5",
    ]);
    assert.equal(JSON.parse(stdout).received, 1);
    const rows = fs.readFileSync(sidechatFile, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].fromPeerId, PEER);
    assert.equal(rows[0].trialId, "trial-remote");
    assert.match(rows[0].receivedAt, /Z$/);
  } finally {
    await close(server);
  }
});
