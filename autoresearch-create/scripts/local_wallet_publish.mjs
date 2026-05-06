import crypto from "node:crypto";
import http from "node:http";
import { spawn } from "node:child_process";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export function generateNonce(bytes = 16) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function calldataDigest(data) {
  return `0x${crypto.createHash("sha256").update(String(data || "")).digest("hex")}`;
}

export function buildSiweMessage({
  domain,
  address,
  statement,
  uri,
  version = "1",
  chainId,
  nonce,
  issuedAt,
  expirationTime,
  resources = [],
}) {
  assertAddress(address, "address");
  const lines = [
    `${domain} wants you to sign in with your Ethereum account:`,
    address,
    "",
    statement,
    "",
    `URI: ${uri}`,
    `Version: ${version}`,
    `Chain ID: ${chainId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ];

  if (expirationTime) {
    lines.push(`Expiration Time: ${expirationTime}`);
  }
  if (resources.length > 0) {
    lines.push("Resources:");
    for (const resource of resources) {
      lines.push(`- ${resource}`);
    }
  }
  return lines.join("\n");
}

export async function verifySiweSignature({ message, address, signature }) {
  assertAddress(address, "address");
  const { getAddress, verifyMessage } = await import("viem");
  const expected = getAddress(address);
  const ok = await verifyMessage({
    address: expected,
    message,
    signature,
  });
  return ok;
}

export async function startLocalWalletPublish({
  txRequest = null,
  deployment,
  summary = null,
  storageArtifacts = null,
  flow = "register-only",
  timeoutMs = DEFAULT_TIMEOUT_MS,
  open = true,
  logger = console,
  opener = openBrowser,
}) {
  const token = generateNonce(24);
  const nonce = generateNonce();
  const issuedAt = new Date().toISOString();
  const expirationTime = new Date(Date.now() + timeoutMs).toISOString();
  const messagesByAddress = new Map();
  const approvedSignatures = new Map();
  const pendingWalletRequests = new Map();
  let nextWalletRequestId = 1;
  let connectedAddress = null;
  let resolveAccount;
  const accountReady = new Promise((resolve) => {
    resolveAccount = resolve;
  });
  const state = {
    txRequest,
    summary,
    storageArtifacts,
    progress: buildInitialProgress(flow),
    walletStatus: "",
  };

  let settled = false;
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
      if (req.method === "GET" && route === "/session") {
        sendJson(res, 200, {
          chain: chainConfig(deployment),
          summary: normalizeJson(state.summary),
          txRequest: normalizeJson(state.txRequest),
          storageArtifacts: normalizeJson(state.storageArtifacts),
          connectedAddress,
        });
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
        const address = normalizeAddress(body.address);
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
      if (req.method === "GET" && route === "/wallet-request") {
        const next = Array.from(pendingWalletRequests.values()).find(
          (item) => item.status === "pending",
        );
        if (!next) {
          sendJson(res, 200, { request: null });
          return;
        }
        next.status = "sent";
        sendJson(res, 200, {
          request: {
            id: next.id,
            label: next.label,
            method: next.method,
            params: normalizeJson(next.params),
          },
        });
        return;
      }
      if (req.method === "POST" && route === "/wallet-result") {
        const body = await readJsonBody(req);
        const id = Number(body.id);
        const pending = pendingWalletRequests.get(id);
        if (!pending) {
          sendJson(res, 404, { error: "unknown wallet request" });
          return;
        }
        pendingWalletRequests.delete(id);
        if (body.error) {
          pending.reject(new Error(String(body.error)));
        } else {
          pending.resolve(body.result);
        }
        sendJson(res, 200, { ok: true });
        return;
      }
      if (req.method === "POST" && route === "/message") {
        const body = await readJsonBody(req);
        const address = normalizeAddress(body.address);
        if (!state.txRequest || !state.summary) {
          sendJson(res, 409, { error: "publish transaction is not ready yet" });
          return;
        }
        const message = buildApprovalMessage({
          address,
          deployment,
          nonce,
          issuedAt,
          expirationTime,
          txRequest: state.txRequest,
          summary: state.summary,
          origin: localOrigin(server),
          token,
        });
        messagesByAddress.set(address.toLowerCase(), message);
        sendJson(res, 200, { message });
        return;
      }
      if (req.method === "POST" && route === "/approve") {
        const body = await readJsonBody(req);
        const address = normalizeAddress(body.address);
        const message = requireKnownMessage(messagesByAddress, address, body.message);
        const verified = await verifySiweSignature({
          message,
          address,
          signature: requireString(body.signature, "signature"),
        });
        if (!verified) {
          sendJson(res, 400, { error: "signature did not recover the requested address" });
          return;
        }
        approvedSignatures.set(address.toLowerCase(), body.signature);
        sendJson(res, 200, { ok: true });
        return;
      }
      if (req.method === "POST" && route === "/tx") {
        const body = await readJsonBody(req);
        const address = normalizeAddress(body.address);
        const message = requireKnownMessage(messagesByAddress, address, body.message);
        const signature = requireString(body.signature, "signature");
        const approved = approvedSignatures.get(address.toLowerCase());
        if (approved !== signature) {
          sendJson(res, 400, { error: "address has not approved this publish message" });
          return;
        }
        const txHash = requireTxHash(body.txHash);
        settleOnce(() => resolveResult({ address, signature, message, txHash }));
        sendJson(res, 200, { ok: true });
        return;
      }

      sendText(res, 404, "not found");
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
  });

  const timeout = setTimeout(() => {
    settleOnce(() => rejectResult(new Error("timed out waiting for browser wallet approval")));
    server.close();
  }, timeoutMs);
  timeout.unref?.();

  await listen(server);
  const url = `${localOrigin(server)}/${token}/sign`;

  result.finally(() => {
    clearTimeout(timeout);
  }).catch(() => {});

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
    setPublishRequest({ txRequest: nextTxRequest, summary: nextSummary }) {
      state.txRequest = nextTxRequest;
      state.summary = nextSummary;
    },
    setStorageArtifacts(nextStorageArtifacts) {
      state.storageArtifacts = nextStorageArtifacts;
    },
    setFlow(nextFlow) {
      state.progress = buildInitialProgress(nextFlow);
      if (connectedAddress) {
        markStepStatus(state.progress, "connect", "done", { detail: connectedAddress });
        const next = nextStepId(state.progress, "connect");
        if (next) {
          markStepStatus(state.progress, next, "active");
          state.progress.currentStepId = next;
        }
      }
    },
    setStepStatus(stepId, status, detail) {
      markStepStatus(state.progress, stepId, status, detail ? { detail } : undefined);
      if (status === "active") {
        state.progress.currentStepId = stepId;
      }
    },
    setStepItemStatus(stepId, itemId, status, detail) {
      markStepItemStatus(state.progress, stepId, itemId, status, detail ? { detail } : undefined);
    },
    setWalletStatus(message) {
      state.walletStatus = message || "";
    },
    setComplete(payload = {}) {
      for (const step of state.progress.steps) {
        if (step.status !== "error") {
          step.status = "done";
          if (Array.isArray(step.items)) {
            for (const item of step.items) {
              if (item.status !== "error") item.status = "done";
            }
          }
        }
      }
      state.progress.status = "complete";
      state.progress.completion = normalizeJson(payload);
      state.walletStatus = "";
    },
    waitForAccount() {
      return connectedAddress ? Promise.resolve(connectedAddress) : accountReady;
    },
    eip1193Provider: {
      request: async ({ method, params = [] }) => {
        if (method === "eth_chainId") {
          return `0x${BigInt(deployment.network.chainId).toString(16)}`;
        }
        if (method === "net_version") {
          return String(deployment.network.chainId);
        }
        if (method === "eth_accounts" || method === "eth_requestAccounts") {
          const address = await (connectedAddress
            ? Promise.resolve(connectedAddress)
            : accountReady);
          return [address];
        }
        if (isWalletHandledMethod(method)) {
          await (connectedAddress ? Promise.resolve(connectedAddress) : accountReady);
          return requestBrowserWallet({ method, params });
        }
        return rpcRequest(deployment.network.rpcUrl, method, params);
      },
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
    if (settled) {
      return;
    }
    settled = true;
    fn();
  }

  function requestBrowserWallet({ method, params, label }) {
    const id = nextWalletRequestId++;
    const request = {
      id,
      method,
      params,
      label: label || walletMethodLabel(method),
      status: "pending",
    };
    const promise = new Promise((resolve, reject) => {
      request.resolve = resolve;
      request.reject = reject;
    });
    pendingWalletRequests.set(id, request);
    return promise;
  }
}

function isWalletHandledMethod(method) {
  return (
    method === "eth_sendTransaction" ||
    method === "personal_sign" ||
    method === "eth_sign" ||
    method === "eth_signTypedData" ||
    method === "eth_signTypedData_v4"
  );
}

function walletMethodLabel(method) {
  if (method === "eth_sendTransaction") {
    return "Confirm transaction";
  }
  if (method === "personal_sign" || method === "eth_sign") {
    return "Sign message";
  }
  return method;
}

async function rpcRequest(rpcUrl, method, params) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params,
    }),
  });
  if (!response.ok) {
    throw new Error(`RPC ${method} failed with HTTP ${response.status}`);
  }
  const payload = await response.json();
  if (payload.error) {
    throw new Error(`RPC ${method} failed: ${payload.error.message}`);
  }
  return payload.result;
}

export function buildApprovalMessage({
  address,
  deployment,
  nonce,
  issuedAt,
  expirationTime,
  txRequest,
  summary,
  origin,
  token,
}) {
  const registry = deployment.contracts.ProjectRegistry.address;
  const protocolHash = summary?.args?.protocolHash;
  const digest = calldataDigest(txRequest.data);
  const uri = `${origin}/${token}/sign`;
  return buildSiweMessage({
    domain: new URL(origin).host,
    address,
    statement:
      "Approve publishing this Auto Research project to the 0G Galileo registry. This signature does not submit the transaction; your wallet will ask separately before broadcasting.",
    uri,
    chainId: deployment.network.chainId,
    nonce,
    issuedAt,
    expirationTime,
    resources: [
      `urn:arah:chain:${deployment.network.chainId}`,
      `urn:arah:project-registry:${registry}`,
      `urn:arah:create-project-calldata-sha256:${digest.slice(2)}`,
      ...(protocolHash ? [`urn:arah:protocol-hash:${protocolHash.slice(2)}`] : []),
    ],
  });
}

export function openBrowser(url) {
  const platform = process.platform;
  const command =
    platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

function renderSignPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Auto Research Publish</title>
  <style>
    :root {
      color-scheme: light dark;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --bg: #f6f7f9;
      --fg: #17191c;
      --muted: #58606b;
      --card: #ffffff;
      --border: #d9dde3;
      --accent: #2451d6;
      --accent-fg: #ffffff;
      --pending: #c5cdd9;
      --active: #2451d6;
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
        --accent: #6f8cff;
        --accent-fg: #0d1014;
        --pending: #3c4452;
        --active: #6f8cff;
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
      transition: opacity 0.2s ease;
    }
    .step.pending { opacity: 0.55; }
    .step.active { border-color: var(--active); }
    .step.done { }
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
      flex-shrink: 0;
    }
    .step.active .step-marker { background: var(--active); color: var(--accent-fg); }
    .step.done .step-marker { background: var(--done); color: #fff; }
    .step.error .step-marker { background: var(--error); color: #fff; }
    .step.active .step-marker .num { display: none; }
    .step.active .step-marker::after {
      content: "";
      width: 14px; height: 14px;
      border: 2px solid currentColor;
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    .step.done .step-marker .num { display: none; }
    .step.done .step-marker::after { content: "\\2713"; font-size: 16px; line-height: 1; }
    .step.error .step-marker .num { display: none; }
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
    .items { list-style: none; padding: 0; margin: 12px 0 0; display: flex; flex-direction: column; gap: 8px; }
    .item {
      display: flex; align-items: center; gap: 10px;
      font-size: 13px;
      padding: 8px 10px;
      border-radius: 8px;
      background: var(--bg);
      border: 1px solid var(--border);
    }
    .item-marker {
      width: 16px; height: 16px; border-radius: 50%;
      background: var(--pending);
      flex-shrink: 0;
      display: grid; place-items: center;
      color: #fff; font-size: 10px;
    }
    .item.active .item-marker { background: transparent; border: 2px solid var(--active); border-top-color: transparent; animation: spin 0.8s linear infinite; }
    .item.done .item-marker { background: var(--done); }
    .item.done .item-marker::after { content: "\\2713"; }
    .item.error .item-marker { background: var(--error); }
    .item.error .item-marker::after { content: "!"; font-weight: 700; }
    .item-label { flex: 1; }
    .item-status { color: var(--muted); font-size: 12px; }
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
    .success .kv { display: grid; grid-template-columns: max-content 1fr; gap: 6px 12px; text-align: left; font-size: 13px; margin: 12px auto 0; max-width: 480px; }
    .success .kv dt { color: var(--muted); }
    .success .kv dd { margin: 0; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; word-break: break-all; }
    .buy {
      margin-top: 16px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 22px;
      box-shadow: var(--shadow);
    }
    .buy h3 { margin: 0 0 4px; font-size: 17px; }
    .buy .lede { margin: 0 0 16px; color: var(--muted); font-size: 13px; line-height: 1.5; }
    .preset-row { display: flex; flex-wrap: wrap; gap: 8px; }
    button.preset { border: 1px solid var(--border); background: var(--card); color: var(--fg); border-radius: 8px; padding: 9px 14px; font: inherit; cursor: pointer; }
    button.preset.selected { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); }
    .buy-divider { display: flex; align-items: center; gap: 12px; margin: 14px 0; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
    .buy-divider::before, .buy-divider::after { content: ""; flex: 1; height: 1px; background: var(--border); }
    .buy-input { display: flex; align-items: center; gap: 8px; }
    .buy-input input {
      flex: 1; min-width: 0;
      border: 1px solid var(--border); border-radius: 8px;
      padding: 10px 12px; font: inherit; background: var(--card); color: var(--fg);
    }
    .buy-input input:focus { outline: none; border-color: var(--accent); }
    .buy-input .unit { color: var(--muted); font-weight: 600; }
    .quote {
      margin-top: 14px;
      padding: 12px 14px;
      border-radius: 8px;
      background: var(--bg);
      border: 1px dashed var(--border);
      font-size: 13px;
      min-height: 40px;
    }
    .quote.muted { color: var(--muted); }
    .quote.error { border-style: solid; border-color: var(--error); color: var(--error); background: color-mix(in srgb, var(--error) 8%, transparent); }
    .quote .big { font-size: 18px; font-weight: 600; color: var(--fg); }
    .quote small { color: var(--muted); }
    .buy-actions { display: flex; gap: 8px; margin-top: 14px; }
    .buy-actions button.primary { flex: 1; }
    .buy-result {
      margin-top: 14px;
      padding: 12px 14px;
      border-radius: 8px;
      background: color-mix(in srgb, var(--done) 10%, transparent);
      border: 1px solid var(--done);
      font-size: 13px;
      word-break: break-all;
      display: none;
    }
    .buy-result.visible { display: block; }
    .buy-result.error { background: color-mix(in srgb, var(--error) 10%, transparent); border-color: var(--error); color: var(--error); }
    .summary {
      margin-top: 24px;
    }
    .summary summary {
      cursor: pointer;
      color: var(--muted);
      font-size: 13px;
      padding: 8px 0;
    }
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
    canvas#confetti {
      position: fixed; inset: 0; pointer-events: none; z-index: 10;
    }
  </style>
</head>
<body>
<canvas id="confetti"></canvas>
<main>
  <header>
    <h1>Publish to 0G Galileo</h1>
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
<script>
const stepsEl = document.getElementById("steps");
const summaryJsonEl = document.getElementById("summaryJson");
const successCardEl = document.getElementById("successCard");
const livePillEl = document.getElementById("livePill");
const providers = [];
let session;
let progress = null;
let connectedProvider;
let connectedAddress;
let publishStarted = false;
let walletPollStarted = false;
let progressPollStarted = false;
let walletStatusMessage = "";
let walletStatusIsError = false;
let confettiFired = false;

function statusKey(progress) {
  if (!progress) return "init";
  return JSON.stringify({ s: progress.status, c: progress.currentStepId, steps: progress.steps?.map((step) => ({ id: step.id, st: step.status, items: step.items?.map((it) => [it.id, it.status]) })) });
}

let lastRenderKey = "";
let lastWalletStatus = "";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

function shortAddress(address) {
  if (!address || typeof address !== "string") return "";
  if (address.length < 14) return address;
  return address.slice(0, 8) + "…" + address.slice(-6);
}

function detailFor(step) {
  if (!step) return "";
  if (step.id === "connect") {
    if (step.status === "active") return "Pick an installed wallet extension below.";
    if (step.status === "pending") return "Will activate once the page finishes loading.";
    if (step.status === "done") {
      return "Connected as <code>" + escapeHtml(shortAddress(step.detail) || connectedAddress || "") + "</code>";
    }
  }
  if (step.id === "storage") {
    if (step.status === "active") return "Approve a wallet transaction for each artifact below.";
    if (step.status === "done") return "All artifacts uploaded to 0G Storage.";
    if (step.status === "pending") return "Waits for the wallet connection.";
  }
  if (step.id === "register") {
    if (step.status === "active") return "Sign the publish approval, then approve the registry transaction.";
    if (step.status === "done") return "Project registered.";
    if (step.status === "pending") return "Unlocks after artifacts upload.";
  }
  return step.detail ? escapeHtml(step.detail) : "";
}

function renderProgress() {
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
    if (!confettiFired) { fireConfetti(); confettiFired = true; }
  } else {
    livePillEl.style.display = "";
    successCardEl.innerHTML = "";
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
    if (step.id === "connect" && step.status !== "active" && walletStatusIsError) {
      body = '<div class="step-body wallet-status visible error">' + escapeHtml(walletStatusMessage) + '</div>';
    } else if (step.status === "active" && walletStatusMessage) {
      body = '<div class="step-body wallet-status visible' + (walletStatusIsError ? ' error' : '') + '">' + escapeHtml(walletStatusMessage) + '</div>';
    }
    if (step.items && step.items.length > 0) {
      const items = step.items.map((item) => {
        const label = escapeHtml(item.label || item.id);
        const itemDetail = item.detail ? escapeHtml(item.detail) : ({
          pending: "waiting", active: "uploading…", done: "uploaded", error: "failed",
        }[item.status] || "");
        return '<li class="item ' + item.status + '">'
          + '<span class="item-marker"></span>'
          + '<span class="item-label">' + label + '</span>'
          + '<span class="item-status">' + itemDetail + '</span>'
          + '</li>';
      }).join("");
      body += '<ul class="items">' + items + '</ul>';
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
  const txHash = completion.txHash;
  const projectId = completion.projectId;
  const tokenAddr = completion.tokenAddr;
  let kv = "";
  if (projectId) kv += '<dt>Project ID</dt><dd>' + escapeHtml(projectId) + '</dd>';
  if (tokenAddr) kv += '<dt>Token</dt><dd>' + escapeHtml(tokenAddr) + '</dd>';
  if (txHash) kv += '<dt>Transaction</dt><dd>' + escapeHtml(txHash) + '</dd>';
  successCardEl.innerHTML = '<div class="success">'
    + '<h2>Project published</h2>'
    + '<p>You can return to the CLI — it has the receipt.</p>'
    + (kv ? '<dl class="kv">' + kv + '</dl>' : '')
    + '</div>';
  if (completion.buy && completion.buy.tokenAddress && connectedProvider) {
    mountBuyPanel(completion.buy);
  }
}

const SELECTOR_TOTAL_SUPPLY = "0x18160ddd";
const SELECTOR_COST_BETWEEN = "0x44523922";
const SELECTOR_QUOTE_BUY = "0x4beb394c";
const SELECTOR_BUY = "0xa6f2ae3a";

function pad32(hex) { return hex.replace(/^0x/, "").padStart(64, "0"); }
function encUint(bn) { return pad32(BigInt(bn).toString(16)); }

function parseEth(input, decimals) {
  const text = String(input || "").trim();
  if (!text) return 0n;
  if (!/^\\d*(?:\\.\\d*)?$/.test(text)) throw new Error("enter a number");
  const [whole, frac = ""] = text.split(".");
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole || "0") * (10n ** BigInt(decimals)) + BigInt(padded || "0");
}

function formatEth(bn, decimals = 18, places = 6) {
  const value = BigInt(bn);
  const sign = value < 0n ? "-" : "";
  const abs = value < 0n ? -value : value;
  const str = abs.toString().padStart(decimals + 1, "0");
  const intPart = str.slice(0, -decimals) || "0";
  let fracPart = str.slice(-decimals).slice(0, places).replace(/0+$/, "");
  return sign + (fracPart ? intPart + "." + fracPart : intPart);
}

function formatTokens(bn, decimals = 18, places = 4) {
  const intFmt = formatEth(bn, decimals, places);
  const [intPart, fracPart] = intFmt.split(".");
  const grouped = intPart.replace(/\\B(?=(\\d{3})+(?!\\d))/g, ",");
  return fracPart ? grouped + "." + fracPart : grouped;
}

async function ethCall(provider, to, data) {
  const result = await provider.request({ method: "eth_call", params: [{ to, data }, "latest"] });
  return BigInt(result || "0x0");
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function mountBuyPanel(buy) {
  const decimals = Number(buy.decimals ?? 0);
  const symbol = buy.tokenSymbol || "tokens";
  const minerPoolCap = BigInt(buy.minerPoolCap || "0");
  const tokenAddress = buy.tokenAddress;
  const presets = [1, 5, 10];
  const presetButtons = presets.map((pct) =>
    '<button class="preset" data-pct="' + pct + '">' + pct + '% of cap</button>'
  ).join("");
  const html = '<div class="buy" id="buyPanel">'
    + '<h3>Be early to the bonding curve</h3>'
    + '<p class="lede">The price is at its starting point right now. Pick a quick amount of '
    + escapeHtml(symbol) + ' to mint, or enter a custom 0G amount.</p>'
    + '<div class="preset-row">' + presetButtons + '</div>'
    + '<div class="buy-divider">or</div>'
    + '<div class="buy-input">'
    + '<input id="buyEth" type="text" inputmode="decimal" placeholder="0.0" autocomplete="off">'
    + '<span class="unit">0G</span>'
    + '</div>'
    + '<div class="quote muted" id="buyQuote">Pick a preset or enter an amount above.</div>'
    + '<div class="buy-actions">'
    + '<button class="primary" id="buyBtn" disabled>Buy ' + escapeHtml(symbol) + '</button>'
    + '<button class="ghost" id="skipBtn">Skip</button>'
    + '</div>'
    + '<div class="buy-result" id="buyResult"></div>'
    + '</div>';
  successCardEl.insertAdjacentHTML("beforeend", html);

  const ethInput = document.getElementById("buyEth");
  const quoteEl = document.getElementById("buyQuote");
  const buyBtn = document.getElementById("buyBtn");
  const skipBtn = document.getElementById("skipBtn");
  const resultEl = document.getElementById("buyResult");
  const presetEls = document.querySelectorAll("#buyPanel .preset");

  let pendingEth = 0n;
  let pendingTokensEstimate = 0n;
  let busy = false;

  function setQuote(html, cls = "") {
    quoteEl.className = "quote " + cls;
    quoteEl.innerHTML = html;
  }

  function selectPreset(btn) {
    for (const el of presetEls) el.classList.remove("selected");
    if (btn) btn.classList.add("selected");
  }

  async function quoteFromTokens(targetTokens) {
    if (targetTokens <= 0n) {
      setQuote("Enter a positive amount.", "muted");
      pendingEth = 0n;
      buyBtn.disabled = true;
      return;
    }
    setQuote("Quoting…", "muted");
    try {
      const supply = await ethCall(connectedProvider, tokenAddress, SELECTOR_TOTAL_SUPPLY);
      const data = SELECTOR_COST_BETWEEN + encUint(supply) + encUint(supply + targetTokens);
      const cost = await ethCall(connectedProvider, tokenAddress, data);
      pendingEth = cost;
      pendingTokensEstimate = targetTokens;
      buyBtn.disabled = cost === 0n;
      setQuote(
        '<div class="big">' + formatTokens(targetTokens, decimals) + " " + escapeHtml(symbol) + "</div>"
        + '<small>≈ ' + formatEth(cost, 18) + " 0G at current supply</small>",
      );
    } catch (err) {
      setQuote("Could not get a quote: " + escapeHtml(err.message || String(err)), "error");
      buyBtn.disabled = true;
    }
  }

  async function quoteFromEth(ethValue) {
    if (ethValue <= 0n) {
      setQuote("Enter a positive amount.", "muted");
      pendingEth = 0n;
      buyBtn.disabled = true;
      return;
    }
    setQuote("Quoting…", "muted");
    try {
      const data = SELECTOR_QUOTE_BUY + encUint(ethValue);
      const tokens = await ethCall(connectedProvider, tokenAddress, data);
      pendingEth = ethValue;
      pendingTokensEstimate = tokens;
      buyBtn.disabled = tokens === 0n;
      setQuote(
        '<div class="big">≈ ' + formatTokens(tokens, decimals) + " " + escapeHtml(symbol) + "</div>"
        + '<small>for ' + formatEth(ethValue, 18) + " 0G</small>",
      );
    } catch (err) {
      setQuote("Could not get a quote: " + escapeHtml(err.message || String(err)), "error");
      buyBtn.disabled = true;
    }
  }

  for (const btn of presetEls) {
    btn.addEventListener("click", () => {
      selectPreset(btn);
      const pct = Number(btn.dataset.pct);
      if (minerPoolCap === 0n) {
        setQuote("Miner pool cap is 0 — use the custom amount below.", "muted");
        return;
      }
      const target = (minerPoolCap * BigInt(pct)) / 100n;
      ethInput.value = "";
      quoteFromTokens(target);
    });
  }

  const debouncedEthQuote = debounce(() => {
    selectPreset(null);
    try {
      const v = parseEth(ethInput.value, 18);
      quoteFromEth(v);
    } catch (err) {
      setQuote(escapeHtml(err.message || String(err)), "error");
      buyBtn.disabled = true;
    }
  }, 250);
  ethInput.addEventListener("input", debouncedEthQuote);

  skipBtn.addEventListener("click", () => {
    document.getElementById("buyPanel").remove();
  });

  buyBtn.addEventListener("click", async () => {
    if (busy || pendingEth <= 0n) return;
    busy = true;
    buyBtn.disabled = true;
    skipBtn.disabled = true;
    setQuote("Waiting for wallet approval…", "muted");
    resultEl.classList.remove("visible", "error");
    try {
      const txHash = await connectedProvider.request({
        method: "eth_sendTransaction",
        params: [{
          from: connectedAddress,
          to: tokenAddress,
          value: "0x" + pendingEth.toString(16),
          data: SELECTOR_BUY,
        }],
      });
      setQuote(
        '<div class="big">Buy submitted</div>'
        + '<small>~' + formatTokens(pendingTokensEstimate, decimals) + " " + escapeHtml(symbol) + " for " + formatEth(pendingEth, 18) + " 0G</small>",
      );
      resultEl.classList.add("visible");
      resultEl.innerHTML = "Tx hash: <code>" + escapeHtml(txHash) + "</code>";
      buyBtn.textContent = "Done";
      buyBtn.disabled = true;
      skipBtn.disabled = false;
      skipBtn.textContent = "Close";
    } catch (err) {
      const message = err && err.code === 4001 ? "Wallet rejected the transaction." : (err.message || String(err));
      resultEl.classList.add("visible", "error");
      resultEl.textContent = message;
      buyBtn.disabled = false;
      skipBtn.disabled = false;
      busy = false;
      setQuote("Buy not submitted.", "muted");
    }
  });
}

function setWalletStatus(text, isError = false) {
  walletStatusMessage = text || "";
  walletStatusIsError = !!isError;
  if (walletStatusMessage !== lastWalletStatus) {
    lastWalletStatus = walletStatusMessage;
  }
  lastRenderKey = "";
  renderProgress();
}

function addProvider(provider, info) {
  if (!provider || providers.some((item) => item.provider === provider)) return;
  providers.push({ provider, info });
  renderProviders();
}

function renderProviders() {
  const host = document.getElementById("walletButtons");
  if (!host) return;
  host.innerHTML = "";
  const row = document.createElement("div");
  row.className = "wallet-row";
  if (providers.length === 0) {
    const button = document.createElement("button");
    button.className = "wallet";
    button.textContent = "No browser wallet detected";
    button.disabled = true;
    row.appendChild(button);
  } else {
    for (const item of providers) {
      const button = document.createElement("button");
      button.className = "wallet";
      button.textContent = item.info?.name || "Browser wallet";
      button.onclick = () => connectWith(item.provider);
      row.appendChild(button);
    }
  }
  host.appendChild(row);
}

async function request(provider, method, params) {
  return provider.request({ method, params });
}

async function ensureChain(provider) {
  const expected = session.chain.chainId;
  const current = await request(provider, "eth_chainId");
  if (String(current).toLowerCase() === expected.toLowerCase()) return;
  try {
    await request(provider, "wallet_switchEthereumChain", [{ chainId: expected }]);
  } catch (err) {
    if (err && err.code === 4902) {
      await request(provider, "wallet_addEthereumChain", [session.chain]);
      return;
    }
    throw err;
  }
}

async function signMessage(provider, address, message) {
  try {
    return await request(provider, "personal_sign", [message, address]);
  } catch (err) {
    if (err && err.code === 4001) throw err;
    return await request(provider, "personal_sign", [address, message]);
  }
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

async function connectWith(provider) {
  try {
    const buttons = document.querySelectorAll("#walletButtons button");
    for (const button of buttons) button.disabled = true;
    setWalletStatus("Requesting wallet account…");
    const accounts = await request(provider, "eth_requestAccounts");
    const address = accounts[0];
    if (!address) throw new Error("wallet did not return an account");

    setWalletStatus("Checking that the wallet is on 0G Galileo testnet…");
    await ensureChain(provider);

    connectedProvider = provider;
    connectedAddress = address;
    await postJson("account", { address });
    setWalletStatus("");
    startWalletRequestPolling();
    startPublishPolling();
  } catch (err) {
    setWalletStatus(err.message || String(err), true);
    for (const button of document.querySelectorAll("#walletButtons button")) button.disabled = false;
  }
}

function startWalletRequestPolling() {
  if (walletPollStarted) return;
  walletPollStarted = true;
  pollWalletRequests();
}

async function pollWalletRequests() {
  while (connectedProvider) {
    try {
      const res = await fetch("wallet-request");
      const data = await res.json();
      if (data.request) {
        const item = data.request;
        setWalletStatus(item.label || "Waiting for wallet approval…");
        try {
          const result = await request(connectedProvider, item.method, item.params || []);
          await postJson("wallet-result", { id: item.id, result });
          setWalletStatus("");
        } catch (err) {
          await postJson("wallet-result", { id: item.id, error: err.message || String(err) });
          throw err;
        }
      } else {
        await sleep(800);
      }
    } catch (err) {
      setWalletStatus(err.message || String(err), true);
      await sleep(1200);
    }
  }
}

function startPublishPolling() {
  pollPublishReadiness();
}

async function pollPublishReadiness() {
  while (connectedProvider && !publishStarted) {
    try {
      session = await (await fetch("session")).json();
      summaryJsonEl.textContent = JSON.stringify({
        summary: session.summary,
        storageArtifacts: session.storageArtifacts,
      }, null, 2);
      if (session.txRequest) {
        publishStarted = true;
        await publishFinalProject();
        return;
      }
    } catch (err) {
      setWalletStatus(err.message || String(err), true);
    }
    await sleep(1200);
  }
}

async function publishFinalProject() {
  try {
    setWalletStatus("Preparing approval message…");
    const { message } = await postJson("message", { address: connectedAddress });

    setWalletStatus("Waiting for approval signature in your wallet…");
    const signature = await signMessage(connectedProvider, connectedAddress, message);
    await postJson("approve", { address: connectedAddress, signature, message });

    setWalletStatus("Waiting for the registry transaction approval in your wallet…");
    const txHash = await request(connectedProvider, "eth_sendTransaction", [{ ...session.txRequest, from: connectedAddress }]);
    await postJson("tx", { address: connectedAddress, signature, message, txHash });
    setWalletStatus("Transaction submitted. Waiting for receipt…");
  } catch (err) {
    setWalletStatus(err.message || String(err), true);
  }
}

async function pollProgress() {
  if (progressPollStarted) return;
  progressPollStarted = true;
  while (true) {
    try {
      const res = await fetch("progress");
      if (res.ok) {
        const data = await res.json();
        progress = data.progress;
        if (typeof data.walletStatus === "string" && data.walletStatus && !walletStatusIsError) {
          if (data.walletStatus !== walletStatusMessage) {
            walletStatusMessage = data.walletStatus;
            lastRenderKey = "";
          }
        }
        renderProgress();
        if (progress?.status === "complete") {
          await sleep(1500);
        }
      }
    } catch (err) { /* keep polling */ }
    await sleep(700);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fireConfetti() {
  const canvas = document.getElementById("confetti");
  const ctx = canvas.getContext("2d");
  let raf;
  function resize() {
    canvas.width = window.innerWidth * window.devicePixelRatio;
    canvas.height = window.innerHeight * window.devicePixelRatio;
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
  }
  resize();
  window.addEventListener("resize", resize);
  const colors = ["#2451d6", "#1f9e62", "#f5a524", "#ff6b9a", "#7c3aed", "#22d3ee"];
  const N = 140;
  const particles = Array.from({ length: N }, () => ({
    x: canvas.width / 2 + (Math.random() - 0.5) * canvas.width * 0.4,
    y: canvas.height * 0.2,
    vx: (Math.random() - 0.5) * 12 * window.devicePixelRatio,
    vy: (Math.random() * -6 - 6) * window.devicePixelRatio,
    g: 0.3 * window.devicePixelRatio,
    size: (4 + Math.random() * 6) * window.devicePixelRatio,
    rot: Math.random() * Math.PI * 2,
    vr: (Math.random() - 0.5) * 0.3,
    color: colors[Math.floor(Math.random() * colors.length)],
    life: 0,
    maxLife: 180 + Math.random() * 60,
  }));
  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = 0;
    for (const p of particles) {
      p.life += 1;
      if (p.life > p.maxLife) continue;
      alive += 1;
      p.vy += p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, 1 - p.life / p.maxLife);
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.5);
      ctx.restore();
    }
    if (alive > 0) {
      raf = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(raf);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
  tick();
}

window.addEventListener("eip6963:announceProvider", (event) => {
  addProvider(event.detail.provider, event.detail.info);
});
window.dispatchEvent(new Event("eip6963:requestProvider"));

(async function init() {
  session = await (await fetch("session")).json();
  summaryJsonEl.textContent = JSON.stringify({
    summary: session.summary,
    storageArtifacts: session.storageArtifacts,
  }, null, 2);
  pollProgress();
  setTimeout(() => {
    if (window.ethereum) addProvider(window.ethereum, { name: window.ethereum.isMetaMask ? "MetaMask" : "Injected wallet" });
    renderProviders();
  }, 150);
})();
</script>
</body>
</html>`;
}

function chainConfig(deployment) {
  const chainId = deployment.network.chainId;
  return {
    chainId: `0x${BigInt(chainId).toString(16)}`,
    chainName: deployment.network.name || `Chain ${chainId}`,
    rpcUrls: [deployment.network.rpcUrl],
    nativeCurrency: {
      name: "0G",
      symbol: "0G",
      decimals: 18,
    },
  };
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
  if (!origin) {
    return true;
  }
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

function requireKnownMessage(messagesByAddress, address, message) {
  const expected = messagesByAddress.get(address.toLowerCase());
  if (!expected || expected !== message) {
    throw new Error("message does not match the prepared publish approval");
  }
  return expected;
}

function normalizeAddress(address) {
  assertAddress(address, "address");
  return address;
}

function assertAddress(address, label) {
  if (!ADDRESS_RE.test(String(address))) {
    throw new Error(`${label} must be a 0x-prefixed 20-byte address`);
  }
}

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} is required`);
  }
  return value;
}

function requireTxHash(value) {
  if (!TX_HASH_RE.test(String(value))) {
    throw new Error("txHash must be a 0x-prefixed 32-byte transaction hash");
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

function sendText(res, statusCode, body) {
  res.writeHead(statusCode, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

function normalizeJson(value) {
  return JSON.parse(JSON.stringify(value, (_key, item) => (
    typeof item === "bigint" ? item.toString() : item
  )));
}

const STORAGE_ARTIFACT_LABELS = {
  protocol: "protocol.json",
  repoSnapshot: "Repository snapshot",
  benchmark: "Benchmark archive",
  baselineMetrics: "Baseline metrics",
};

function buildInitialProgress(flow) {
  const steps = [
    { id: "connect", label: "Connect your wallet", status: "active", detail: "" },
  ];
  if (flow === "storage+register") {
    steps.push({
      id: "storage",
      label: "Upload artifacts to 0G Storage",
      status: "pending",
      detail: "",
      items: Object.entries(STORAGE_ARTIFACT_LABELS).map(([id, label]) => ({
        id,
        label,
        status: "pending",
        detail: "",
      })),
    });
  }
  steps.push({
    id: "register",
    label: "Sign approval & create project on-chain",
    status: "pending",
    detail: "",
  });
  return {
    flow,
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
  if (typeof extra.detail === "string") {
    step.detail = extra.detail;
  }
}

function markStepItemStatus(progress, stepId, itemId, status, extra = {}) {
  const step = findStep(progress, stepId);
  if (!step?.items) return;
  const item = step.items.find((entry) => entry.id === itemId);
  if (!item) return;
  item.status = status;
  if (typeof extra.detail === "string") {
    item.detail = extra.detail;
  }
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
