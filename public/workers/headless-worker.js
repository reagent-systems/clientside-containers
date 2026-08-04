// Agent sandbox runtime — OpenShell-style policy in a Web Worker.
// Real egress fetch, virtual filesystem, and a tool-using agent turn loop.

const startedAt = Date.now();
let calls = 0;
const MAX_BODY_CHARS = 64 * 1024;
const MAX_TOOL_ROUNDS = 6;

let policy = {
  network: { default: "deny", allow: [] },
  filesystem: { writable: [], readonly: [] },
};
let networkMode = "restricted";

/** @type {Map<string, string>} */
const virtualFs = new Map();

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
    init.headers = { ...body.headers };
  }

  if (
    body &&
    body.body !== undefined &&
    body.body !== null &&
    target.method !== "GET" &&
    target.method !== "HEAD"
  ) {
    init.body = typeof body.body === "string" ? body.body : JSON.stringify(body.body);
    if (!init.headers) init.headers = {};
    if (
      !init.headers["content-type"] &&
      !init.headers["Content-Type"] &&
      typeof body.body !== "string"
    ) {
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
    const message = String(err && err.message ? err.message : err);
    return {
      ok: false,
      url: target.url,
      error: message,
      cause: "cors_or_network",
    };
  }
}

function normalizeFsPath(path) {
  let p = String(path || "/");
  if (!p.startsWith("/")) p = `/${p}`;
  p = p.replace(/\/+/g, "/");
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

function pathAllowed(path, prefixes) {
  const normalized = normalizeFsPath(path);
  return (prefixes || []).some((raw) => {
    const prefix = raw.endsWith("/") && raw.length > 1 ? raw.slice(0, -1) : raw;
    return normalized === prefix || normalized.startsWith(`${prefix}/`);
  });
}

function fsCanRead(path) {
  return (
    pathAllowed(path, policy.filesystem.writable) ||
    pathAllowed(path, policy.filesystem.readonly)
  );
}

function fsCanWrite(path) {
  return pathAllowed(path, policy.filesystem.writable);
}

function toolDefsOpenAI() {
  return [
    {
      type: "function",
      function: {
        name: "http_request",
        description: "HTTP request through the sandbox egress policy (real fetch).",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string" },
            method: { type: "string", description: "GET, POST, ..." },
            headers: { type: "object", additionalProperties: { type: "string" } },
            body: { type: "string" },
          },
          required: ["url"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "eval_js",
        description: "Evaluate a JavaScript expression in the worker sandbox.",
        parameters: {
          type: "object",
          properties: { expr: { type: "string" } },
          required: ["expr"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "fs_list",
        description: "List virtual filesystem paths under a directory prefix.",
        parameters: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "fs_read",
        description: "Read a file from the virtual filesystem.",
        parameters: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "fs_write",
        description: "Write a file to the virtual filesystem (writable paths only).",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string" },
            content: { type: "string" },
          },
          required: ["path", "content"],
        },
      },
    },
  ];
}

function toolDefsAnthropic() {
  return toolDefsOpenAI().map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));
}

async function runTool(name, args) {
  const input = args && typeof args === "object" ? args : {};
  if (name === "http_request") {
    const target = resolveEgressTarget({
      url: input.url,
      method: input.method || "GET",
      headers: input.headers,
      body: input.body,
    });
    if (target.error) return { error: target.error };
    const decision = evaluateEgress({ host: target.host, method: target.method });
    if (decision.verdict === "deny") {
      return { error: "policy_deny", reason: decision.reason, url: target.url };
    }
    return performFetch(target, {
      headers: input.headers,
      body: input.body,
      method: target.method,
    });
  }
  if (name === "eval_js") {
    try {
      const result = Function(`"use strict"; return (${String(input.expr)});`)();
      return { result };
    } catch (err) {
      return { error: String(err) };
    }
  }
  if (name === "fs_list") {
    const root = normalizeFsPath(input.path || "/");
    if (!fsCanRead(root)) return { error: "policy_deny", reason: `read denied for ${root}` };
    const entries = [];
    for (const key of virtualFs.keys()) {
      if (key === root || key.startsWith(`${root}/`)) entries.push(key);
    }
    entries.sort();
    return { path: root, entries };
  }
  if (name === "fs_read") {
    const path = normalizeFsPath(input.path);
    if (!fsCanRead(path)) return { error: "policy_deny", reason: `read denied for ${path}` };
    if (!virtualFs.has(path)) return { error: "not_found", path };
    return { path, content: virtualFs.get(path) };
  }
  if (name === "fs_write") {
    const path = normalizeFsPath(input.path);
    if (!fsCanWrite(path)) return { error: "policy_deny", reason: `write denied for ${path}` };
    virtualFs.set(path, String(input.content ?? ""));
    return { path, bytes: String(input.content ?? "").length };
  }
  return { error: `unknown tool: ${name}` };
}

