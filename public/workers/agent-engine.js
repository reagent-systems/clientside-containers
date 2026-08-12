// Agent runtime engine — the actual "agent" in the Agent sandbox tier.
//
// This is a real, tool-using agent loop (perceive → decide → act → observe),
// governed by the OpenShell-style policy. It runs inside the Web Worker in the
// browser, and is imported directly by the test suite. Every tool executes for
// real: HTTP tools perform real `fetch`es (policy-gated, honest CORS), the eval
// tool runs real JavaScript, and the filesystem tools read/write a real
// in-memory volume constrained by the policy's writable/readonly paths.
//
// The "brain" is pluggable:
//   - createLocalReasoner(): a deterministic planner that parses the goal into a
//     real ordered plan of tool calls (no external service required).
//   - createLlmReasoner(): a real ReAct-over-JSON loop against an
//     OpenAI/Anthropic-compatible inference host when an API key is supplied.
//
// Nothing here is simulated: with no action recognized, the agent says so
// honestly instead of inventing output.

const MAX_BODY_CHARS = 64 * 1024;

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

export function normalizeNetwork(mode) {
  return mode === "off" || mode === "open" ? mode : "restricted";
}

export function normalizePolicy(policy) {
  const p = policy || {};
  const net = p.network || {};
  const fs = p.filesystem || {};
  return {
    network: {
      default: net.default === "allow" ? "allow" : "deny",
      allow: Array.isArray(net.allow)
        ? net.allow.map((r) => ({
            host: String(r.host ?? ""),
            methods: (r.methods ?? ["GET"]).map((m) => String(m).toUpperCase()),
          }))
        : [],
    },
    filesystem: {
      writable: Array.isArray(fs.writable) ? fs.writable.map(String) : [],
      readonly: Array.isArray(fs.readonly) ? fs.readonly.map(String) : [],
    },
  };
}

export function resolveEgressTarget(body) {
  const method = String((body && body.method) || "GET").toUpperCase();
  const rawUrl = body && typeof body.url === "string" ? body.url.trim() : "";
  let host = body && typeof body.host === "string" ? body.host.trim() : "";
  let path = body && typeof body.path === "string" ? body.path : "/";

  if (rawUrl) {
    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return { error: "invalid url" };
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { error: "only http(s) urls are allowed" };
    }
    return { url: parsed.href, host: parsed.hostname, method };
  }

  if (!host) return { error: "url or host is required" };
  if (!path.startsWith("/")) path = `/${path}`;
  return { url: `https://${host}${path}`, host, method };
}

export function evaluateEgress(policy, req, network = "restricted") {
  const p = normalizePolicy(policy);
  const mode = normalizeNetwork(network);
  const method = String(req.method || "GET").toUpperCase();
  const host = String(req.host || "");

  if (mode === "off") return { verdict: "deny", reason: "networking is off" };
  if (mode === "open") return { verdict: "allow", reason: "networking is open" };

  const match = p.network.allow.find(
    (r) => r.host === host && (r.methods.includes(method) || r.methods.includes("*")),
  );
  if (match) return { verdict: "allow", reason: `matched allow rule for ${match.host}` };
  if (p.network.default === "allow") return { verdict: "allow", reason: "default policy is allow" };
  return { verdict: "deny", reason: `no rule permits ${method} ${host}` };
}

