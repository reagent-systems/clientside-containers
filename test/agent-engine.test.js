import { describe, it, expect, vi } from "vitest";
import {
  runAgent,
  createTools,
  createLocalReasoner,
  createLlmReasoner,
  createMemoryFs,
  buildPlan,
  parseAgentDirective,
  evaluateEgress,
  resolveEgressTarget,
  pathWritable,
  pathReadable,
} from "../public/workers/agent-engine.js";

const POLICY = {
  network: {
    default: "deny",
    allow: [
      { host: "api.github.com", methods: ["GET"] },
      { host: "api.openai.com", methods: ["GET", "POST"] },
    ],
  },
  filesystem: { writable: ["/workspace", "/tmp"], readonly: ["/etc"] },
};

// A fetch double that records calls and returns a canned text body.
function fakeFetch(bodyByUrl) {
  const calls = [];
  const impl = vi.fn(async (url, init) => {
    calls.push({ url, init });
    const body = typeof bodyByUrl === "function" ? bodyByUrl(url, init) : (bodyByUrl[url] ?? "");
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: (k) => (k.toLowerCase() === "content-type" ? "text/plain" : null), forEach: () => {} },
      text: async () => body,
      json: async () => JSON.parse(body),
    };
  });
  impl.calls = calls;
  return impl;
}

describe("policy evaluation", () => {
  it("allows a host+method in the allowlist", () => {
    expect(evaluateEgress(POLICY, { host: "api.github.com", method: "GET" }).verdict).toBe("allow");
  });
  it("denies a host not in the allowlist", () => {
    expect(evaluateEgress(POLICY, { host: "evil.com", method: "GET" }).verdict).toBe("deny");
  });
  it("denies when the method is not permitted", () => {
    expect(evaluateEgress(POLICY, { host: "api.github.com", method: "POST" }).verdict).toBe("deny");
  });
  it("network=off denies everything, network=open allows everything", () => {
    expect(evaluateEgress(POLICY, { host: "api.github.com", method: "GET" }, "off").verdict).toBe("deny");
    expect(evaluateEgress(POLICY, { host: "evil.com", method: "GET" }, "open").verdict).toBe("allow");
  });
  it("resolveEgressTarget parses urls and rejects non-http", () => {
    expect(resolveEgressTarget({ url: "https://api.github.com/zen" }).host).toBe("api.github.com");
    expect(resolveEgressTarget({ url: "ftp://x" }).error).toBeTruthy();
  });
  it("filesystem prefixes gate reads and writes", () => {
    expect(pathWritable(POLICY, "/workspace/a.txt")).toBe(true);
    expect(pathWritable(POLICY, "/etc/passwd")).toBe(false);
    expect(pathReadable(POLICY, "/etc/hosts")).toBe(true);
    expect(pathReadable(POLICY, "/root/x")).toBe(false);
  });
});