function newMsgId() {
  return `msg-${Math.random().toString(36).slice(2, 10)}`;
}

function providerBase(provider, apiBaseUrl) {
  const trimmed = (apiBaseUrl || "").replace(/\/$/, "");
  if (trimmed) return trimmed;
  if (provider === "anthropic") return "https://api.anthropic.com";
  if (provider === "openai") return "https://api.openai.com/v1";
  return "https://api.openai.com/v1";
}

function toOpenAIMessages(messages) {
  return messages
    .filter((m) => m.role !== "system" || m.content)
    .map((m) => {
      if (m.role === "tool") {
        return {
          role: "tool",
          tool_call_id: m.toolCallId || m.id,
          content: m.content,
        };
      }
      if (m.role === "assistant" && m.toolCalls && m.toolCalls.length) {
        return {
          role: "assistant",
          content: m.content || null,
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments || {}),
            },
          })),
        };
      }
      return { role: m.role, content: m.content };
    });
}

function toAnthropicMessages(messages) {
  const out = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "tool") {
      out.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: m.toolCallId || m.id,
            content: m.content,
          },
        ],
      });
      continue;
    }
    if (m.role === "assistant" && m.toolCalls && m.toolCalls.length) {
      out.push({
        role: "assistant",
        content: [
          ...(m.content ? [{ type: "text", text: m.content }] : []),
          ...m.toolCalls.map((tc) => ({
            type: "tool_use",
            id: tc.id,
            name: tc.name,
            input: tc.arguments || {},
          })),
        ],
      });
      continue;
    }
    out.push({ role: m.role === "assistant" ? "assistant" : "user", content: m.content });
  }
  return out;
}

async function callOpenAICompatible({ base, apiKey, model, messages }) {
  const url = `${base}/chat/completions`;
  const target = resolveEgressTarget({ url, method: "POST" });
  if (target.error) return { error: target.error };
  const decision = evaluateEgress({ host: target.host, method: "POST" });
  if (decision.verdict === "deny") {
    return { error: "policy_deny", reason: decision.reason, host: target.host };
  }

  const fetchResult = await performFetch(target, {
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: {
      model,
      messages: toOpenAIMessages(messages),
      tools: toolDefsOpenAI(),
      tool_choice: "auto",
    },
  });

  if (fetchResult.cause === "cors_or_network") {
    return { error: fetchResult.error || "Failed to fetch", cause: "cors_or_network", url };
  }
  if (!fetchResult.ok) {
    return {
      error: fetchResult.body || fetchResult.statusText || "provider error",
      cause: "provider",
      status: fetchResult.status,
      url,
    };
  }

  let data;
  try {
    data = JSON.parse(fetchResult.body || "{}");
  } catch {
    return { error: "invalid JSON from provider", cause: "provider", url };
  }
  const choice = data.choices && data.choices[0];
  const msg = choice && choice.message;
  if (!msg) return { error: "empty provider response", cause: "provider", url };

  const toolCalls = Array.isArray(msg.tool_calls)
    ? msg.tool_calls.map((tc) => {
        let args = {};
        try {
          args = JSON.parse(tc.function?.arguments || "{}");
        } catch {
          args = {};
        }
        return {
          id: tc.id || newMsgId(),
          name: tc.function?.name || "unknown",
          arguments: args,
        };
      })
    : [];

  return {
    assistant: {
      id: newMsgId(),
      role: "assistant",
      content: typeof msg.content === "string" ? msg.content : "",
      toolCalls,
      at: new Date().toISOString(),
    },
  };
}

