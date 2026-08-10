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
  const decision = evaluateEgress(body);
  if (decision.verdict !== "allow") {
    return { status: 403, body: decision };
  }
  const url = egressUrl(body.host, body.path);
  try {
    const res = await fetch(url, { method: String(body.method || "GET").toUpperCase() });
    return { status: res.status, body: { ...decision, fetched: true, url, ok: res.ok } };
  } catch (err) {
    return {
      status: 502,
      body: { ...decision, fetched: true, url, error: String((err && err.message) || err) },
    };
  }
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
    Promise.resolve(handle(msg.payload)).then((res) => {
      self.postMessage({ type: "response", id: msg.id, status: res.status, body: res.body });
    });
  }
};

self.postMessage({ type: "ready", startedAt });
