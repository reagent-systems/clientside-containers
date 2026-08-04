// Agent sandbox runtime — the smallest tier, modeled on NVIDIA OpenShell.
// A policy-governed agent runtime in a Web Worker. It answers API calls and
// performs real egress fetches against a declarative policy (honest CORS),
// all in-tab.

const startedAt = Date.now();
let calls = 0;
const MAX_BODY_CHARS = 64 * 1024;

// Policy is supplied by the main thread (parsed from YAML there).
let policy = {
  network: { default: "deny", allow: [] },
  filesystem: { writable: [], readonly: [] },
};

// Container networking posture from settings: off | restricted | open.
let networkMode = "restricted";

function evaluateEgress(req) {
  const method = String(req.method || "GET").toUpperCase();
  const host = String(req.host || "");

  if (networkMode === "off") {
    return { verdict: "deny", reason: "networking is off" };
  }
  if (networkMode === "open") {
    return { verdict: "allow", reason: "networking is open" };
  }

  const match = (policy.network.allow || []).find(
    (r) => r.host === host && (r.methods.includes(method) || r.methods.includes("*")),
  );
  if (match) return { verdict: "allow", reason: `matched allow rule for ${match.host}` };
  if (policy.network.default === "allow") {
    return { verdict: "allow", reason: "default policy is allow" };
  }
  return { verdict: "deny", reason: `no rule permits ${method} ${host}` };
}

function resolveEgressTarget(body) {
  const method = String((body && body.method) || "GET").toUpperCase();
  let url = body && typeof body.url === "string" ? body.url.trim() : "";
  let host = body && typeof body.host === "string" ? body.host.trim() : "";
  let path = body && typeof body.path === "string" ? body.path : "/";

  if (url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return { error: "invalid url" };
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { error: "only http(s) urls are allowed" };
    }
    host = parsed.hostname;
    return { url: parsed.href, host, method };
  }

  if (!host) return { error: "url or host is required" };
  if (!path.startsWith("/")) path = `/${path}`;
  url = `https://${host}${path}`;
  return { url, host, method };
}

function headersObject(headers) {
  const out = {};
  try {
    headers.forEach((value, key) => {
      out[key] = value;
    });
  } catch {
    // ignore
  }
  return out;
}

async function performFetch(target, body) {
  const init = {
    method: target.method,
    mode: "cors",
    credentials: "omit",
    redirect: "follow",
  };

  if (body && body.headers && typeof body.headers === "object") {
    init.headers = body.headers;
  }

  if (body && body.body !== undefined && body.body !== null && target.method !== "GET" && target.method !== "HEAD") {
    init.body = typeof body.body === "string" ? body.body : JSON.stringify(body.body);
    if (!init.headers) init.headers = {};
    if (!init.headers["content-type"] && !init.headers["Content-Type"] && typeof body.body !== "string") {
      init.headers["content-type"] = "application/json";
    }
  }

  try {
    const res = await fetch(target.url, init);
    const contentType = res.headers.get("content-type") || "";
    let text;
    try {
      text = await res.text();
    } catch (err) {
      return {
        ok: false,
        url: target.url,
        status: res.status,
        statusText: res.statusText,
        headers: headersObject(res.headers),
        error: String(err && err.message ? err.message : err),
        cause: "body_read_failed",
      };
    }

    const truncated = text.length > MAX_BODY_CHARS;
    return {
      ok: res.ok,
      url: target.url,
      status: res.status,
      statusText: res.statusText,
      headers: headersObject(res.headers),
      contentType,
      body: truncated ? text.slice(0, MAX_BODY_CHARS) : text,
      bodyTruncated: truncated,
      bodyLength: text.length,
    };
  } catch (err) {
    // Browsers collapse CORS blocks and unreachable hosts into the same
    // TypeError; report that honestly rather than inventing a response.
    const message = String(err && err.message ? err.message : err);
    return {
      ok: false,
      url: target.url,
      error: message,
      cause: "cors_or_network",
    };
  }
}

async function handle(req) {
  calls += 1;
  const path = (req && req.path) || "/";
  const method = ((req && req.method) || "GET").toUpperCase();
  const body = req && req.body;

  if (path === "/health") {
    return {
      status: 200,
      body: {
        ok: true,
        uptimeMs: Date.now() - startedAt,
        calls,
        network: networkMode,
      },
    };
  }
  if (path === "/policy") {
    return { status: 200, body: { policy, network: networkMode } };
  }
  if (path === "/egress" && method === "POST") {
    const target = resolveEgressTarget(body || {});
    if (target.error) {
      return { status: 400, body: { error: target.error } };
    }
    const decision = evaluateEgress({ host: target.host, method: target.method });
    if (decision.verdict === "deny") {
      return {
        status: 403,
        body: {
          verdict: "deny",
          reason: decision.reason,
          network: networkMode,
          url: target.url,
          host: target.host,
          method: target.method,
        },
      };
    }
    const fetchResult = await performFetch(target, body || {});
    return {
      status: fetchResult.ok ? 200 : 502,
      body: {
        verdict: "allow",
        reason: decision.reason,
        network: networkMode,
        host: target.host,
        method: target.method,
        fetch: fetchResult,
      },
    };
  }
  if (path === "/echo") {
    return { status: 200, body: { method, path, echo: body ?? null } };
  }
  if (path === "/eval" && method === "POST" && body && typeof body.expr === "string") {
    try {
      const result = Function(`"use strict"; return (${body.expr});`)();
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
  if (msg.type === "network" && typeof msg.network === "string") {
    if (msg.network === "off" || msg.network === "restricted" || msg.network === "open") {
      networkMode = msg.network;
      self.postMessage({ type: "network-applied", network: networkMode });
    }
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
          body: { error: String(err && err.message ? err.message : err) },
        });
      });
  }
};

self.postMessage({ type: "ready", startedAt });
