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
      if (req.method === "POST" && route === "/account") {
        const body = await readJsonBody(req);
        const address = normalizeAddress(body.address);
        connectedAddress = address;
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
    server.close();
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
    close() {
      clearTimeout(timeout);
      server.close();
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
    :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f6f7f9; color: #17191c; }
    main { width: min(760px, calc(100vw - 32px)); }
    section { background: white; border: 1px solid #d9dde3; border-radius: 8px; padding: 24px; box-shadow: 0 8px 30px rgb(21 24 28 / 8%); }
    h1 { margin: 0 0 8px; font-size: 22px; line-height: 1.2; }
    p { margin: 0 0 16px; color: #4c5563; line-height: 1.45; }
    button { border: 1px solid #222832; border-radius: 6px; background: #222832; color: white; font: inherit; padding: 10px 14px; cursor: pointer; }
    button.secondary { background: white; color: #222832; }
    button:disabled { opacity: .55; cursor: not-allowed; }
    #wallets { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; }
    pre { max-height: 220px; overflow: auto; background: #f0f2f5; padding: 12px; border-radius: 6px; font-size: 12px; }
    .status { min-height: 24px; font-weight: 600; color: #1f6f43; }
    .error { color: #9b1c1c; }
    @media (prefers-color-scheme: dark) {
      body { background: #101317; color: #eef1f5; }
      section { background: #181c22; border-color: #303743; }
      p { color: #b8c0cc; }
      button.secondary { background: #181c22; color: #eef1f5; border-color: #6c7685; }
      pre { background: #101317; }
    }
  </style>
</head>
<body>
<main>
  <section>
    <h1>Publish to 0G Galileo</h1>
    <p>Choose an installed browser wallet. Keep this page open while the CLI prepares storage artifacts, asks for 0G Storage transaction approvals, then asks for the final project registry approval.</p>
    <div id="wallets"></div>
    <p id="status" class="status"></p>
    <pre id="summary"></pre>
  </section>
</main>
<script>
const statusEl = document.getElementById("status");
const walletsEl = document.getElementById("wallets");
const summaryEl = document.getElementById("summary");
const providers = [];
let session;
let connectedProvider;
let connectedAddress;
let publishStarted = false;
let walletPollStarted = false;

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.className = isError ? "status error" : "status";
}

function addProvider(provider, info) {
  if (!provider || providers.some((item) => item.provider === provider)) return;
  providers.push({ provider, info });
  renderProviders();
}

function renderProviders() {
  walletsEl.innerHTML = "";
  if (providers.length === 0) {
    const button = document.createElement("button");
    button.textContent = "No browser wallet found";
    button.disabled = true;
    walletsEl.appendChild(button);
    return;
  }
  for (const item of providers) {
    const button = document.createElement("button");
    button.textContent = item.info?.name || "Browser wallet";
    button.onclick = () => connectWith(item.provider);
    walletsEl.appendChild(button);
  }
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
    for (const button of walletsEl.querySelectorAll("button")) button.disabled = true;
    setStatus("Requesting wallet account...");
    const accounts = await request(provider, "eth_requestAccounts");
    const address = accounts[0];
    if (!address) throw new Error("wallet did not return an account");

    setStatus("Checking network...");
    await ensureChain(provider);

    connectedProvider = provider;
    connectedAddress = address;
    await postJson("account", { address });
    setStatus("Wallet connected. Waiting for CLI steps...");
    startWalletRequestPolling();
    startPublishPolling();
  } catch (err) {
    setStatus(err.message || String(err), true);
    for (const button of walletsEl.querySelectorAll("button")) button.disabled = false;
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
        setStatus(item.label || "Waiting for wallet approval...");
        try {
          const result = await request(connectedProvider, item.method, item.params || []);
          await postJson("wallet-result", { id: item.id, result });
          setStatus("Wallet approval submitted. Waiting for next step...");
        } catch (err) {
          await postJson("wallet-result", { id: item.id, error: err.message || String(err) });
          throw err;
        }
      } else {
        await sleep(800);
      }
    } catch (err) {
      setStatus(err.message || String(err), true);
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
      summaryEl.textContent = JSON.stringify({
        summary: session.summary,
        storageArtifacts: session.storageArtifacts,
      }, null, 2);
      if (session.txRequest) {
        publishStarted = true;
        await publishFinalProject();
        return;
      }
    } catch (err) {
      setStatus(err.message || String(err), true);
    }
    await sleep(1200);
  }
}

async function publishFinalProject() {
  try {
    setStatus("Preparing approval message...");
    const { message } = await postJson("message", { address: connectedAddress });

    setStatus("Waiting for message signature...");
    const signature = await signMessage(connectedProvider, connectedAddress, message);
    await postJson("approve", { address: connectedAddress, signature, message });

    setStatus("Waiting for final project transaction approval...");
    const txHash = await request(connectedProvider, "eth_sendTransaction", [{ ...session.txRequest, from: connectedAddress }]);
    await postJson("tx", { address: connectedAddress, signature, message, txHash });
    setStatus("Transaction submitted. You can return to the CLI.");
  } catch (err) {
    setStatus(err.message || String(err), true);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

window.addEventListener("eip6963:announceProvider", (event) => {
  addProvider(event.detail.provider, event.detail.info);
});
window.dispatchEvent(new Event("eip6963:requestProvider"));

(async function init() {
  session = await (await fetch("session")).json();
  summaryEl.textContent = JSON.stringify({
    summary: session.summary,
    storageArtifacts: session.storageArtifacts,
  }, null, 2);
  renderProviders();
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
