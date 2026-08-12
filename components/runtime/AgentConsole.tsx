"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BASE_PATH } from "@/lib/base-path";
import { DEFAULT_AGENT_POLICY_YAML, parsePolicy } from "@/lib/policy";
import { saveContainer } from "@/lib/containers-db";
import type { Container, ContainerPreview } from "@/lib/container";

interface LogLine {
  dir: "in" | "out" | "sys" | "act";
  text: string;
}

const SAMPLES = [
  { label: "GET /health", method: "GET", path: "/health", body: "" },
  {
    label: "fetch github",
    method: "POST",
    path: "/egress",
    body: '{ "url": "https://api.github.com/zen", "method": "GET" }',
  },
  {
    label: "deny evil.com",
    method: "POST",
    path: "/egress",
    body: '{ "url": "https://evil.com/", "method": "GET" }',
  },
  {
    label: "cors probe",
    method: "POST",
    path: "/egress",
    body: '{ "url": "https://registry.npmjs.org/react", "method": "GET" }',
  },
  { label: "eval", method: "POST", path: "/eval", body: '{ "expr": "2 + 40" }' },
];

const GOAL_SAMPLES = [
  "Fetch https://api.github.com/zen and save it to /workspace/zen.txt then read /workspace/zen.txt",
  "Compute 6 * 7 + 12",
  "Fetch https://evil.com/secrets and save it to /workspace/loot.txt",
];

function summarizeBody(body: unknown): string {
  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}

interface AgentEvent {
  type: string;
  step?: number;
  goal?: string;
  network?: string;
  reasoner?: string;
  text?: string;
  tool?: string;
  args?: unknown;
  observation?: { ok?: boolean; [k: string]: unknown };
  answer?: string;
  reason?: string;
  error?: string;
}

function formatEvent(ev: AgentEvent): LogLine {
  switch (ev.type) {
    case "start":
      return { dir: "sys", text: `agent start (${ev.reasoner} reasoner, network=${ev.network}) — ${ev.goal}` };
    case "thought":
      return { dir: "sys", text: `  thought: ${ev.text}` };
    case "action":
      return { dir: "act", text: `step ${ev.step}: ${ev.tool}(${summarizeBody(ev.args)})` };
    case "observation": {
      const o = ev.observation ?? {};
      const ok = o.ok ? "ok" : "err";
      return { dir: "out", text: `        → ${ok} ${summarizeBody(o)}` };
    }
    case "finish":
      return { dir: "sys", text: `✓ finish: ${ev.answer}` };
    case "aborted":
      return { dir: "sys", text: `✗ aborted: ${ev.reason}` };
    case "error":
      return { dir: "sys", text: `✗ error: ${ev.error}` };
    default:
      return { dir: "sys", text: summarizeBody(ev) };
  }
}

