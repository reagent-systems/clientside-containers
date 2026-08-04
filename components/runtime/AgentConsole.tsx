"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BASE_PATH } from "@/lib/base-path";
import { DEFAULT_AGENT_POLICY_YAML, parsePolicy } from "@/lib/policy";
import { saveContainer } from "@/lib/containers-db";
import { getAgentPreset } from "@/lib/agents";
import {
  emptyAgentSession,
  makeMessage,
  type AgentConsoleLine,
  type AgentMessage,
  type AgentProvider,
  type AgentSession,
} from "@/lib/agent-session";
import type { Container, ContainerPreview, ContainerSettings } from "@/lib/container";

type Tab = "chat" | "console";

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
  { label: "eval", method: "POST", path: "/eval", body: '{ "expr": "2 + 40" }' },
];

function summarizeBody(body: unknown): string {
  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}

function visibleMessages(messages: AgentMessage[]): AgentMessage[] {
  return messages.filter((m) => m.role !== "system");
}

export function AgentConsole({
  container,
  onStatus,
  onPreview,
  onContainerChange,
}: {
  container: Container;
  onStatus?: (s: Container["status"]) => void;
  onPreview?: (p: ContainerPreview) => void;
  onContainerChange?: (c: Container) => void;
}) {
  const workerRef = useRef<Worker | null>(null);
  const reqId = useRef(0);
  const pending = useRef(new Map<number, (v: { status: number; body: unknown }) => void>());
  const containerRef = useRef(container);
  containerRef.current = container;

  const preset = getAgentPreset(container.agentId);
  const initialSession = container.agentSession ?? emptyAgentSession();
  const seededMessages =
    initialSession.messages?.length > 0
      ? initialSession.messages
      : preset.systemPrompt
        ? [makeMessage("system", preset.systemPrompt)]
        : [];
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("chat");
  const [method, setMethod] = useState("GET");
  const [path, setPath] = useState("/health");
  const [body, setBody] = useState("");
  const [log, setLog] = useState<AgentConsoleLine[]>(initialSession.consoleLog ?? []);
  const [messages, setMessages] = useState<AgentMessage[]>(seededMessages);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [turnError, setTurnError] = useState<string | null>(null);
  const [policyText, setPolicyText] = useState(container.settings.policyYaml ?? DEFAULT_AGENT_POLICY_YAML);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [provider, setProvider] = useState<AgentProvider>(container.settings.provider ?? "anthropic");
  const [model, setModel] = useState(container.settings.model ?? "claude-sonnet-4-20250514");
  const [apiBaseUrl, setApiBaseUrl] = useState(container.settings.apiBaseUrl ?? "");
  const [apiKey, setApiKey] = useState(container.settings.apiKey ?? "");
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const onPreviewRef = useRef(onPreview);
  onPreviewRef.current = onPreview;

  const persistSession = useCallback(
    async (next: Partial<AgentSession>, settingsPatch?: Partial<ContainerSettings>) => {
      const current = containerRef.current;
      const agentSession: AgentSession = {
        messages: next.messages ?? messages,
        consoleLog: next.consoleLog ?? log,
        files: next.files ?? current.agentSession?.files ?? {},
      };
      const updated: Container = {
        ...current,
        settings: settingsPatch ? { ...current.settings, ...settingsPatch } : current.settings,
        agentSession,
      };
      containerRef.current = updated;
      onContainerChange?.(updated);
      try {
        await saveContainer(updated);
      } catch (err) {
        console.error("agent session save failed", err);
      }
    },
    [log, messages, onContainerChange],
  );

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

  const callWorker = useCallback((payload: { method: string; path: string; body?: unknown }) => {
    const worker = workerRef.current;
    if (!worker) return Promise.reject(new Error("worker not ready"));
    const id = ++reqId.current;
    const p = new Promise<{ status: number; body: unknown }>((resolve) => pending.current.set(id, resolve));
    worker.postMessage({ type: "request", id, payload });
    return p;
  }, []);

  useEffect(() => {
    const worker = new Worker(`${BASE_PATH}/workers/headless-worker.js`, { type: "classic" });
    workerRef.current = worker;
    worker.onmessage = (ev) => {
      const msg = ev.data || {};
      if (msg.type === "ready") {
        setReady(true);
        onStatus?.("running");
        applyNetwork(container.settings.network);
        applyPolicy(container.settings.policyYaml ?? DEFAULT_AGENT_POLICY_YAML);
        const files = container.agentSession?.files;
        if (files && Object.keys(files).length) {
          worker.postMessage({ type: "fs-hydrate", files });
        }
        setLog((l) =>
          l.length
            ? l
            : [
                {
                  dir: "sys",
                  text: `agent runtime ready — network=${container.settings.network}`,
                },
              ],
        );
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
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    if (!onPreviewRef.current) return;
    const chatPreview = visibleMessages(messages)
      .slice(-8)
      .map((m) => `${m.role}: ${m.content.slice(0, 120)}`)
      .join("\n");
    const text =
      chatPreview ||
      log
        .slice(-8)
        .map((l) => (l.dir === "in" ? "→ " : l.dir === "out" ? "← " : "• ") + l.text)
        .join("\n");
    if (text) onPreviewRef.current({ kind: "text", data: text, at: new Date().toISOString() });
  }, [messages, log]);

  const sendConsole = useCallback(() => {
    if (!workerRef.current) return;
    let parsed: unknown = undefined;
    if (body.trim()) {
      try {
        parsed = JSON.parse(body);
      } catch {
        setLog((l) => {
          const next = [...l, { dir: "sys" as const, text: "request body is not valid JSON" }];
          void persistSession({ consoleLog: next });
          return next;
        });
        return;
      }
    }
    setLog((l) => {
      const next = [
        ...l,
        {
          dir: "in" as const,
          text: `${method} ${path}${parsed !== undefined ? ` ${JSON.stringify(parsed)}` : ""}`,
        },
      ];
      return next;
    });
    void callWorker({ method, path, body: parsed }).then((res) => {
      setLog((l) => {
        const next = [...l, { dir: "out" as const, text: `${res.status} ${summarizeBody(res.body)}` }];
        void persistSession({ consoleLog: next });
        return next;
      });
    });
  }, [body, callWorker, method, path, persistSession]);

  async function savePolicy() {
    if (!applyPolicy(policyText)) return;
    const updated = {
      ...containerRef.current,
      settings: { ...containerRef.current.settings, policyYaml: policyText },
    };
    containerRef.current = updated;
    onContainerChange?.(updated);
    await saveContainer(updated);
    setLog((l) => {
      const next = [...l, { dir: "sys" as const, text: "policy saved and hot-reloaded" }];
      void persistSession({ consoleLog: next }, { policyYaml: policyText });
      return next;
    });
  }

  async function saveInferenceSettings() {
    const patch: Partial<ContainerSettings> = { provider, model, apiBaseUrl, apiKey };
    await persistSession({}, patch);
    setLog((l) => {
      const next = [...l, { dir: "sys" as const, text: "inference settings saved" }];
      void persistSession({ consoleLog: next }, patch);
      return next;
    });
  }

  async function sendChat() {
    const text = draft.trim();
    if (!text || busy || !ready) return;
    setTurnError(null);
    setDraft("");
    const userMsg = makeMessage("user", text);
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setBusy(true);
    await persistSession({ messages: nextMessages }, { provider, model, apiBaseUrl, apiKey });

    try {
      const res = await callWorker({
        method: "POST",
        path: "/agent/turn",
        body: {
          messages: nextMessages,
          provider,
          model,
          apiKey,
          apiBaseUrl,
          maxToolRounds: 4,
        },
      });
      const resBody = (res.body || {}) as {
        messages?: AgentMessage[];
        files?: Record<string, string>;
        error?: string;
        cause?: string;
        reason?: string;
      };
      const produced = Array.isArray(resBody.messages) ? resBody.messages : [];
      const merged = [...nextMessages, ...produced];
      setMessages(merged);

      if (res.status >= 400 || resBody.error) {
        const errText = [resBody.error, resBody.reason, resBody.cause].filter(Boolean).join(" — ");
        setTurnError(errText || `turn failed (${res.status})`);
      }
      await persistSession({
        messages: merged,
        files: resBody.files ?? containerRef.current.agentSession?.files,
      });
    } catch (err) {
      setTurnError(String(err));
    } finally {
      setBusy(false);
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
        <div className="space-y-2 border-t border-gray-alpha-400 p-2">
          <button type="button" onClick={() => void savePolicy()} className="btn-primary btn-small w-full">
            Apply Policy
          </button>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col bg-background-100">
        <div className="flex items-center gap-2 border-b border-gray-alpha-400 px-3 py-2">
          <button
            type="button"
            className={tab === "chat" ? "btn-secondary btn-small" : "btn-tertiary btn-small"}
            onClick={() => setTab("chat")}
          >
            Agent
          </button>
          <button
            type="button"
            className={tab === "console" ? "btn-secondary btn-small" : "btn-tertiary btn-small"}
            onClick={() => setTab("console")}
          >
            API console
          </button>
          <span className="ml-auto truncate text-copy-13 text-gray-700">{preset.label}</span>
        </div>

        <div className="grid grid-cols-2 gap-2 border-b border-gray-alpha-400 p-2 md:grid-cols-4">
          <label className="block">
            <span className="label">Provider</span>
            <select
              className="input"
              value={provider}
              onChange={(e) => setProvider(e.target.value as AgentProvider)}
            >
              <option value="anthropic">anthropic</option>
              <option value="openai">openai</option>
              <option value="openai-compatible">openai-compatible</option>
            </select>
          </label>
          <label className="block">
            <span className="label">Model</span>
            <input className="input" value={model} onChange={(e) => setModel(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">Base URL</span>
            <input
              className="input"
              value={apiBaseUrl}
              onChange={(e) => setApiBaseUrl(e.target.value)}
              placeholder="optional"
            />
          </label>
          <label className="block">
            <span className="label">API key</span>
            <input
              className="input font-mono"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
            />
          </label>
        </div>
        <div className="flex justify-end border-b border-gray-alpha-400 px-2 py-1.5">
          <button type="button" className="btn-secondary btn-small" onClick={() => void saveInferenceSettings()}>
            Save inference settings
          </button>
        </div>

        {tab === "chat" ? (
          <>
            <div className="flex-1 space-y-3 overflow-auto bg-black p-4">
              {visibleMessages(messages).length === 0 ? (
                <p className="text-copy-13 text-gray-700">
                  Send a message to run {preset.label}. Tools and egress follow the OpenShell policy.
                </p>
              ) : (
                visibleMessages(messages).map((m) => (
                  <div key={m.id} className="font-mono text-copy-13 leading-relaxed">
                    <div className="mb-0.5 text-label-12 uppercase tracking-wide text-gray-700">
                      {m.role}
                      {m.toolName ? ` · ${m.toolName}` : ""}
                    </div>
                    <div
                      className={
                        m.role === "user"
                          ? "whitespace-pre-wrap break-words text-blue-600"
                          : m.role === "tool"
                            ? "whitespace-pre-wrap break-words text-gray-700"
                            : "whitespace-pre-wrap break-words text-green-600"
                      }
                    >
                      {m.content}
                    </div>
                  </div>
                ))
              )}
              {busy && <p className="text-copy-13 text-gray-700">Running agent turn…</p>}
              {turnError && <p className="text-copy-13 text-red-800">{turnError}</p>}
              <div ref={chatEndRef} />
            </div>
            <div className="border-t border-gray-alpha-400 bg-background-100 p-3">
              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendChat();
                    }
                  }}
                  placeholder="Message the agent"
                  aria-label="Agent message"
                  disabled={!ready || busy}
                />
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!ready || busy || !draft.trim()}
                  onClick={() => void sendChat()}
                >
                  Send
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex-1 overflow-auto bg-black p-4 font-mono text-copy-13 leading-relaxed">
              {log.length === 0 ? (
                <p className="text-gray-700">No calls yet.</p>
              ) : (
                log.map((line, i) => (
                  <div
                    key={i}
                    className={
                      line.dir === "in" ? "text-blue-600" : line.dir === "out" ? "text-green-600" : "text-gray-700"
                    }
                  >
                    <span className="select-none text-gray-700">
                      {line.dir === "in" ? "→ " : line.dir === "out" ? "← " : "• "}
                    </span>
                    <span className="whitespace-pre-wrap break-all">{line.text}</span>
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
                <button type="button" onClick={sendConsole} disabled={!ready} className="btn-primary">
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
          </>
        )}
      </div>
    </div>
  );
}