function normalizePath(path) {
  let p = String(path || "").trim();
  if (!p.startsWith("/")) p = `/${p}`;
  // Collapse any duplicate slashes and drop a trailing slash (except root).
  p = p.replace(/\/+/g, "/");
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

function underPrefix(path, prefixes) {
  const p = normalizePath(path);
  return prefixes.some((raw) => {
    const prefix = normalizePath(raw);
    return p === prefix || p.startsWith(prefix === "/" ? "/" : `${prefix}/`);
  });
}

export function pathWritable(policy, path) {
  return underPrefix(path, normalizePolicy(policy).filesystem.writable);
}

export function pathReadable(policy, path) {
  const fs = normalizePolicy(policy).filesystem;
  return underPrefix(path, [...fs.writable, ...fs.readonly]);
}

// ---------------------------------------------------------------------------
// Real in-memory filesystem
// ---------------------------------------------------------------------------

export function createMemoryFs(initial) {
  const files = new Map();
  if (initial && typeof initial === "object") {
    for (const [k, v] of Object.entries(initial)) files.set(normalizePath(k), String(v));
  }
  return {
    has: (path) => files.has(normalizePath(path)),
    read: (path) => (files.has(normalizePath(path)) ? files.get(normalizePath(path)) : null),
    write: (path, content) => {
      files.set(normalizePath(path), String(content ?? ""));
    },
    list: (prefix) => {
      const p = prefix ? normalizePath(prefix) : "/";
      return [...files.keys()].filter((k) => k === p || k.startsWith(p === "/" ? "/" : `${p}/`)).sort();
    },
    snapshot: () => Object.fromEntries([...files.entries()]),
  };
}

// ---------------------------------------------------------------------------
// HTTP (shared by the http tool and the worker's /egress route)
// ---------------------------------------------------------------------------

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

export async function performFetch(target, body, fetchImpl) {
  const doFetch = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
  if (!doFetch) return { ok: false, url: target.url, error: "no fetch available", cause: "no_fetch" };

  const init = { method: target.method, mode: "cors", credentials: "omit", redirect: "follow" };
  if (body && body.headers && typeof body.headers === "object") init.headers = { ...body.headers };
  if (body && body.body != null && target.method !== "GET" && target.method !== "HEAD") {
    init.body = typeof body.body === "string" ? body.body : JSON.stringify(body.body);
    if (!init.headers) init.headers = {};
    const hasCT = Object.keys(init.headers).some((k) => k.toLowerCase() === "content-type");
    if (!hasCT && typeof body.body !== "string") init.headers["content-type"] = "application/json";
  }

  try {
    const res = await doFetch(target.url, init);
    let text = "";
    try {
      text = await res.text();
    } catch (err) {
      return {
        ok: false,
        url: target.url,
        status: res.status,
        statusText: res.statusText,
        headers: headersObject(res.headers),
        error: String((err && err.message) || err),
        cause: "body_read_failed",
      };
    }
    const truncated = text.length > MAX_BODY_CHARS;
    return {
      ok: !!res.ok,
      url: target.url,
      status: res.status,
      statusText: res.statusText,
      headers: headersObject(res.headers),
      contentType: (res.headers && res.headers.get && res.headers.get("content-type")) || "",
      body: truncated ? text.slice(0, MAX_BODY_CHARS) : text,
      bodyTruncated: truncated,
      bodyLength: text.length,
    };
  } catch (err) {
    // Browsers collapse CORS blocks and unreachable hosts into the same
    // TypeError; report that honestly rather than inventing a response.
    return { ok: false, url: target.url, error: String((err && err.message) || err), cause: "cors_or_network" };
  }
}

// ---------------------------------------------------------------------------
// Tools — every one enforces policy and executes for real
// ---------------------------------------------------------------------------

export function createTools({ policy, network, fetchImpl, fs } = {}) {
  const pol = normalizePolicy(policy);
  const net = normalizeNetwork(network);
  const volume = fs || createMemoryFs();

  async function httpRequest(args = {}) {
    const target = resolveEgressTarget(args);
    if (target.error) return { ok: false, error: target.error };
    const decision = evaluateEgress(pol, { host: target.host, method: target.method }, net);
    if (decision.verdict === "deny") {
      return { ok: false, verdict: "deny", status: 403, reason: decision.reason, url: target.url, host: target.host };
    }
    const result = await performFetch(target, args, fetchImpl);
    return { ...result, verdict: "allow", reason: decision.reason, host: target.host };
  }

  const tools = {
    http_get: {
      name: "http_get",
      description: "GET a URL through the policy. args: { url }",
      run: (args = {}) => httpRequest({ ...args, method: "GET" }),
    },
    http_request: {
      name: "http_request",
      description: "HTTP request through the policy. args: { url, method, headers, body }",
      run: (args = {}) => httpRequest(args),
    },
    write_file: {
      name: "write_file",
      description: "Write a file if the policy allows it. args: { path, content }",
      run: (args = {}) => {
        const path = normalizePath(args.path);
        if (!args.path) return { ok: false, error: "path is required" };
        if (!pathWritable(pol, path)) {
          return { ok: false, error: `policy denies write to ${path}`, path, denied: true };
        }
        const content = String(args.content ?? "");
        volume.write(path, content);
        return { ok: true, path, bytes: content.length };
      },
    },
    read_file: {
      name: "read_file",
      description: "Read a file if the policy allows it. args: { path }",
      run: (args = {}) => {
        const path = normalizePath(args.path);
        if (!args.path) return { ok: false, error: "path is required" };
        if (!pathReadable(pol, path)) {
          return { ok: false, error: `policy denies read of ${path}`, path, denied: true };
        }
        if (!volume.has(path)) return { ok: false, error: "not found", path };
        return { ok: true, path, content: volume.read(path) };
      },
    },
    list_files: {
      name: "list_files",
      description: "List files under a path the policy can read. args: { path }",
      run: (args = {}) => {
        const path = args.path ? normalizePath(args.path) : "/";
        const entries = volume.list(path).filter((p) => pathReadable(pol, p));
        return { ok: true, path, entries };
      },
    },
    eval: {
      name: "eval",
      description: "Evaluate a JavaScript expression. args: { expr }",
      run: (args = {}) => {
        if (typeof args.expr !== "string") return { ok: false, error: "expr must be a string" };
        try {
          const result = Function(`"use strict"; return (${args.expr});`)();
          return { ok: true, result };
        } catch (err) {
          return { ok: false, error: String((err && err.message) || err) };
        }
      },
    },
  };

  return tools;
}

// ---------------------------------------------------------------------------
// Local reasoner — a real deterministic planner
// ---------------------------------------------------------------------------

const URL_RE = /https?:\/\/[^\s"'<>]+/gi;

export function buildPlan(goal) {
  const text = String(goal || "");
  const plan = [];

  const urls = text.match(URL_RE) || [];
  for (const url of urls) plan.push({ tool: "http_get", args: { url: url.replace(/[.,)]+$/, "") } });

  const saveMatch = text.match(/\b(?:save|write|store|put)\b[^/]*?\b(?:to|into|at|in)\s+(\/[^\s"']+)/i);
  if (saveMatch && urls.length) {
    plan.push({ tool: "write_file", args: { path: saveMatch[1] }, fromHttp: true, thought: `save fetched body to ${saveMatch[1]}` });
  } else if (saveMatch) {
    const literal = text.match(/\bwrite\s+"([^"]*)"\s+(?:to|into)\s+(\/[^\s"']+)/i);
    plan.push({ tool: "write_file", args: { path: saveMatch[1], content: literal ? literal[1] : "" } });
  }

  const readMatch = text.match(/\bread\b\s+(?:the\s+file\s+)?(\/[^\s"']+)/i);
  if (readMatch) plan.push({ tool: "read_file", args: { path: readMatch[1] } });

  const listMatch = text.match(/\blist\b\s+(?:files\s+(?:in|under)\s+)?(\/[^\s"']*)/i);
  if (listMatch) plan.push({ tool: "list_files", args: { path: listMatch[1] || "/" } });

  const evalMatch = text.match(/\b(?:compute|calculate|eval(?:uate)?)\s+(.+?)\s*$/i);
  const bareArith = text.trim().match(/^[\d\s+\-*/().%]+$/) && /[+\-*/%]/.test(text);
  if (evalMatch) plan.push({ tool: "eval", args: { expr: evalMatch[1] } });
  else if (bareArith && !plan.length) plan.push({ tool: "eval", args: { expr: text.trim() } });

  return plan;
}

function synthesizeAnswer(goal, history) {
  if (!history.length) {
    return `No runnable action was recognized in the goal. This agent can fetch URLs (http_get), read/write files under the policy (read_file/write_file/list_files), and compute expressions (eval). Goal was: ${goal}`;
  }
  const parts = history.map((h) => {
    const o = h.observation || {};
    if (h.tool === "http_get" || h.tool === "http_request") {
      if (o.ok) return `${h.tool} ${o.url} → ${o.status} (${o.bodyLength ?? 0} bytes)`;
      if (o.denied || o.verdict === "deny") return `${h.tool} → denied: ${o.reason}`;
      return `${h.tool} → ${o.cause || o.error || "failed"}`;
    }
    if (h.tool === "write_file") return o.ok ? `wrote ${o.path} (${o.bytes} bytes)` : `write ${o.path} → ${o.error}`;
    if (h.tool === "read_file") return o.ok ? `read ${o.path}: ${String(o.content).slice(0, 120)}` : `read → ${o.error}`;
    if (h.tool === "list_files") return `listed ${o.path}: ${(o.entries || []).join(", ") || "(empty)"}`;
    if (h.tool === "eval") return o.ok ? `eval = ${JSON.stringify(o.result)}` : `eval → ${o.error}`;
    return `${h.tool} → ${o.ok ? "ok" : o.error}`;
  });
  return parts.join("; ");
}

export function createLocalReasoner() {
  let plan = null;
  let idx = 0;
  return {
    kind: "local",
    async init({ goal }) {
      plan = buildPlan(goal);
      idx = 0;
    },
    async next({ goal, history }) {
      if (!plan) plan = buildPlan(goal);
      if (idx >= plan.length) {
        return { type: "finish", answer: synthesizeAnswer(goal, history), thought: "plan complete" };
      }
      const step = plan[idx++];
      if (step.tool === "write_file" && step.fromHttp) {
        const lastHttp = [...history].reverse().find((h) => (h.tool === "http_get" || h.tool === "http_request") && h.observation && h.observation.ok);
        const content = lastHttp ? String(lastHttp.observation.body ?? "") : String(step.args.content ?? "");
        return { type: "action", tool: "write_file", args: { path: step.args.path, content }, thought: step.thought };
      }
      return { type: "action", tool: step.tool, args: step.args, thought: step.thought };
    },
  };
}

// ---------------------------------------------------------------------------
// LLM reasoner — a real ReAct-over-JSON loop against an inference host
// ---------------------------------------------------------------------------

const LLM_SYSTEM_PROMPT = [
  "You are an autonomous agent running in a policy-governed sandbox.",
  "On each turn reply with a SINGLE JSON object and nothing else.",
  "To use a tool: {\"thought\": string, \"tool\": string, \"args\": object}.",
  "To finish: {\"thought\": string, \"finish\": true, \"answer\": string}.",
  "Available tools: http_get{url}, http_request{url,method,headers,body}, read_file{path}, write_file{path,content}, list_files{path}, eval{expr}.",
].join(" ");

export function parseAgentDirective(content) {
  const text = String(content || "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return { type: "finish", answer: text.trim() || "no directive", thought: "unparseable model reply" };
  }
  let obj;
  try {
    obj = JSON.parse(text.slice(start, end + 1));
  } catch {
    return { type: "finish", answer: text.trim(), thought: "invalid JSON directive" };
  }
  if (obj.finish || obj.type === "finish") {
    return { type: "finish", answer: String(obj.answer ?? ""), thought: obj.thought };
  }
  if (obj.tool) return { type: "action", tool: String(obj.tool), args: obj.args || {}, thought: obj.thought };
  return { type: "finish", answer: text.trim(), thought: "no tool or finish in directive" };
}

export function createLlmReasoner({ apiKey, host = "api.openai.com", model = "gpt-4o-mini", path = "/v1/chat/completions", fetchImpl } = {}) {
  const messages = [{ role: "system", content: LLM_SYSTEM_PROMPT }];
  return {
    kind: "llm",
    async init({ goal }) {
      messages.push({ role: "user", content: `GOAL: ${goal}` });
    },
    async next({ history }) {
      const last = history[history.length - 1];
      if (last) messages.push({ role: "user", content: `OBSERVATION ${JSON.stringify(last.observation)}` });
      const doFetch = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
      if (!doFetch) return { type: "finish", answer: "no fetch available for inference", thought: "no transport" };
      const res = await doFetch(`https://${host}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages }),
      });
      let data;
      try {
        data = await res.json();
      } catch (err) {
        return { type: "finish", answer: `inference response not JSON: ${String((err && err.message) || err)}`, thought: "bad response" };
      }
      const content = (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
      messages.push({ role: "assistant", content });
      return parseAgentDirective(content);
    },
  };
}

// ---------------------------------------------------------------------------
// The agent loop
// ---------------------------------------------------------------------------

export async function runAgent(opts = {}) {
  const goal = String(opts.goal || "");
  const maxSteps = Number.isFinite(opts.maxSteps) ? opts.maxSteps : 12;
  const onEvent = typeof opts.onEvent === "function" ? opts.onEvent : () => {};
  const policy = normalizePolicy(opts.policy);
  const network = normalizeNetwork(opts.network);
  const fs = opts.fs || createMemoryFs();
  const tools = opts.tools || createTools({ policy, network, fetchImpl: opts.fetchImpl, fs });
  const reasoner = opts.reasoner || createLocalReasoner();

  const trace = [];
  const emit = (ev) => {
    trace.push(ev);
    onEvent(ev);
  };

  emit({ type: "start", goal, network, reasoner: reasoner.kind || "local" });
  if (reasoner.init) await reasoner.init({ goal, policy, network, tools });

  const history = [];
  let finalAnswer = null;
  let complete = false;
  let steps = 0;

  while (steps < maxSteps) {
    steps += 1;
    let decision;
    try {
      decision = await reasoner.next({ goal, history, tools, policy, network });
    } catch (err) {
      emit({ type: "error", step: steps, error: String((err && err.message) || err) });
      break;
    }
    if (!decision) {
      emit({ type: "error", step: steps, error: "reasoner produced no decision" });
      break;
    }
    if (decision.thought) emit({ type: "thought", step: steps, text: decision.thought });

    if (decision.type === "finish") {
      finalAnswer = decision.answer != null ? String(decision.answer) : synthesizeAnswer(goal, history);
      complete = true;
      emit({ type: "finish", step: steps, answer: finalAnswer });
      break;
    }

    const tool = tools[decision.tool];
    emit({ type: "action", step: steps, tool: decision.tool, args: decision.args || {} });
    let observation;
    if (!tool) {
      observation = { ok: false, error: `unknown tool: ${decision.tool}` };
    } else {
      try {
        observation = await tool.run(decision.args || {});
      } catch (err) {
        observation = { ok: false, error: String((err && err.message) || err) };
      }
    }
    emit({ type: "observation", step: steps, tool: decision.tool, observation });
    history.push({ tool: decision.tool, args: decision.args || {}, observation });
  }

  if (!complete && finalAnswer === null) {
    finalAnswer = "step budget exhausted before the goal completed";
    emit({ type: "aborted", reason: "max_steps", steps });
  }

  return {
    status: complete ? "complete" : "incomplete",
    goal,
    steps,
    finalAnswer,
    trace,
    history,
    files: fs.snapshot(),
  };
}
