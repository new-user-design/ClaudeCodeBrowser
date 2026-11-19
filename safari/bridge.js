/**
 * ClaudeCodeBrowser - Safari HTTP bridge
 *
 * Safari can't launch the Python native-messaging host, so this file stands in
 * for it: it polls the MCP server's /browser/poll endpoint and posts results to
 * /browser/response, exposing the same port-like object background.js expects
 * from browser.runtime.connectNative(). The API token is read by the Swift
 * handler in the containing app (sendNativeMessage) and cached in storage.
 */

const CCB_PORT = 8767; // Separate from Firefox (8765) so the two never steal each other's commands
const CCB_BASE = `http://127.0.0.1:${CCB_PORT}`;
const CCB_POLL_WAIT_S = 20;        // server holds each poll open until a command arrives (long-poll)
const CCB_POLL_TIMEOUT_MS = 30000; // client-side abort, longer than the server wait
const CCB_POST_TIMEOUT_MS = 15000;
const CCB_BACKOFF_MIN_MS = 1000;
const CCB_BACKOFF_MAX_MS = 15000;

let ccbToken = null;
let ccbStatus = { connected: false, lastError: null, lastPoll: 0, tokenSource: null };

async function ccbLoadToken(forceNative = false) {
  if (ccbToken && !forceNative) return ccbToken;
  try {
    const reply = await browser.runtime.sendNativeMessage("application.id", { type: "getToken" });
    if (reply && reply.token) {
      ccbToken = reply.token.trim();
      ccbStatus.tokenSource = "native";
      try { await browser.storage.local.set({ apiToken: ccbToken }); } catch (e) {}
      return ccbToken;
    }
    ccbStatus.lastError = (reply && reply.error) || "No token from app";
  } catch (e) {
    ccbStatus.lastError = `Native token read failed: ${e.message || e}`;
  }
  try {
    const stored = await browser.storage.local.get("apiToken");
    if (stored.apiToken) {
      ccbToken = stored.apiToken;
      ccbStatus.tokenSource = "storage";
    }
  } catch (e) {}
  return ccbToken;
}

async function ccbFetch(path, options = {}, timeoutMs = CCB_POST_TIMEOUT_MS) {
  const token = await ccbLoadToken();
  if (!token) throw new Error("No API token yet (start the MCP server once to create it)");
  const headers = { "Content-Type": "application/json", "X-API-Key": token };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let resp;
  try {
    resp = await fetch(CCB_BASE + path, {
      ...options, headers, cache: "no-store", credentials: "omit", signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
  if (resp.status === 403) {
    // Token may have been regenerated; re-read it next time
    ccbToken = null;
    await ccbLoadToken(true);
  }
  return resp;
}

function createHttpBridgePort() {
  const messageListeners = [];
  const disconnectListeners = [];

  const port = {
    onMessage: { addListener: (fn) => messageListeners.push(fn) },
    onDisconnect: { addListener: (fn) => disconnectListeners.push(fn) },
    postMessage(message) {
      // Only command results carry a requestId; other notifications have nowhere to go
      if (!message || !message.requestId) return;
      ccbFetch("/browser/response", { method: "POST", body: JSON.stringify(message) })
        .catch((e) => console.error("[ClaudeCodeBrowser] Failed to post response:", e));
    }
  };

  const isValidCommand = (c) =>
    c && typeof c === "object" && typeof c.action === "string" && c.action.length < 64 &&
    (c.requestId === undefined || typeof c.requestId === "string" || typeof c.requestId === "number");

  async function pollLoop() {
    let backoff = CCB_BACKOFF_MIN_MS;
    while (true) {
      let delay = 0;
      try {
        const resp = await ccbFetch(`/browser/poll?wait=${CCB_POLL_WAIT_S}`, {}, CCB_POLL_TIMEOUT_MS);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        ccbStatus.connected = true;
        ccbStatus.lastError = null;
        ccbStatus.lastPoll = Date.now();
        backoff = CCB_BACKOFF_MIN_MS;
        if (data.command) {
          if (isValidCommand(data.command)) {
            for (const fn of messageListeners) {
              try { fn(data.command); } catch (e) { console.error(e); }
            }
          } else {
            console.warn("[ClaudeCodeBrowser] Ignoring malformed command");
          }
        }
      } catch (e) {
        ccbStatus.connected = false;
        ccbStatus.lastError = e.name === "AbortError" ? "Poll timed out" : (e.message || String(e));
        delay = backoff;
        backoff = Math.min(backoff * 2, CCB_BACKOFF_MAX_MS);
      }
      if (delay) await new Promise((r) => setTimeout(r, delay));
    }
  }

  pollLoop();
  return port;
}

// Popup / debugging hook
browser.runtime.onMessage.addListener((message, sender) => {
  // Extension pages only (popup); content scripts run inside untrusted pages
  if (sender && sender.tab) return;
  if (message && message.target === "bridge" && message.action === "status") {
    return Promise.resolve({ ...ccbStatus, port: CCB_PORT });
  }
});