describe("tools execute for real and enforce policy", () => {
  it("http_get performs a real (mocked) fetch when allowed", async () => {
    const fetchImpl = fakeFetch({ "https://api.github.com/zen": "Keep it logically awesome." });
    const tools = createTools({ policy: POLICY, network: "restricted", fetchImpl });
    const obs = await tools.http_get.run({ url: "https://api.github.com/zen" });
    expect(obs.ok).toBe(true);
    expect(obs.status).toBe(200);
    expect(obs.body).toBe("Keep it logically awesome.");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("http_get is denied without touching the network for a blocked host", async () => {
    const fetchImpl = fakeFetch({});
    const tools = createTools({ policy: POLICY, network: "restricted", fetchImpl });
    const obs = await tools.http_get.run({ url: "https://evil.com/secrets" });
    expect(obs.ok).toBe(false);
    expect(obs.verdict).toBe("deny");
    expect(obs.status).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("write_file/read_file work under writable paths and are denied elsewhere", async () => {
    const fs = createMemoryFs();
    const tools = createTools({ policy: POLICY, network: "restricted", fs });
    const w = await tools.write_file.run({ path: "/workspace/note.txt", content: "hello" });
    expect(w.ok).toBe(true);
    const r = await tools.read_file.run({ path: "/workspace/note.txt" });
    expect(r).toMatchObject({ ok: true, content: "hello" });
    const denied = await tools.write_file.run({ path: "/etc/passwd", content: "x" });
    expect(denied).toMatchObject({ ok: false, denied: true });
    expect(fs.has("/etc/passwd")).toBe(false);
  });

  it("eval runs real JavaScript", async () => {
    const tools = createTools({ policy: POLICY, network: "restricted" });
    expect(await tools.eval.run({ expr: "2 + 40" })).toMatchObject({ ok: true, result: 42 });
    expect((await tools.eval.run({ expr: "(" })).ok).toBe(false);
  });
});

describe("local reasoner planning", () => {
  it("plans fetch → save → read from a natural-language goal", () => {
    const plan = buildPlan(
      "Fetch https://api.github.com/zen and save it to /workspace/zen.txt then read /workspace/zen.txt",
    );
    expect(plan.map((p) => p.tool)).toEqual(["http_get", "write_file", "read_file"]);
    expect(plan[1].fromHttp).toBe(true);
  });
  it("plans an eval for a compute goal", () => {
    expect(buildPlan("compute 6 * 7").map((p) => p.tool)).toEqual(["eval"]);
    expect(buildPlan("3 * (4 + 1)").map((p) => p.tool)).toEqual(["eval"]);
  });
});

describe("runAgent — the loop actually runs", () => {
  it("fetches, saves, and reads back a file end to end", async () => {
    const fetchImpl = fakeFetch({ "https://api.github.com/zen": "Approachable is better than simple." });
    const result = await runAgent({
      goal: "Fetch https://api.github.com/zen and save it to /workspace/zen.txt then read /workspace/zen.txt",
      policy: POLICY,
      network: "restricted",
      fetchImpl,
    });
    expect(result.status).toBe("complete");
    const tools = result.trace.filter((e) => e.type === "action").map((e) => e.tool);
    expect(tools).toEqual(["http_get", "write_file", "read_file"]);
    expect(result.files["/workspace/zen.txt"]).toBe("Approachable is better than simple.");
    const readObs = result.history.find((h) => h.tool === "read_file").observation;
    expect(readObs.content).toBe("Approachable is better than simple.");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("honors policy denials during a run (no network call to a blocked host)", async () => {
    const fetchImpl = fakeFetch({});
    const result = await runAgent({
      goal: "Fetch https://evil.com/secrets and save it to /workspace/loot.txt",
      policy: POLICY,
      network: "restricted",
      fetchImpl,
    });
    const httpObs = result.history.find((h) => h.tool === "http_get").observation;
    expect(httpObs.verdict).toBe("deny");
    expect(fetchImpl).not.toHaveBeenCalled();
    // The write still runs (path is writable) but stores the empty denied body.
    expect(result.files["/workspace/loot.txt"]).toBe("");
  });

  it("computes with the eval tool", async () => {
    const result = await runAgent({ goal: "compute 6 * 7 + 12", policy: POLICY });
    expect(result.status).toBe("complete");
    expect(result.finalAnswer).toContain("54");
  });

  it("streams trace events in order", async () => {
    const events = [];
    await runAgent({
      goal: "compute 1 + 1",
      policy: POLICY,
      onEvent: (e) => events.push(e.type),
    });
    expect(events[0]).toBe("start");
    expect(events).toContain("action");
    expect(events).toContain("observation");
    expect(events[events.length - 1]).toBe("finish");
  });

  it("stops at the step budget instead of looping forever", async () => {
    // A reasoner that never finishes; the loop must bound itself.
    const runawayReasoner = { kind: "runaway", async next() { return { type: "action", tool: "eval", args: { expr: "1" } }; } };
    const result = await runAgent({ goal: "loop", policy: POLICY, reasoner: runawayReasoner, maxSteps: 3 });
    expect(result.status).toBe("incomplete");
    expect(result.steps).toBe(3);
  });
});

describe("LLM reasoner — real request + directive parsing", () => {
  it("parseAgentDirective reads tool and finish directives", () => {
    expect(parseAgentDirective('{"tool":"http_get","args":{"url":"https://x"}}')).toMatchObject({
      type: "action",
      tool: "http_get",
    });
    expect(parseAgentDirective('here: {"finish":true,"answer":"done"}')).toMatchObject({
      type: "finish",
      answer: "done",
    });
  });

  it("drives a run via mocked chat-completions responses", async () => {
    const replies = [
      JSON.stringify({ choices: [{ message: { content: '{"thought":"compute","tool":"eval","args":{"expr":"20+22"}}' } }] }),
      JSON.stringify({ choices: [{ message: { content: '{"finish":true,"answer":"the answer is 42"}' } }] }),
    ];
    let call = 0;
    const fetchImpl = vi.fn(async (url, init) => {
      const body = replies[call++];
      return { ok: true, status: 200, headers: { get: () => "application/json", forEach: () => {} }, text: async () => body, json: async () => JSON.parse(body) };
    });
    const reasoner = createLlmReasoner({ apiKey: "sk-test", host: "api.openai.com", fetchImpl });
    const result = await runAgent({ goal: "what is 20 + 22", policy: POLICY, reasoner, maxSteps: 5 });
    expect(result.status).toBe("complete");
    expect(result.finalAnswer).toBe("the answer is 42");
    // Real request: correct host + bearer auth header.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const firstInit = fetchImpl.mock.calls[0][1];
    expect(fetchImpl.mock.calls[0][0]).toContain("api.openai.com");
    expect(firstInit.headers.authorization).toBe("Bearer sk-test");
    // It actually ran the eval tool the model asked for.
    expect(result.history[0].observation).toMatchObject({ ok: true, result: 42 });
  });
});
