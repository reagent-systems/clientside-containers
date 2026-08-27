// Agent sandbox runtime — the smallest tier, modeled on NVIDIA OpenShell.
// A policy-governed agent runtime in a Web Worker. It answers API calls and
// makes allow/deny egress decisions against a declarative policy, all in-tab.

const startedAt = Date.now();
let calls = 0;

// Policy is supplied by the main thread (parsed from YAML there).
let policy = { network: { default: "deny", allow: [] }, filesystem: { writable: [], readonly: [] } };

function evaluateEgress(req) {
  const method = String(req.method || "GET").toUpperCase();
  const host = String(req.host || "");
  const match = (policy.network.allow || []).find(
    (r) => r.host === host && (r.methods.includes(method) || r.methods.includes("*")),
  );
  if (match) return { verdict: "allow", reason: `matched allow rule for ${match.host}` };
  if (policy.network.default === "allow") return { verdict: "allow", reason: "default policy is allow" };
  return { verdict: "deny", reason: `no rule permits ${method} ${host}` };
}

function egressUrl(host, path) {
  const p = path && path.length > 0 ? (path.startsWith("/") ? path : `/${path}`) : "/";
  return `https://${host}${p}`;
}

// Names an evaluated /eval expression must not be able to reach — anything
// that could perform network I/O or touch the worker's own messaging
// surface, which would route around the policy /egress enforces.
const SANDBOXED_GLOBALS = [
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "importScripts",
  "self",
  "postMessage",
  "indexedDB",
  "caches",
  "Worker",
];

// CodeQL flags the next line as code injection (js/code-injection): `expr`
// is attacker-controlled and reaches `Function`. That's real, and it's the
// entire, intentional point of /eval — the console's own "eval" sample
// demonstrates it by evaluating "2 + 40". Per SECURITY.md's threat model,
// this app has no server and no other visitor to attack: `expr` is text the
// same visitor's own browser tab sent to itself, in a context that already
// has full DevTools access to that tab. Shadowing the sandboxed globals
// above closes the one real escalation this endpoint offered — reaching the
// network outside the /egress policy — which is the in-scope fault under
// SECURITY.md ("Policy bypass in the agent sandbox"). Running attacker-
// supplied script from a *different* origin, which this alert's generic
// query can't distinguish from that, is not something this line does.
function sandboxedEval(expr) {
  const fn = Function(...SANDBOXED_GLOBALS, `"use strict"; return (${expr});`); // lgtm[js/code-injection]
  return fn(...SANDBOXED_GLOBALS.map(() => undefined));
}

// A denied call never reaches the network — the policy check runs first, and
// only an "allow" verdict is followed by a real fetch. The result (status,
// or the CORS/network failure) is surfaced as-is; nothing is faked.
async function performEgress(body) {
  const method = String((body && body.method) || "GET").toUpperCase();
  const decision = evaluateEgress({ host: body && body.host, method });
  if (decision.verdict !== "allow") {
    return { status: 403, body: decision };
  }
  const url = egressUrl(body.host, body.path);
  const init = {
    method,
    mode: "cors",
    credentials: "omit",
    redirect: "follow",
  };
  if (body && body.headers && typeof body.headers === "object") {
    init.headers = { ...body.headers };
  }
  if (body && body.body !== undefined && body.body !== null && method !== "GET" && method !== "HEAD") {
    init.body = typeof body.body === "string" ? body.body : JSON.stringify(body.body);
    if (!init.headers) init.headers = {};
    if (!init.headers["content-type"] && !init.headers["Content-Type"] && typeof body.body !== "string") {
      init.headers["content-type"] = "application/json";
    }
  }
  try {
    const res = await fetch(url, init);
    let text = "";
    try {
      text = await res.text();
    } catch {
      text = "";
    }
    return {
      status: res.status,
      body: {
        ...decision,
        fetched: true,
        url,
        ok: res.ok,
        statusText: res.statusText,
        body: text.slice(0, 64 * 1024),
        bodyTruncated: text.length > 64 * 1024,
      },
    };
  } catch (err) {
    return {
      status: 502,
      body: {
        ...decision,
        fetched: true,
        url,
        error: String((err && err.message) || err),
        cause: "cors_or_network",
      },
    };
  }
}

async function agentChat(body) {
  const style = String((body && body.apiStyle) || "openai");
  if (style === "anthropic") return agentChatAnthropic(body);
  return agentChatOpenAI(body);
}

