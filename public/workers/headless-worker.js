// Agent sandbox runtime — the smallest tier, modeled on NVIDIA OpenShell.
// A policy-governed agent runtime in a Web Worker. It runs a real tool-using
// agent loop (POST /agent/run), answers API calls, and performs real egress
// fetches against a declarative policy (honest CORS) — all in-tab.
//
// The agent loop, tools, reasoners, and policy evaluation live in
// ./agent-engine.js, which is imported here (module worker) and exercised
// directly by the test suite.

import {
  runAgent,
  createLocalReasoner,
  createLlmReasoner,
  createTools,
  createMemoryFs,
  normalizePolicy,
  normalizeNetwork,
  resolveEgressTarget,
  evaluateEgress,
  performFetch,
} from "./agent-engine.js";

const startedAt = Date.now();
let calls = 0;

// Policy is supplied by the main thread (parsed from YAML there).
let policy = normalizePolicy({
  network: { default: "deny", allow: [] },
  filesystem: { writable: [], readonly: [] },
});

// Container networking posture from settings: off | restricted | open.
let networkMode = "restricted";

// One persistent filesystem per worker session, so files an agent writes are
// visible to later reads/lists within the same container.
const fs = createMemoryFs();

async function handle(req, emit) {
  calls += 1;
  const path = (req && req.path) || "/";
  const method = ((req && req.method) || "GET").toUpperCase();
  const body = req && req.body;

  if (path === "/health") {
    return { status: 200, body: { ok: true, uptimeMs: Date.now() - startedAt, calls, network: networkMode } };
  }

  if (path === "/policy") {
    return { status: 200, body: { policy, network: networkMode } };
  }

  if (path === "/files") {
    return { status: 200, body: { files: fs.snapshot() } };
  }

  if (path === "/egress" && method === "POST") {
    const target = resolveEgressTarget(body || {});
    if (target.error) return { status: 400, body: { error: target.error } };
    const decision = evaluateEgress(policy, { host: target.host, method: target.method }, networkMode);
    if (decision.verdict === "deny") {
      return {
        status: 403,
        body: { verdict: "deny", reason: decision.reason, network: networkMode, url: target.url, host: target.host, method: target.method },
      };
    }
    const fetchResult = await performFetch(target, body || {});
    return {
      status: fetchResult.ok ? 200 : 502,
      body: { verdict: "allow", reason: decision.reason, network: networkMode, host: target.host, method: target.method, fetch: fetchResult },
    };
  }

  if (path === "/agent/run" && method === "POST") {
    const goal = body && typeof body.goal === "string" ? body.goal : "";
    if (!goal.trim()) return { status: 400, body: { error: "goal is required" } };
    const maxSteps = body && Number.isFinite(body.maxSteps) ? body.maxSteps : 12;
    const tools = createTools({ policy, network: networkMode, fs });
    const reasoner =
      body && typeof body.apiKey === "string" && body.apiKey.trim()
        ? createLlmReasoner({
            apiKey: body.apiKey.trim(),
            host: (body.host && String(body.host)) || "api.openai.com",
            model: (body.model && String(body.model)) || "gpt-4o-mini",
          })
        : createLocalReasoner();
    const result = await runAgent({
      goal,
      policy,
      network: networkMode,
      tools,
      fs,
      reasoner,
      maxSteps,
      onEvent: (event) => emit && emit(event),
    });
    return { status: 200, body: result };
  }

  if (path === "/echo") {
    return { status: 200, body: { method, path, echo: body ?? null } };
  }

  if (path === "/eval" && method === "POST" && body && typeof body.expr === "string") {
    const tools = createTools({ policy, network: networkMode, fs });
    const observation = tools.eval.run({ expr: body.expr });
    return { status: observation.ok ? 200 : 400, body: observation.ok ? { result: observation.result } : { error: observation.error } };
  }

  return { status: 404, body: { error: "no route", path } };
}

self.onmessage = (event) => {
  const msg = event.data || {};
  if (msg.type === "policy" && msg.policy) {
    policy = normalizePolicy(msg.policy);
    self.postMessage({ type: "policy-applied" });
    return;
  }
  if (msg.type === "network" && typeof msg.network === "string") {
    networkMode = normalizeNetwork(msg.network);
    self.postMessage({ type: "network-applied", network: networkMode });
    return;
  }
  if (msg.type === "request") {
    const emit = (agentEvent) => self.postMessage({ type: "agent-event", id: msg.id, event: agentEvent });
    Promise.resolve(handle(msg.payload, emit))
      .then((res) => {
        self.postMessage({ type: "response", id: msg.id, status: res.status, body: res.body });
      })
      .catch((err) => {
        self.postMessage({ type: "response", id: msg.id, status: 500, body: { error: String((err && err.message) || err) } });
      });
  }
};

self.postMessage({ type: "ready", startedAt });
