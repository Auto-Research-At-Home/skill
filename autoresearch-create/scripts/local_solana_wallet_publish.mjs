import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import { spawn } from "node:child_process";

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SIGNATURE_RE = /^[1-9A-HJ-NP-Za-km-z]{43,90}$/;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export function generateNonce(bytes = 16) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export async function startLocalSolanaWalletPublish({
  cluster,
  rpcUrl,
  programId,
  storageArtifacts = null,
  irysUploadPlan = null,
  artifactFiles = null,
  summary = null,
  instructionPlan = null,
  flow = "register-only",
  timeoutMs = DEFAULT_TIMEOUT_MS,
  open = true,
  logger = console,
  opener = openBrowser,
}) {
  const token = generateNonce(24);
  let connectedAddress = null;
  let resolveAccount;
  const accountReady = new Promise((resolve) => {
    resolveAccount = resolve;
  });

  const state = {
    instructionPlan,
    summary,
    storageArtifacts,
    irysUploadPlan,
    artifactFiles,
    progress: buildInitialProgress(flow),
    walletStatus: "",
  };

  let settled = false;
  let irysUploads = null;
  let resolveIrysUploads;
  let rejectIrysUploads;
  const irysUploadsReady = new Promise((resolve, reject) => {
    resolveIrysUploads = resolve;
    rejectIrysUploads = reject;
  });
  let resolveResult;
  let rejectResult;
  const result = new Promise((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  const server = http.createServer(async (req, res) => {
    try {
      const expectedPrefix = `/${token}`;
      if (
        !req.url?.startsWith(expectedPrefix) ||
        (req.url.length > expectedPrefix.length && req.url[expectedPrefix.length] !== "/")
      ) {
        sendText(res, 404, "not found");
        return;
      }
      if (!originAllowed(req)) {
        sendJson(res, 403, { error: "invalid origin" });
        return;
      }

      const route = req.url.slice(token.length + 1).split("?")[0] || "/";

      if (req.method === "GET" && (route === "/" || route === "/sign")) {
        sendHtml(res, renderSignPage());
        return;
      }
      if (req.method === "GET" && route === "/irys-bundles-shim.mjs") {
        sendJs(res, renderIrysBundlesShim());
        return;
      }
      if (req.method === "GET" && route === "/node-stream-shim.mjs") {
        sendJs(res, renderNodeStreamShim());
        return;
      }
      if (req.method === "GET" && route === "/node-crypto-shim.mjs") {
        sendJs(res, renderNodeCryptoShim());
        return;
      }
      if (req.method === "GET" && route === "/session") {
        sendJson(res, 200, {
          chain: { cluster, rpcUrl, programId: String(programId) },
          summary: normalizeJson(state.summary),
          storageArtifacts: normalizeJson(state.storageArtifacts),
          irysUploadPlan: normalizeJson(state.irysUploadPlan),
          instructionPlan: normalizeJson(state.instructionPlan),
          connectedAddress,
        });
        return;
      }
      if (req.method === "GET" && route.startsWith("/artifact/")) {
        sendArtifact(res, state.artifactFiles, route.slice("/artifact/".length));
        return;
      }
      if (req.method === "GET" && route === "/progress") {
        sendJson(res, 200, {
          progress: normalizeJson(state.progress),
          walletStatus: state.walletStatus || "",
        });
        return;
      }
      if (req.method === "POST" && route === "/account") {
        const body = await readJsonBody(req);
        const address = requireBase58(body.address, "address");
        connectedAddress = address;
        markStepStatus(state.progress, "connect", "done", { detail: address });
        const next = nextStepId(state.progress, "connect");
        if (next) {
          markStepStatus(state.progress, next, "active");
          state.progress.currentStepId = next;
        }
        resolveAccount(address);
        sendJson(res, 200, { ok: true });
        return;
      }
      if (req.method === "POST" && route === "/irys") {
        const body = await readJsonBody(req);
        const address = requireBase58(body.address, "address");
        if (connectedAddress !== address) {
          sendJson(res, 400, {
            error: "Irys upload sender did not match the connected wallet",
          });
          return;
        }
        if (!body.artifacts || typeof body.artifacts !== "object") {
          sendJson(res, 400, { error: "Irys upload result is missing artifacts" });
          return;
        }
        irysUploads = normalizeJson(body);
        markStepStatus(state.progress, "storage", "done", { detail: "Artifacts uploaded to Irys." });
        const next = nextStepId(state.progress, "storage");
        if (next) {
          markStepStatus(state.progress, next, "active");
          state.progress.currentStepId = next;
        }
        resolveIrysUploads(irysUploads);
        sendJson(res, 200, { ok: true });
        return;
      }
      if (req.method === "POST" && route === "/tx") {
        const body = await readJsonBody(req);
        const address = requireBase58(body.address, "address");
        if (connectedAddress !== address) {
          sendJson(res, 400, {
            error: "transaction sender did not match the connected wallet",
          });
          return;
        }
        const signature = requireSignature(body.signature);
        settleOnce(() => resolveResult({ address, signature }));
        sendJson(res, 200, { ok: true });
        return;
      }
      if (req.method === "POST" && route === "/error") {
        const body = await readJsonBody(req);
        const message = String(body.message || "wallet reported an error");
        const stepId = state.progress.currentStepId || "register";
        markStepStatus(state.progress, stepId, "error", { detail: message });
        state.walletStatus = message;
        if (stepId === "storage") {
          rejectIrysUploads(new Error(message));
        } else if (stepId === "register") {
          settleOnce(() => rejectResult(new Error(message)));
        }
        sendJson(res, 200, { ok: true });
        return;
      }

      sendText(res, 404, "not found");
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
  });

  const timeout = setTimeout(() => {
    settleOnce(() =>
      rejectResult(new Error("timed out waiting for browser wallet approval")),
    );
    rejectIrysUploads(new Error("timed out waiting for browser wallet approval"));
    server.close();
  }, timeoutMs);
  timeout.unref?.();

  await listen(server);
  const url = `${localOrigin(server)}/${token}/sign`;

  result.finally(() => {
    clearTimeout(timeout);
  }).catch(() => {});
  irysUploadsReady.catch(() => {});

  if (open) {
    try {
      opener(url);
    } catch (err) {
      logger.warn?.(`Could not open browser automatically: ${err.message}`);
    }
  }

  return {
    url,
    result,
    setInstructionPlan(plan) {
      state.instructionPlan = plan;
    },
    setSummary(nextSummary) {
      state.summary = nextSummary;
    },
    setStorageArtifacts(nextStorageArtifacts) {
      state.storageArtifacts = nextStorageArtifacts;
    },
    setIrysUploadPlan(nextIrysUploadPlan) {
      state.irysUploadPlan = nextIrysUploadPlan;
    },
    setArtifactFiles(nextArtifactFiles) {
      state.artifactFiles = nextArtifactFiles;
    },
    setStepStatus(stepId, status, detail) {
      markStepStatus(state.progress, stepId, status, detail ? { detail } : undefined);
      if (status === "active") {
        state.progress.currentStepId = stepId;
      }
    },
    setWalletStatus(message) {
      state.walletStatus = message || "";
    },
    setComplete(payload = {}) {
      for (const step of state.progress.steps) {
        if (step.status !== "error") step.status = "done";
      }
      state.progress.status = "complete";
      state.progress.completion = normalizeJson(payload);
      state.walletStatus = "";
    },
    waitForAccount() {
      return connectedAddress ? Promise.resolve(connectedAddress) : accountReady;
    },
    waitForIrysUploads() {
      return irysUploads ? Promise.resolve(irysUploads) : irysUploadsReady;
    },
    close({ delayMs = 0 } = {}) {
      clearTimeout(timeout);
      const closeNow = () => {
        try { server.close(); } catch { /* already closed */ }
      };
      if (delayMs > 0) {
        return new Promise((resolve) => {
          const t = setTimeout(() => { closeNow(); resolve(); }, delayMs);
          t.unref?.();
        });
      }
      closeNow();
      return Promise.resolve();
    },
  };

  function settleOnce(fn) {
    if (settled) return;
    settled = true;
    fn();
  }
}

export function openBrowser(url) {
  const platform = process.platform;
  const command =
    platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.unref();
}

function renderSignPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Auto Research Publish — Solana</title>
  <style>
    :root {
      color-scheme: light dark;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --bg: #f6f7f9;
      --fg: #17191c;
      --muted: #58606b;
      --card: #ffffff;
      --border: #d9dde3;
      --accent: #9945ff;
      --accent-2: #14f195;
      --accent-fg: #ffffff;
      --pending: #c5cdd9;
      --active: #9945ff;
      --done: #1f9e62;
      --error: #c52f2f;
      --shadow: 0 8px 30px rgb(21 24 28 / 8%);
      --pill-bg: #eef1f7;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0d1014;
        --fg: #eef1f5;
        --muted: #98a2b3;
        --card: #141820;
        --border: #2a313c;
        --accent: #b685ff;
        --accent-fg: #0d1014;
        --pending: #3c4452;
        --active: #b685ff;
        --done: #5fd49a;
        --error: #ff7c7c;
        --pill-bg: #1d232c;
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--fg);
      display: grid;
      place-items: start center;
      padding: 32px 16px 64px;
    }
    main { width: min(720px, 100%); position: relative; z-index: 1; }
    header { margin-bottom: 24px; }
    h1 { margin: 0 0 6px; font-size: 24px; line-height: 1.2; letter-spacing: -0.01em; }
    .subtitle { margin: 0; color: var(--muted); font-size: 14px; line-height: 1.5; }
    .pill {
      display: inline-flex; align-items: center; gap: 6px;
      background: var(--pill-bg); color: var(--muted);
      font-size: 12px; padding: 4px 10px; border-radius: 999px;
      margin-top: 12px;
    }
    .pill .dot {
      width: 6px; height: 6px; border-radius: 50%; background: var(--active);
      animation: pulse 1.6s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.6); opacity: 0.5; }
    }
    .steps { display: flex; flex-direction: column; gap: 12px; }
    .step {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 18px 18px 18px 56px;
      position: relative;
      box-shadow: var(--shadow);
    }
    .step.pending { opacity: 0.55; }
    .step.active { border-color: var(--active); }
    .step.error { border-color: var(--error); }
    .step-marker {
      position: absolute;
      left: 18px;
      top: 18px;
      width: 28px; height: 28px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      font-size: 13px;
      font-weight: 600;
      background: var(--pending);
      color: var(--card);
    }
    .step.active .step-marker { background: var(--active); color: var(--accent-fg); }
    .step.done .step-marker { background: var(--done); color: #fff; }
    .step.error .step-marker { background: var(--error); color: #fff; }
    .step.active .step-marker .num,
    .step.done .step-marker .num,
    .step.error .step-marker .num { display: none; }
    .step.active .step-marker::after {
      content: "";
      width: 14px; height: 14px;
      border: 2px solid currentColor;
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    .step.done .step-marker::after { content: "\\2713"; font-size: 16px; line-height: 1; }
    .step.error .step-marker::after { content: "!"; font-weight: 700; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .step-title { font-size: 16px; font-weight: 600; margin: 0 0 4px; }
    .step-detail { color: var(--muted); font-size: 13px; line-height: 1.5; word-break: break-word; }
    .step-detail code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; }
    .step-body { margin-top: 12px; }
    .wallet-row { display: flex; flex-wrap: wrap; gap: 8px; }
    button.wallet, button.primary, button.ghost {
      border-radius: 8px; font: inherit; padding: 10px 16px; cursor: pointer;
      transition: transform 0.05s ease, opacity 0.2s ease, background 0.2s ease;
    }
    button.wallet { border: 1px solid var(--border); background: var(--card); color: var(--fg); }
    button.wallet:hover:not(:disabled) { border-color: var(--accent); }
    button.primary { border: 1px solid var(--accent); background: var(--accent); color: var(--accent-fg); font-weight: 600; }
    button.primary:hover:not(:disabled) { transform: translateY(-1px); }
    button.ghost { border: 1px solid var(--border); background: transparent; color: var(--fg); }
    button:disabled { opacity: 0.4; cursor: not-allowed; }
    .wallet-status {
      margin-top: 12px;
      padding: 10px 12px;
      background: var(--pill-bg);
      border-radius: 8px;
      font-size: 13px;
      color: var(--muted);
      min-height: 38px;
      display: none;
    }
    .wallet-status.visible { display: block; }
    .wallet-status.error { color: var(--error); background: color-mix(in srgb, var(--error) 12%, transparent); }
    .success {
      background: var(--card);
      border: 1px solid var(--done);
      border-radius: 12px;
      padding: 24px;
      text-align: center;
      margin-bottom: 16px;
      box-shadow: var(--shadow);
    }
    .success h2 { margin: 0 0 8px; font-size: 22px; }
    .success p { margin: 0 0 12px; color: var(--muted); font-size: 14px; }
    .success .kv { display: grid; grid-template-columns: max-content 1fr; gap: 6px 12px; text-align: left; font-size: 13px; margin: 12px auto 0; max-width: 520px; }
    .success .kv dt { color: var(--muted); }
    .success .kv dd { margin: 0; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; word-break: break-all; }
    .summary { margin-top: 24px; }
    .summary summary { cursor: pointer; color: var(--muted); font-size: 13px; padding: 8px 0; }
    .summary pre {
      margin-top: 8px;
      max-height: 280px;
      overflow: auto;
      background: var(--card);
      border: 1px solid var(--border);
      padding: 14px;
      border-radius: 8px;
      font-size: 12px;
      line-height: 1.5;
    }
  </style>
</head>
<body>
<main>
  <header>
    <h1>Publish to Solana OpenResearch</h1>
    <p class="subtitle">Keep this page open while the CLI walks through each step. Each step shows what your wallet will be asked to do next.</p>
    <span class="pill" id="livePill"><span class="dot"></span> Listening for CLI updates</span>
  </header>
  <div id="successCard"></div>
  <div class="steps" id="steps"></div>
  <details class="summary">
    <summary>Show transaction details</summary>
    <pre id="summaryJson"></pre>
  </details>
</main>
<script type="importmap">
{
  "imports": {
    "https://esm.sh/@noble/curves/esm/": "https://esm.sh/@noble/curves@1.9.7/esm/",
    "https://esm.sh/@noble/hashes/esm/": "https://esm.sh/@noble/hashes@1.8.0/esm/",
    "https://esm.sh/@irys/bundles@0.0.5/es2022/bundles.mjs": "./irys-bundles-shim.mjs",
    "https://esm.sh/node/crypto.mjs": "./node-crypto-shim.mjs",
    "https://esm.sh/node/stream.mjs": "./node-stream-shim.mjs",
    "https://esm.sh/uuid/dist/esm-browser/": "https://esm.sh/uuid@8.3.2/dist/esm-browser/",
    "/@noble/curves/esm/": "https://esm.sh/@noble/curves@1.9.7/esm/",
    "/@noble/hashes/esm/": "https://esm.sh/@noble/hashes@1.8.0/esm/",
    "/@irys/bundles@0.0.5/es2022/bundles.mjs": "./irys-bundles-shim.mjs",
    "/node/crypto.mjs": "./node-crypto-shim.mjs",
    "/node/stream.mjs": "./node-stream-shim.mjs",
    "/uuid/dist/esm-browser/": "https://esm.sh/uuid@8.3.2/dist/esm-browser/"
  }
}
</script>
<script type="module">
const stepsEl = document.getElementById("steps");
const summaryJsonEl = document.getElementById("summaryJson");
const successCardEl = document.getElementById("successCard");
const livePillEl = document.getElementById("livePill");

const wallets = [];
let session = null;
let connectedWallet = null;
let connectedAddress = null;
let publishStarted = false;
let irysStarted = false;
let irysComplete = false;
let walletStatusMessage = "";
let walletStatusIsError = false;
let lastRenderKey = "";
let connection = null;
let solanaWeb3Promise = null;
let irysModulesPromise = null;

const bootProgress = {
  status: "in-progress",
  currentStepId: "connect",
  steps: [
    { id: "connect", label: "Connect your Solana wallet", status: "active", detail: "" },
  ],
};

function loadSolanaWeb3() {
  if (!solanaWeb3Promise) {
    solanaWeb3Promise = import("https://esm.sh/@solana/web3.js@1.95.4?bundle");
  }
  return solanaWeb3Promise;
}

async function loadIrysModules() {
  if (!irysModulesPromise) {
    irysModulesPromise = import("https://esm.sh/buffer@6.0.3?bundle")
      .then((bufferModule) => {
        if (!globalThis.Buffer) globalThis.Buffer = bufferModule.Buffer;
        return Promise.all([
          import("https://esm.sh/@irys/web-upload?bundle"),
          import("https://esm.sh/@irys/web-upload-solana@0.1.8?bundle&deps=@irys/bundles@0.0.5"),
        ]);
      })
      .then(([webUpload, webSolana]) => ({
        WebUploader: webUpload.WebUploader,
        WebSolana: webSolana.WebSolana,
      }));
  }
  return irysModulesPromise;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

function shortAddress(address) {
  if (!address || typeof address !== "string") return "";
  if (address.length < 14) return address;
  return address.slice(0, 6) + "…" + address.slice(-6);
}

function statusKey(progress) {
  if (!progress) return "init";
  return JSON.stringify({
    s: progress.status,
    c: progress.currentStepId,
    steps: progress.steps?.map((step) => ({ id: step.id, st: step.status })),
  });
}

function detailFor(step) {
  if (!step) return "";
  if (step.id === "connect") {
    if (step.status === "active") return "Pick an installed Solana wallet below (Phantom, Solflare, Backpack, or any Wallet Standard wallet).";
    if (step.status === "pending") return "Will activate once the page finishes loading.";
    if (step.status === "done") {
      return "Connected as <code>" + escapeHtml(shortAddress(step.detail) || connectedAddress || "") + "</code>";
    }
  }
  if (step.id === "register") {
    if (step.status === "active") return "Approve the OpenResearch createProject transaction in your wallet.";
    if (step.status === "done") return "Project registered on Solana.";
    if (step.status === "pending") return "Unlocks once artifact storage and instruction preparation finish.";
    if (step.status === "error") return step.detail ? escapeHtml(step.detail) : "Wallet rejected or transaction failed.";
  }
  if (step.id === "storage") {
    if (step.status === "active") return "Approve Irys funding if needed, then upload the protocol artifacts using your Solana wallet.";
    if (step.status === "done") return step.detail || "Artifacts uploaded to Irys.";
    if (step.status === "pending") return "Unlocks after wallet connection.";
    if (step.status === "error") return step.detail ? escapeHtml(step.detail) : "Irys upload failed.";
  }
  return step.detail ? escapeHtml(step.detail) : "";
}

function renderProgress(progress) {
  const key = statusKey(progress) + "::" + walletStatusMessage + "::" + walletStatusIsError;
  if (key === lastRenderKey) return;
  lastRenderKey = key;

  if (!progress) {
    stepsEl.innerHTML = '<div class="step pending"><div class="step-marker"><span class="num">1</span></div><h2 class="step-title">Loading…</h2></div>';
    return;
  }

  if (progress.status === "complete") {
    livePillEl.style.display = "none";
    renderSuccess(progress.completion);
  } else {
    livePillEl.style.display = "";
  }

  let html = "";
  progress.steps.forEach((step, index) => {
    const stepNum = index + 1;
    const cls = "step " + step.status;
    const detail = detailFor(step);
    let body = "";
    if (step.id === "connect" && step.status === "active") {
      body = '<div class="step-body" id="walletButtons"></div>';
    }
    if (step.status === "active" && walletStatusMessage) {
      body += '<div class="step-body wallet-status visible' + (walletStatusIsError ? ' error' : '') + '">' + escapeHtml(walletStatusMessage) + '</div>';
    } else if (walletStatusIsError && step.id === progress.currentStepId) {
      body += '<div class="step-body wallet-status visible error">' + escapeHtml(walletStatusMessage) + '</div>';
    }
    html += '<div class="' + cls + '">'
      + '<div class="step-marker"><span class="num">' + stepNum + '</span></div>'
      + '<h2 class="step-title">' + escapeHtml(step.label) + '</h2>'
      + (detail ? '<div class="step-detail">' + detail + '</div>' : '')
      + body
      + '</div>';
  });
  stepsEl.innerHTML = html;

  if (progress.currentStepId === "connect" && !connectedAddress) {
    renderProviders();
  }
}

let successRendered = false;
function renderSuccess(completion = {}) {
  if (successRendered) return;
  successRendered = true;
  const signature = completion.signature;
  const projectId = completion.projectId;
  const cluster = completion.cluster || (session && session.chain && session.chain.cluster);
  let kv = "";
  if (projectId !== undefined && projectId !== null) kv += '<dt>Project ID</dt><dd>' + escapeHtml(projectId) + '</dd>';
  if (signature) kv += '<dt>Signature</dt><dd>' + escapeHtml(signature) + '</dd>';
  if (cluster) kv += '<dt>Cluster</dt><dd>' + escapeHtml(cluster) + '</dd>';
  let explorer = "";
  if (signature && cluster) {
    const c = cluster === "mainnet-beta" ? "" : ("?cluster=" + encodeURIComponent(cluster));
    explorer = '<p><a target="_blank" rel="noopener" href="https://explorer.solana.com/tx/' + encodeURIComponent(signature) + c + '">View on Solana Explorer</a></p>';
  }
  successCardEl.innerHTML = '<div class="success">'
    + '<h2>Project published</h2>'
    + '<p>You can return to the CLI — it has the receipt.</p>'
    + (kv ? '<dl class="kv">' + kv + '</dl>' : '')
    + explorer
    + '</div>';
}

function setWalletStatus(text, isError = false) {
  walletStatusMessage = text || "";
  walletStatusIsError = !!isError;
  lastRenderKey = "";
  renderProgress(session?.progress);
}

function addWallet(name, connect) {
  if (wallets.some((w) => w.name === name)) return;
  wallets.push({ name, connect });
  renderProviders();
}

function renderProviders() {
  const host = document.getElementById("walletButtons");
  if (!host) return;
  host.innerHTML = "";
  const row = document.createElement("div");
  row.className = "wallet-row";
  if (wallets.length === 0) {
    const button = document.createElement("button");
    button.className = "wallet";
    button.textContent = "No Solana wallet detected";
    button.disabled = true;
    row.appendChild(button);
  } else {
    for (const item of wallets) {
      const button = document.createElement("button");
      button.className = "wallet";
      button.textContent = item.name;
      button.onclick = () => connectWith(item);
      row.appendChild(button);
    }
  }
  host.appendChild(row);
}

async function postJson(route, body) {
  const res = await fetch(route, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "request failed");
  return data;
}

async function connectWith(item) {
  try {
    const buttons = document.querySelectorAll("#walletButtons button");
    for (const button of buttons) button.disabled = true;
    setWalletStatus("Requesting wallet account from " + item.name + "…");
    const adapter = await item.connect();
    if (!adapter || !adapter.publicKey) throw new Error("wallet did not return a public key");
    connectedWallet = adapter;
    connectedAddress = adapter.publicKey.toBase58();
    await postJson("account", { address: connectedAddress });
    setWalletStatus("");
    pollSessionForInstruction();
  } catch (err) {
    setWalletStatus(err && err.message ? err.message : String(err), true);
    for (const button of document.querySelectorAll("#walletButtons button")) button.disabled = false;
  }
}

async function pollSessionForInstruction() {
  while (connectedWallet && !publishStarted) {
    try {
      const res = await fetch("session");
      session = await res.json();
      summaryJsonEl.textContent = JSON.stringify({
      summary: session.summary,
      storageArtifacts: session.storageArtifacts,
      irysUploadPlan: session.irysUploadPlan,
      instructionPlan: session.instructionPlan,
      }, null, 2);
      if (session.irysUploadPlan && !irysStarted && !irysComplete) {
        irysStarted = true;
        await uploadArtifactsToIrys(session.irysUploadPlan, session.chain);
        irysComplete = true;
        continue;
      }
      if (session.instructionPlan && session.instructionPlan.programId) {
        publishStarted = true;
        await submitTransaction(session.instructionPlan, session.chain);
        return;
      }
    } catch (err) {
      setWalletStatus(err && err.message ? err.message : String(err), true);
    }
    await sleep(1000);
  }
}

async function uploadArtifactsToIrys(plan, chain) {
  try {
    setWalletStatus("Connecting to Irys " + plan.network + "…");
    const { WebUploader, WebSolana } = await loadIrysModules();
    const adapter = walletAdapterForIrys();
    let uploader = WebUploader(WebSolana).withProvider(adapter);
    if (plan.network === "devnet" && typeof uploader.devnet === "function") {
      uploader = uploader.withRpc(chain.rpcUrl).devnet();
    }
    const irys = await uploader;
    const artifacts = {};
    for (const artifact of plan.artifacts || []) {
      setWalletStatus("Preparing Irys upload for " + artifact.name + "…");
      const res = await fetch(artifact.fetchPath);
      if (!res.ok) throw new Error("failed to fetch artifact " + artifact.name);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const expectedHash = String(artifact.sha256Bytes32 || "").toLowerCase();
      const actualHash = await sha256Bytes32(bytes);
      if (expectedHash && expectedHash !== actualHash) {
        throw new Error("artifact hash mismatch for " + artifact.name);
      }

      const price = await irys.getPrice(bytes.byteLength);
      const balance = typeof irys.getLoadedBalance === "function"
        ? await irys.getLoadedBalance()
        : await irys.getBalance();
      if (BigInt(balance.toString()) < BigInt(price.toString())) {
        setWalletStatus("Approve Irys funding for " + artifact.name + "…");
        await irys.fund(price);
      }

      setWalletStatus("Uploading " + artifact.name + " to Irys…");
      const payload = globalThis.Buffer ? globalThis.Buffer.from(bytes) : bytes;
      const receipt = await irys.upload(payload, { tags: artifact.tags || [] });
      artifacts[artifact.name] = {
        id: receipt.id,
        signature: receipt.signature,
        gatewayUri: (plan.gatewayUrl || "https://gateway.irys.xyz") + "/" + receipt.id,
        timestamp: new Date().toISOString(),
      };
    }
    await postJson("irys", { address: connectedAddress, artifacts });
    setWalletStatus("Irys uploads complete. Preparing Solana transaction…");
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    setWalletStatus(message, true);
    try { await postJson("error", { message }); } catch { /* ignore */ }
    throw err;
  }
}

function walletAdapterForIrys() {
  return {
    publicKey: connectedWallet.publicKey,
    connected: true,
    signTransaction: connectedWallet.signTransaction,
    signAllTransactions: connectedWallet.signAllTransactions,
    signMessage: connectedWallet.signMessage,
    sendTransaction: async (tx, conn, options) => {
      if (typeof connectedWallet.sendTransaction === "function") {
        return connectedWallet.sendTransaction(tx, conn, options);
      }
      if (typeof connectedWallet.signAndSendTransaction === "function") {
        const sent = await connectedWallet.signAndSendTransaction(tx);
        return typeof sent === "string" ? sent : sent.signature;
      }
      if (typeof connectedWallet.signTransaction !== "function") {
        throw new Error("wallet cannot send transactions for Irys funding");
      }
      const signed = await connectedWallet.signTransaction(tx);
      return conn.sendRawTransaction(signed.serialize(), options);
    },
  };
}

async function sha256Bytes32(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return "0x" + hex;
}

function decodeBase64(str) {
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function submitTransaction(plan, chain) {
  try {
    setWalletStatus("Building Solana transaction…");
    const {
      Connection,
      PublicKey,
      Transaction,
      TransactionInstruction,
    } = await loadSolanaWeb3();
    if (!connection) connection = new Connection(chain.rpcUrl, "confirmed");
    const programId = new PublicKey(plan.programId);
    const keys = plan.keys.map((k) => ({
      pubkey: new PublicKey(k.pubkey),
      isSigner: !!k.isSigner,
      isWritable: !!k.isWritable,
    }));
    const data = decodeBase64(plan.data);
    const ix = new TransactionInstruction({ programId, keys, data });
    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    const tx = new Transaction().add(ix);
    tx.feePayer = connectedWallet.publicKey;
    tx.recentBlockhash = blockhash;

    setWalletStatus("Approve the createProject transaction in your wallet…");
    let signature;
    if (typeof connectedWallet.signAndSendTransaction === "function") {
      const sent = await connectedWallet.signAndSendTransaction(tx);
      signature = typeof sent === "string" ? sent : sent.signature;
    } else if (typeof connectedWallet.signTransaction === "function") {
      const signed = await connectedWallet.signTransaction(tx);
      signature = await connection.sendRawTransaction(signed.serialize());
    } else {
      throw new Error("wallet does not expose signAndSendTransaction or signTransaction");
    }
    setWalletStatus("Transaction submitted. Waiting for confirmation…");
    await postJson("tx", { address: connectedAddress, signature });
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    setWalletStatus(message, true);
    try { await postJson("error", { message }); } catch { /* ignore */ }
  }
}

async function pollProgress() {
  while (true) {
    try {
      const res = await fetch("progress");
      if (res.ok) {
        const data = await res.json();
        const progress = data.progress;
        if (typeof data.walletStatus === "string" && data.walletStatus && !walletStatusIsError) {
          if (data.walletStatus !== walletStatusMessage) {
            walletStatusMessage = data.walletStatus;
            lastRenderKey = "";
          }
        }
        if (session) session.progress = progress;
        renderProgress(progress);
        if (progress?.status === "complete") {
          await sleep(1500);
        }
      }
    } catch { /* keep polling */ }
    await sleep(700);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---- wallet detection ------------------------------------------------------
function detectInjected() {
  const tryAdd = (name, getter) => {
    try {
      const provider = getter();
      if (!provider) return;
      addWallet(name, async () => {
        const result = await provider.connect();
        const publicKey = result?.publicKey || provider.publicKey;
        if (!publicKey) throw new Error(name + " did not return a public key");
        return {
          publicKey,
          signTransaction: provider.signTransaction?.bind(provider),
          signAllTransactions: provider.signAllTransactions?.bind(provider),
          signAndSendTransaction: provider.signAndSendTransaction?.bind(provider),
          sendTransaction: provider.sendTransaction?.bind(provider),
          signMessage: provider.signMessage?.bind(provider),
        };
      });
    } catch { /* skip */ }
  };
  tryAdd("Phantom", () => window.phantom?.solana?.isPhantom ? window.phantom.solana : (window.solana?.isPhantom ? window.solana : null));
  tryAdd("Solflare", () => window.solflare?.isSolflare ? window.solflare : null);
  tryAdd("Backpack", () => window.backpack?.isBackpack ? window.backpack : null);
  tryAdd("Glow", () => window.glow?.isGlow ? window.glow : null);
}

function registerWalletStandard() {
  // Wallet Standard discovery (https://github.com/wallet-standard/wallet-standard).
  function handleRegister(event) {
    const reg = event.detail;
    if (typeof reg !== "function") return;
    reg({
      register(wallet) {
        if (!wallet?.features) return () => {};
        const connectFeature = wallet.features["standard:connect"];
        const signAndSend = wallet.features["solana:signAndSendTransaction"];
        const signTx = wallet.features["solana:signTransaction"];
        const signMessage = wallet.features["solana:signMessage"];
        if (!connectFeature || (!signAndSend && !signTx)) return () => {};
        addWallet(wallet.name || "Wallet Standard", async () => {
          const { accounts } = await connectFeature.connect();
          const account = accounts && accounts[0];
          if (!account) throw new Error(wallet.name + " did not return an account");
          const { PublicKey } = await loadSolanaWeb3();
          const publicKey = new PublicKey(account.address);
          return {
            publicKey,
            signAndSendTransaction: signAndSend ? async (tx) => {
              const result = await signAndSend.signAndSendTransaction({
                transaction: tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
                account,
                chain: "solana:" + (session?.chain?.cluster || "devnet"),
              });
              const sig = result?.[0]?.signature;
              if (!sig) throw new Error("wallet did not return a signature");
              const bytes = new Uint8Array(sig);
              return { signature: bs58Encode(bytes) };
            } : undefined,
            signMessage: signMessage ? async (message) => {
              const result = await signMessage.signMessage({
                message,
                account,
              });
              return result?.[0]?.signature || result?.signature;
            } : undefined,
          };
        });
        return () => {};
      },
    });
  }
  window.addEventListener("wallet-standard:register-wallet", handleRegister);
  window.dispatchEvent(new Event("wallet-standard:app-ready"));
}

const BS58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function bs58Encode(bytes) {
  if (bytes.length === 0) return "";
  let zeroes = 0;
  while (zeroes < bytes.length && bytes[zeroes] === 0) zeroes++;
  const size = Math.floor((bytes.length - zeroes) * 138 / 100) + 1;
  const b58 = new Uint8Array(size);
  let length = 0;
  for (let i = zeroes; i < bytes.length; i++) {
    let carry = bytes[i];
    let j = 0;
    for (let k = size - 1; (carry !== 0 || j < length) && k >= 0; k--, j++) {
      carry += 256 * b58[k];
      b58[k] = carry % 58;
      carry = (carry / 58) | 0;
    }
    length = j;
  }
  let it = size - length;
  while (it < size && b58[it] === 0) it++;
  let str = "1".repeat(zeroes);
  for (; it < size; it++) str += BS58_ALPHABET[b58[it]];
  return str;
}

(async function init() {
  renderProgress(bootProgress);
  pollProgress();
  setTimeout(() => {
    detectInjected();
    registerWalletStandard();
    renderProviders();
  }, 200);
})();
</script>
</body>
</html>`;
}

function renderIrysBundlesShim() {
  return `export * from "https://esm.sh/@irys/bundles@0.0.5/es2022/bundles.mjs?shim-source";
export { default } from "https://esm.sh/@irys/bundles@0.0.5/es2022/bundles.mjs?shim-source";
export { default as ArweaveSigner } from "https://esm.sh/@irys/bundles@0.0.5/es2022/build/web/esm/src/signing/chains/ArweaveSigner.mjs";
`;
}

function renderNodeStreamShim() {
  return `class SimpleStream {
  constructor() {
    this.listeners = new Map();
  }
  on(type, fn) {
    const list = this.listeners.get(type) || [];
    list.push(fn);
    this.listeners.set(type, list);
    return this;
  }
  once(type, fn) {
    const onceFn = (...args) => {
      this.removeListener(type, onceFn);
      fn(...args);
    };
    return this.on(type, onceFn);
  }
  removeListener(type, fn) {
    const list = this.listeners.get(type) || [];
    this.listeners.set(type, list.filter((item) => item !== fn));
    return this;
  }
  emit(type, ...args) {
    for (const fn of this.listeners.get(type) || []) fn(...args);
    return true;
  }
  write(chunk) {
    this.emit("data", chunk);
    return true;
  }
  end(chunk) {
    if (chunk !== undefined) this.write(chunk);
    this.emit("end");
    return this;
  }
  read() {
    return null;
  }
  push(chunk) {
    if (chunk !== null && chunk !== undefined) this.emit("data", chunk);
    return true;
  }
  pipe(dest) {
    this.on("data", (chunk) => dest.write?.(chunk));
    this.on("end", () => dest.end?.());
    return dest;
  }
  destroy(err) {
    if (err) this.emit("error", err);
    this.emit("close");
  }
}
export class PassThrough extends SimpleStream {}
export class Transform extends SimpleStream {}
export class Readable extends SimpleStream {}
export class Writable extends SimpleStream {}
export default { PassThrough, Transform, Readable, Writable };
`;
}

function renderNodeCryptoShim() {
  return `import { sha256 } from "https://esm.sh/@noble/hashes@1.8.0/sha2?bundle";

function toBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (typeof value === "string") return new TextEncoder().encode(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return new Uint8Array(value || []);
}

function concatBytes(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export function createHash(algorithm) {
  const name = String(algorithm || "").toLowerCase();
  if (name !== "sha256") {
    throw new Error("Unsupported hash algorithm in browser shim: " + algorithm);
  }
  const chunks = [];
  return {
    update(value) {
      chunks.push(toBytes(value));
      return this;
    },
    digest(encoding) {
      const digest = sha256(concatBytes(chunks));
      if (encoding === "hex") {
        return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
      }
      if (encoding === "base64") {
        let binary = "";
        for (const byte of digest) binary += String.fromCharCode(byte);
        return btoa(binary);
      }
      return globalThis.Buffer ? globalThis.Buffer.from(digest) : digest;
    },
  };
}

export function randomBytes(size) {
  const bytes = new Uint8Array(Number(size));
  crypto.getRandomValues(bytes);
  return globalThis.Buffer ? globalThis.Buffer.from(bytes) : bytes;
}

export const constants = {
  RSA_PKCS1_PSS_PADDING: 6,
};

export function createSign() {
  throw new Error("createSign is not available in this browser shim");
}

export function createVerify() {
  throw new Error("createVerify is not available in this browser shim");
}

export default { constants, createHash, createSign, createVerify, randomBytes };
`;
}

function localOrigin(server) {
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = req.headers.host;
  return origin === `http://${host}`;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("request body is too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("request body must be JSON"));
      }
    });
    req.on("error", reject);
  });
}

function requireBase58(value, label) {
  if (!BASE58_RE.test(String(value))) {
    throw new Error(`${label} must be a base58-encoded Solana public key`);
  }
  return value;
}

function requireSignature(value) {
  if (!SIGNATURE_RE.test(String(value))) {
    throw new Error("signature must be a base58-encoded Solana transaction signature");
  }
  return value;
}

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function sendHtml(res, body) {
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

function sendJs(res, body) {
  res.writeHead(200, {
    "content-type": "application/javascript; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

function sendText(res, statusCode, body) {
  res.writeHead(statusCode, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

function sendArtifact(res, artifactFiles, rawName) {
  let name;
  try {
    name = decodeURIComponent(rawName);
  } catch {
    sendText(res, 400, "invalid artifact name");
    return;
  }
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) {
    sendText(res, 400, "invalid artifact name");
    return;
  }
  const artifact = artifactFiles?.[name];
  if (!artifact?.path || !fs.existsSync(artifact.path)) {
    sendText(res, 404, "artifact not found");
    return;
  }
  const stat = fs.statSync(artifact.path);
  res.writeHead(200, {
    "content-type": "application/octet-stream",
    "content-length": String(stat.size),
    "cache-control": "no-store",
    "x-sha256-bytes32": artifact.sha256Bytes32 || "",
  });
  fs.createReadStream(artifact.path).pipe(res);
}

function normalizeJson(value) {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value, (_key, item) => (
    typeof item === "bigint" ? item.toString() : item
  )));
}

function buildInitialProgress(flow) {
  const steps = [
    { id: "connect", label: "Connect your Solana wallet", status: "active", detail: "" },
  ];
  if (flow === "irys-register") {
    steps.push({ id: "storage", label: "Upload artifacts to Irys", status: "pending", detail: "" });
  }
  steps.push({ id: "register", label: "Sign & send createProject", status: "pending", detail: "" });
  return {
    flow: flow === "irys-register" ? "solana-irys-register" : "solana-register",
    status: "in-progress",
    currentStepId: "connect",
    steps,
    completion: null,
  };
}

function findStep(progress, stepId) {
  return progress?.steps?.find((step) => step.id === stepId) || null;
}

function markStepStatus(progress, stepId, status, extra = {}) {
  const step = findStep(progress, stepId);
  if (!step) return;
  step.status = status;
  if (typeof extra.detail === "string") step.detail = extra.detail;
}

function nextStepId(progress, currentId) {
  const steps = progress?.steps || [];
  const index = steps.findIndex((step) => step.id === currentId);
  if (index === -1) return null;
  for (let i = index + 1; i < steps.length; i += 1) {
    if (steps[i].status !== "done") return steps[i].id;
  }
  return null;
}