async function callAnthropic({ base, apiKey, model, messages, systemPrompt }) {
  const url = `${base}/v1/messages`;
  const target = resolveEgressTarget({ url, method: "POST" });
  if (target.error) return { error: target.error };
  const decision = evaluateEgress({ host: target.host, method: "POST" });
  if (decision.verdict === "deny") {
    return { error: "policy_deny", reason: decision.reason, host: target.host };
  }

  const system =
    systemPrompt ||
    messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");

  const fetchResult = await performFetch(target, {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: {
      model,
      max_tokens: 2048,
      system: system || undefined,
      messages: toAnthropicMessages(messages),
      tools: toolDefsAnthropic(),
    },
  });

  if (fetchResult.cause === "cors_or_network") {
    return { error: fetchResult.error || "Failed to fetch", cause: "cors_or_network", url };
  }
  if (!fetchResult.ok) {
    return {
      error: fetchResult.body || fetchResult.statusText || "provider error",
      cause: "provider",
      status: fetchResult.status,
      url,
    };
  }

  let data;
  try {
    data = JSON.parse(fetchResult.body || "{}");
  } catch {
    return { error: "invalid JSON from provider", cause: "provider", url };
  }

  const blocks = Array.isArray(data.content) ? data.content : [];
  const text = blocks
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  const toolCalls = blocks
    .filter((b) => b.type === "tool_use")
    .map((b) => ({
      id: b.id || newMsgId(),
      name: b.name,
      arguments: b.input || {},
    }));

  return {
    assistant: {
      id: newMsgId(),
      role: "assistant",
      content: text,
      toolCalls,
      at: new Date().toISOString(),
    },
  };
}

function fsSnapshot() {
  const files = {};
  for (const [k, v] of virtualFs.entries()) files[k] = v;
  return files;
}

async function agentTurn(body) {
  const provider = body.provider || "openai-compatible";
  const model = body.model || "gpt-4o-mini";
  const apiKey = body.apiKey || "";
  const apiBaseUrl = body.apiBaseUrl || "";
  const maxRounds = Math.min(MAX_TOOL_ROUNDS, Math.max(1, Number(body.maxToolRounds) || 4));
  /** @type {any[]} */
  let messages = Array.isArray(body.messages) ? body.messages.map((m) => ({ ...m })) : [];

  if (!apiKey) {
    return {
      status: 400,
      body: { error: "apiKey is required", cause: "config", files: fsSnapshot() },
    };
  }

  const base = providerBase(provider, apiBaseUrl);
  const produced = [];
  const systemPrompt = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");

  for (let round = 0; round < maxRounds; round += 1) {
    const result =
      provider === "anthropic"
        ? await callAnthropic({ base, apiKey, model, messages, systemPrompt })
        : await callOpenAICompatible({ base, apiKey, model, messages });

    if (result.error) {
      return {
        status: result.cause === "policy_deny" ? 403 : 502,
        body: {
          error: result.error,
          cause: result.cause,
          reason: result.reason,
          status: result.status,
          url: result.url,
          messages: produced,
          files: fsSnapshot(),
        },
      };
    }

    const assistant = result.assistant;
    const persisted = {
      id: assistant.id,
      role: "assistant",
      content: assistant.content || "",
      at: assistant.at,
      toolCalls: assistant.toolCalls || [],
    };
    produced.push(persisted);
    messages = [...messages, { ...assistant }];

    const toolCalls = assistant.toolCalls || [];
    if (!toolCalls.length) {
      return {
        status: 200,
        body: { ok: true, messages: produced, rounds: round + 1, files: fsSnapshot() },
      };
    }

    for (const tc of toolCalls) {
      const toolResult = await runTool(tc.name, tc.arguments);
      const toolMsg = {
        id: newMsgId(),
        role: "tool",
        content: JSON.stringify(toolResult),
        toolName: tc.name,
        toolCallId: tc.id,
        at: new Date().toISOString(),
      };
      produced.push(toolMsg);
      messages = [...messages, toolMsg];
    }
  }

  return {
    status: 200,
    body: {
      ok: true,
      messages: produced,
      rounds: maxRounds,
      truncated: true,
      note: "max tool rounds reached",
      files: fsSnapshot(),
    },
  };
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
        fsFiles: virtualFs.size,
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
  if (path === "/agent/turn" && method === "POST") {
    return agentTurn(body || {});
  }
  if (path === "/fs" && method === "GET") {
    return {
      status: 200,
      body: {
        files: Array.from(virtualFs.keys()).sort(),
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
  if (msg.type === "fs-hydrate" && msg.files && typeof msg.files === "object") {
    virtualFs.clear();
    for (const [k, v] of Object.entries(msg.files)) {
      virtualFs.set(normalizeFsPath(k), String(v));
    }
    self.postMessage({ type: "fs-hydrated", count: virtualFs.size });
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