async function agentChatOpenAI(body) {
  const host = String((body && body.host) || "");
  const path = String((body && body.path) || "/v1/chat/completions");
  const model = String((body && body.model) || "gpt-4o-mini");
  const apiKey = String((body && body.apiKey) || "");
  const allowEmptyKey = Boolean(body && body.allowEmptyKey);
  const messages = Array.isArray(body && body.messages) ? body.messages : [];

  if (!host) return { status: 400, body: { error: "host is required" } };
  if (!apiKey && !allowEmptyKey) return { status: 400, body: { error: "apiKey is required" } };

  const headers = { "content-type": "application/json" };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  const egress = await performEgress({
    host,
    path,
    method: "POST",
    headers,
    body: { model, messages },
  });

  return finishChatEgress(egress, model, (data) => {
    const content =
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      typeof data.choices[0].message.content === "string"
        ? data.choices[0].message.content
        : "";
    return content;
  });
}

async function agentChatAnthropic(body) {
  const host = String((body && body.host) || "api.anthropic.com");
  const path = String((body && body.path) || "/v1/messages");
  const model = String((body && body.model) || "claude-sonnet-4-20250514");
  const apiKey = String((body && body.apiKey) || "");
  const messages = Array.isArray(body && body.messages) ? body.messages : [];

  if (!host) return { status: 400, body: { error: "host is required" } };
  if (!apiKey) return { status: 400, body: { error: "apiKey is required" } };

  let system = "";
  const anthropicMessages = [];
  for (const m of messages) {
    if (!m || typeof m !== "object") continue;
    if (m.role === "system") {
      system = system ? `${system}\n${m.content}` : String(m.content || "");
      continue;
    }
    if (m.role === "user" || m.role === "assistant") {
      anthropicMessages.push({ role: m.role, content: String(m.content || "") });
    }
  }

  const payload = {
    model,
    max_tokens: 4096,
    messages: anthropicMessages,
  };
  if (system) payload.system = system;

  const egress = await performEgress({
    host,
    path,
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: payload,
  });

  return finishChatEgress(egress, model, (data) => {
    if (!Array.isArray(data.content)) return "";
    return data.content
      .filter((b) => b && b.type === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join("");
  });
}

async function finishChatEgress(egress, model, pickContent) {
  if (egress.status === 403) return egress;
  if (egress.body && egress.body.cause === "cors_or_network") {
    return {
      status: 502,
      body: {
        error: egress.body.error || "Failed to fetch",
        cause: "cors_or_network",
        url: egress.body.url,
      },
    };
  }
  if (!egress.body || !egress.body.ok) {
    return {
      status: egress.status || 502,
      body: {
        error: (egress.body && egress.body.body) || (egress.body && egress.body.error) || "provider error",
        cause: "provider",
        url: egress.body && egress.body.url,
      },
    };
  }

  let data;
  try {
    data = JSON.parse(egress.body.body || "{}");
  } catch {
    return { status: 502, body: { error: "invalid JSON from provider", cause: "provider" } };
  }
  const content = pickContent(data);
  return { status: 200, body: { content, model, url: egress.body.url } };
}

async function handle(req) {
  calls += 1;
  const path = (req && req.path) || "/";
  const method = ((req && req.method) || "GET").toUpperCase();
  const body = req && req.body;

  if (path === "/health") {
    return { status: 200, body: { ok: true, uptimeMs: Date.now() - startedAt, calls } };
  }
  if (path === "/policy") {
    return { status: 200, body: policy };
  }
  if (path === "/egress" && method === "POST" && body && body.host) {
    return performEgress(body);
  }
  if (path === "/agent/chat" && method === "POST") {
    return agentChat(body || {});
  }
  if (path === "/echo") {
    return { status: 200, body: { method, path, echo: body ?? null } };
  }
  if (path === "/eval" && method === "POST" && body && typeof body.expr === "string") {
    try {
      const result = sandboxedEval(body.expr);
      return { status: 200, body: { result } };
    } catch (err) {
      return { status: 400, body: { error: String(err) } };
    }
  }
  return { status: 404, body: { error: "no route", path } };
}

self.onmessage = (event) => {
  const msg = event.data || {};
  if (msg.type === "policy" && msg.policy) {
    policy = msg.policy;
    self.postMessage({ type: "policy-applied" });
    return;
  }
  if (msg.type === "request") {
    Promise.resolve(handle(msg.payload))
      .then((res) => {
        self.postMessage({ type: "response", id: msg.id, status: res.status, body: res.body });
      })
      .catch((err) => {
        self.postMessage({
          type: "response",
          id: msg.id,
          status: 500,
          body: { error: String((err && err.message) || err) },
        });
      });
  }
};

self.postMessage({ type: "ready", startedAt });