export function AgentConsole({
  container,
  onStatus,
  onPreview,
}: {
  container: Container;
  onStatus?: (s: Container["status"]) => void;
  onPreview?: (p: ContainerPreview) => void;
}) {
  const workerRef = useRef<Worker | null>(null);
  const reqId = useRef(0);
  const pending = useRef(new Map<number, (v: { status: number; body: unknown }) => void>());
  const [ready, setReady] = useState(false);
  const [method, setMethod] = useState("GET");
  const [path, setPath] = useState("/health");
  const [body, setBody] = useState("");
  const [goal, setGoal] = useState(GOAL_SAMPLES[0]);
  const [apiKey, setApiKey] = useState("");
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [policyText, setPolicyText] = useState(container.settings.policyYaml ?? DEFAULT_AGENT_POLICY_YAML);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const onPreviewRef = useRef(onPreview);
  onPreviewRef.current = onPreview;

  const applyPolicy = useCallback((text: string) => {
    try {
      const parsed = parsePolicy(text);
      workerRef.current?.postMessage({ type: "policy", policy: parsed });
      setPolicyError(null);
      return true;
    } catch (err) {
      setPolicyError((err as Error).message);
      return false;
    }
  }, []);

  const applyNetwork = useCallback((network: Container["settings"]["network"]) => {
    workerRef.current?.postMessage({ type: "network", network });
  }, []);

  useEffect(() => {
    const worker = new Worker(`${BASE_PATH}/workers/headless-worker.js`, { type: "module" });
    workerRef.current = worker;
    worker.onmessage = (ev) => {
      const msg = ev.data || {};
      if (msg.type === "ready") {
        setReady(true);
        onStatus?.("running");
        applyNetwork(container.settings.network);
        applyPolicy(container.settings.policyYaml ?? DEFAULT_AGENT_POLICY_YAML);
        setLog((l) => [
          ...l,
          {
            dir: "sys",
            text: `agent runtime ready — policy applied, network=${container.settings.network}`,
          },
        ]);
      } else if (msg.type === "agent-event") {
        setLog((l) => [...l, formatEvent(msg.event as AgentEvent)]);
      } else if (msg.type === "response") {
        const resolve = pending.current.get(msg.id);
        if (resolve) {
          pending.current.delete(msg.id);
          resolve({ status: msg.status, body: msg.body });
        }
      }
    };
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container.id]);

  useEffect(() => {
    if (!ready) return;
    applyNetwork(container.settings.network);
  }, [ready, container.settings.network, applyNetwork]);

  useEffect(() => {
    if (!onPreviewRef.current || !log.length) return;
    const text = log
      .slice(-10)
      .map((l) => (l.dir === "in" ? "→ " : l.dir === "out" ? "← " : "• ") + l.text)
      .join("\n");
    onPreviewRef.current({ kind: "text", data: text, at: new Date().toISOString() });
  }, [log]);

  const send = useCallback(() => {
    const worker = workerRef.current;
    if (!worker) return;
    let parsed: unknown = undefined;
    if (body.trim()) {
      try {
        parsed = JSON.parse(body);
      } catch {
        setLog((l) => [...l, { dir: "sys", text: "request body is not valid JSON" }]);
        return;
      }
    }
    const id = ++reqId.current;
    setLog((l) => [
      ...l,
      { dir: "in", text: `${method} ${path}${parsed !== undefined ? ` ${JSON.stringify(parsed)}` : ""}` },
    ]);
    const p = new Promise<{ status: number; body: unknown }>((resolve) => pending.current.set(id, resolve));
    worker.postMessage({ type: "request", id, payload: { method, path, body: parsed } });
    p.then((res) => setLog((l) => [...l, { dir: "out", text: `${res.status} ${summarizeBody(res.body)}` }]));
  }, [method, path, body]);

  const runAgentTask = useCallback(() => {
    const worker = workerRef.current;
    if (!worker || !goal.trim() || running) return;
    setRunning(true);
    const id = ++reqId.current;
    setLog((l) => [...l, { dir: "in", text: `run agent — ${goal.trim()}` }]);
    const payload: { goal: string; apiKey?: string } = { goal: goal.trim() };
    if (apiKey.trim()) payload.apiKey = apiKey.trim();
    const p = new Promise<{ status: number; body: unknown }>((resolve) => pending.current.set(id, resolve));
    worker.postMessage({ type: "request", id, payload: { method: "POST", path: "/agent/run", body: payload } });
    p.then((res) => {
      const b = res.body as { status?: string; steps?: number } | undefined;
      setLog((l) => [...l, { dir: "sys", text: `agent ${b?.status ?? "done"} in ${b?.steps ?? 0} step(s)` }]);
      setRunning(false);
    });
  }, [goal, apiKey, running]);

  function savePolicy() {
    if (applyPolicy(policyText)) {
      void saveContainer({ ...container, settings: { ...container.settings, policyYaml: policyText } });
      setLog((l) => [...l, { dir: "sys", text: "policy saved and hot-reloaded" }]);
    }
  }

  return (
    <div className="flex h-full w-full">
      <div className="flex w-80 shrink-0 flex-col border-r border-gray-alpha-400 bg-background-100">
        <div className="border-b border-gray-alpha-400 px-3 py-2 text-label-12 font-medium text-gray-900">
          OpenShell Policy
        </div>
        <textarea
          value={policyText}
          onChange={(e) => setPolicyText(e.target.value)}
          spellCheck={false}
          className="flex-1 resize-none bg-background-100 p-3 font-mono text-copy-13 text-gray-1000 outline-none"
        />
        {policyError && <p className="px-3 py-1 text-copy-13 text-red-800">{policyError}</p>}
        <div className="border-t border-gray-alpha-400 p-2">
          <button type="button" onClick={savePolicy} className="btn-primary btn-small w-full">
            Apply Policy
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col bg-black">
        <div className="border-b border-gray-alpha-400 bg-background-100 p-3">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {GOAL_SAMPLES.map((g) => (
              <button
                key={g}
                type="button"
                className="btn-secondary btn-small"
                onClick={() => setGoal(g)}
                title={g}
              >
                {g.length > 32 ? `${g.slice(0, 32)}…` : g}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className="input flex-1 font-mono text-copy-13"
              placeholder="Give the agent a goal…"
              aria-label="Agent goal"
            />
            <button
              type="button"
              onClick={runAgentTask}
              disabled={!ready || running || !goal.trim()}
              className="btn-primary"
            >
              {running ? "Running…" : "Run agent"}
            </button>
          </div>
          <input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="input mt-2 font-mono text-copy-13"
            placeholder="Model API key — optional; blank runs the built-in planner"
            aria-label="Model API key"
            type="password"
          />
        </div>
        <div className="flex-1 overflow-auto p-4 font-mono text-copy-13 leading-relaxed">
          {log.length === 0 ? (
            <p className="text-gray-700">No calls yet. Give the agent a goal, or send a request below.</p>
          ) : (
            log.map((line, i) => (
              <div
                key={i}
                className={
                  line.dir === "in"
                    ? "text-blue-600"
                    : line.dir === "out"
                      ? "text-green-600"
                      : line.dir === "act"
                        ? "text-amber-600"
                        : "text-gray-700"
                }
              >
                <span className="select-none text-gray-700">
                  {line.dir === "in" ? "→ " : line.dir === "out" ? "← " : line.dir === "act" ? "» " : "• "}
                </span>
                <span className="break-all whitespace-pre-wrap">{line.text}</span>
              </div>
            ))
          )}
        </div>
        <div className="border-t border-gray-alpha-400 bg-background-100 p-3">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {SAMPLES.map((s) => (
              <button
                key={s.label}
                type="button"
                className="btn-secondary btn-small"
                onClick={() => {
                  setMethod(s.method);
                  setPath(s.path);
                  setBody(s.body);
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="input w-24"
              aria-label="HTTP method"
            >
              <option>GET</option>
              <option>POST</option>
            </select>
            <input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              className="input flex-1"
              placeholder="/health"
              aria-label="Request path"
            />
            <button type="button" onClick={send} disabled={!ready} className="btn-primary">
              Send
            </button>
          </div>
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="input mt-2 font-mono text-copy-13"
            placeholder='JSON body, e.g. { "url": "https://api.github.com/zen", "method": "GET" }'
            aria-label="Request body"
          />
        </div>
      </div>
    </div>
  );
}
