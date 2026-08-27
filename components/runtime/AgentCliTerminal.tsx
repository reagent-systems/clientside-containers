"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BASE_PATH } from "@/lib/base-path";
import { DEFAULT_AGENT_POLICY_YAML, parsePolicy } from "@/lib/policy";
import { saveContainer } from "@/lib/containers-db";
import type { AgentTranscriptLine, Container, ContainerPreview, ContainerSettings } from "@/lib/container";
import {
  elapsedLabel,
  formatModelList,
  newAgentCliSessionId,
  type AgentCliApiStyle,
  type AgentCliRuntime,
} from "@/lib/agent-cli";

type LineKind = AgentTranscriptLine["kind"];

interface TermLine {
  id: string;
  kind: LineKind;
  text: string;
}

export interface AgentCliTheme {
  term: string;
  accent: string;
  banner: string;
  panel: string;
  panelTitle: string;
  panelFooter: string;
  tip: string;
  promptBar: string;
  input: string;
  err: string;
  in: string;
  cursor: string;
}

export interface AgentCliProfile {
  id: string;
  productName: string;
  vendor: string;
  version: string;
  banner: string;
  welcome: string;
  tip?: string;
  help: string;
  systemPrompt: string;
  defaultModel: string;
  models: string[];
  defaultHost: string;
  defaultPath: string;
  apiStyle: AgentCliApiStyle;
  tools?: string[];
  toolsHeading?: string;
  readSettings: (container: Container) => AgentCliRuntime;
  readSessionId: (container: Container) => string | undefined;
  writeSettings: (rt: AgentCliRuntime, sessionId: string) => Partial<ContainerSettings>;
  /** Extra slash commands beyond the shared set. Return true if handled. */
  handleExtraSlash?: (
    cmd: string,
    arg: string,
    ctx: { append: (kind: LineKind, text: string) => void; runtime: AgentCliRuntime },
  ) => boolean;
}

function lineId(): string {
  return `ln-${Math.random().toString(36).slice(2, 10)}`;
}

export function AgentCliTerminal({
  container,
  profile,
  styles,
  onStatus,
  onPreview,
  onContainerChange,
}: {
  container: Container;
  profile: AgentCliProfile;
  styles: AgentCliTheme;
  onStatus?: (s: Container["status"]) => void;
  onPreview?: (p: ContainerPreview) => void;
  onContainerChange?: (c: Container) => void;
}) {
  const workerRef = useRef<Worker | null>(null);
  const reqId = useRef(0);
  const pending = useRef(new Map<number, (v: { status: number; body: unknown }) => void>());
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const startedAt = useRef(Date.now());
  const sessionId = useRef(profile.readSessionId(container) || newAgentCliSessionId());
  const containerRef = useRef(container);
  containerRef.current = container;
  const linesRef = useRef<TermLine[]>([]);
  const runtimeRef = useRef<AgentCliRuntime>(profile.readSettings(container));

  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [runtime, setRuntime] = useState<AgentCliRuntime>(runtimeRef.current);
  const [lines, setLines] = useState<TermLine[]>(() => {
    const initial = (container.agentTranscript || []).map((t) => ({
      id: lineId(),
      kind: t.kind,
      text: t.text,
    }));
    linesRef.current = initial;
    return initial;
  });

  const workspacePath = "/workspace";

  const callWorker = useCallback((payload: { method: string; path: string; body?: unknown }) => {
    const worker = workerRef.current;
    if (!worker) return Promise.reject(new Error("worker not ready"));
    const id = ++reqId.current;
    const p = new Promise<{ status: number; body: unknown }>((resolve) => pending.current.set(id, resolve));
    worker.postMessage({ type: "request", id, payload });
    return p;
  }, []);

  const persist = useCallback(
    async (nextLines: TermLine[], nextRuntime?: AgentCliRuntime) => {
      const rt = nextRuntime ?? runtimeRef.current;
      const transcript = nextLines
        .filter((l) => l.kind === "in" || l.kind === "out" || l.kind === "err" || l.kind === "sys")
        .slice(-200)
        .map((l) => ({ kind: l.kind, text: l.text }));
      const updated: Container = {
        ...containerRef.current,
        settings: {
          ...containerRef.current.settings,
          ...profile.writeSettings(rt, sessionId.current),
        },
        agentTranscript: transcript,
      };
      containerRef.current = updated;
      onContainerChange?.(updated);
      try {
        await saveContainer(updated);
      } catch (err) {
        console.error(`${profile.id} persist failed`, err);
      }
    },
    [onContainerChange, profile],
  );

  const append = useCallback(
    (kind: LineKind, text: string) => {
      const next = [...linesRef.current, { id: lineId(), kind, text }];
      linesRef.current = next;
      setLines(next);
      void persist(next);
    },
    [persist],
  );

  const updateRuntime = useCallback(
    (patch: Partial<AgentCliRuntime>, note?: string) => {
      const next = { ...runtimeRef.current, ...patch };
      runtimeRef.current = next;
      setRuntime(next);
      if (note) append("sys", note);
      void persist(linesRef.current, next);
    },
    [append, persist],
  );

  useEffect(() => {
    const worker = new Worker(`${BASE_PATH}/workers/headless-worker.js`, { type: "classic" });
    workerRef.current = worker;
    worker.onmessage = (ev) => {
      const msg = ev.data || {};
      if (msg.type === "ready") {
        setReady(true);
        onStatus?.("running");
        try {
          const parsed = parsePolicy(container.settings.policyYaml ?? DEFAULT_AGENT_POLICY_YAML);
          worker.postMessage({ type: "policy", policy: parsed });
        } catch {
          // ignore parse errors at boot
        }
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
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines, busy]);

  useEffect(() => {
    if (!onPreview) return;
    const text = lines
      .slice(-12)
      .map((l) => l.text)
      .join("\n");
    onPreview({ kind: "text", data: text || profile.productName, at: new Date().toISOString() });
  }, [lines, onPreview, profile.productName]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [ready]);

  const handleSlash = useCallback(
    async (raw: string) => {
      const [cmd, ...rest] = raw.slice(1).trim().split(/\s+/);
      const arg = rest.join(" ").trim();
      const name = cmd.toLowerCase();

      if (
        profile.handleExtraSlash?.(name, arg, {
          append,
          runtime: runtimeRef.current,
        })
      ) {
        return;
      }

      switch (name) {
        case "help":
        case "?":
          append("out", profile.help);
          return;
        case "clear":
          linesRef.current = [];
          setLines([]);
          void persist([]);
          return;
        case "status": {
          const up = elapsedLabel(startedAt.current);
          const rt = runtimeRef.current;
          append(
            "out",
            [
              `${profile.productName} v${profile.version}`,
              `vendor: ${profile.vendor}`,
              `model: ${rt.model}`,
              `session: ${sessionId.current}`,
              `path: ${workspacePath}`,
              `api: ${rt.apiHost}${rt.apiPath} (${profile.apiStyle})`,
              `key: ${rt.apiKey ? "set" : "missing"}`,
              `uptime: ${up}`,
              `worker: ${ready ? "ready" : "booting"}`,
            ].join("\n"),
          );
          return;
        }
        case "model": {
          if (!arg || arg === "list") {
            append("out", formatModelList(profile.models, runtimeRef.current.model));
            return;
          }
          const setArg = arg.replace(/^set\s+/i, "").trim();
          updateRuntime({ model: setArg }, `model set to ${setArg}`);
          return;
        }
        case "key": {
          if (!arg) {
            append(
              "out",
              runtimeRef.current.apiKey ? "API key is set." : "API key is not set. Usage: /key <token>",
            );
            return;
          }
          updateRuntime({ apiKey: arg }, "API key saved.");
          return;
        }
        case "base": {
          if (!arg) {
            const rt = runtimeRef.current;
            append("out", `base: https://${rt.apiHost}${rt.apiPath}`);
            return;
          }
          try {
            const u = new URL(arg.includes("://") ? arg : `https://${arg}`);
            const path = u.pathname === "/" ? profile.defaultPath : u.pathname;
            updateRuntime(
              { apiHost: u.hostname, apiPath: path },
              `base set to https://${u.hostname}${path}`,
            );
          } catch {
            append("err", "invalid base URL");
          }
          return;
        }
        case "policy": {
          try {
            const res = await callWorker({ method: "GET", path: "/policy" });
            append("out", JSON.stringify(res.body, null, 2));
          } catch (err) {
            append("err", String(err));
          }
          return;
        }
        case "quiet":
          updateRuntime(
            { quiet: !runtimeRef.current.quiet },
            `quiet mode ${!runtimeRef.current.quiet ? "on" : "off"}`,
          );
          return;
        default:
          append("err", `unknown command: /${cmd}. Try /help.`);
      }
    },
    [append, callWorker, persist, profile, ready, updateRuntime],
  );

  const sendChat = useCallback(
    async (text: string) => {
      const rt = runtimeRef.current;
      if (!rt.apiKey) {
        append("err", "No API key. Set one with /key <token>, then send your message again.");
        return;
      }
      setBusy(true);
      try {
        const history = linesRef.current
          .filter((l) => l.kind === "in" || l.kind === "out")
          .slice(-20)
          .map((l) => ({
            role: l.kind === "in" ? "user" : "assistant",
            content: l.text,
          }));
        const messages = [
          { role: "system", content: profile.systemPrompt },
          ...history,
          { role: "user", content: text },
        ];
        const res = await callWorker({
          method: "POST",
          path: "/agent/chat",
          body: {
            host: rt.apiHost,
            path: rt.apiPath,
            model: rt.model,
            apiKey: rt.apiKey,
            apiStyle: profile.apiStyle,
            messages,
          },
        });
        const body = (res.body || {}) as {
          content?: string;
          error?: string;
          reason?: string;
          verdict?: string;
          cause?: string;
        };
        if (res.status >= 400 || body.error || body.verdict === "deny") {
          append(
            "err",
            [body.error || body.reason || `chat failed (${res.status})`, body.cause || body.verdict]
              .filter(Boolean)
              .join(" — "),
          );
        } else {
          append("out", body.content || "(empty response)");
        }
      } catch (err) {
        append("err", String(err));
      } finally {
        setBusy(false);
      }
    },
    [append, callWorker, profile.apiStyle, profile.systemPrompt],
  );

  const onSubmit = useCallback(async () => {
    const text = draft.trim();
    if (!text || busy || !ready) return;
    setDraft("");
    append("in", text);
    if (text.startsWith("/")) {
      await handleSlash(text);
      return;
    }
    await sendChat(text);
  }, [append, busy, draft, handleSlash, ready, sendChat]);

  const statusTime = elapsedLabel(startedAt.current + tick * 0);

  return (
    <div
      className={`${styles.term} flex h-full w-full flex-col`}
      onClick={() => inputRef.current?.focus()}
      role="application"
      aria-label={`${profile.productName} terminal`}
    >
      <div ref={scrollRef} className="flex-1 overflow-auto px-4 py-3 font-mono text-[13px] leading-relaxed">
        {!runtime.quiet && (
          <div className="mb-4">
            <pre className={`${styles.banner} overflow-x-auto whitespace-pre`}>{profile.banner}</pre>
            <div className={`${styles.panel} mt-3`}>
              <div className={styles.panelTitle}>
                {profile.productName} v{profile.version} · {profile.vendor}
              </div>
              <div className="grid gap-4 p-3 md:grid-cols-[1fr_1fr]">
                <div className="space-y-0.5 text-[12px]">
                  <div>
                    <span className={styles.accent}>{runtime.model}</span>
                    <span className="text-gray-600"> · {profile.vendor}</span>
                  </div>
                  <div className="text-gray-600">{workspacePath}</div>
                  <div className="text-gray-600">Session: {sessionId.current}</div>
                  <div className="text-gray-600">
                    api: {runtime.apiHost}
                    {runtime.apiPath}
                  </div>
                </div>
                {profile.tools && profile.tools.length > 0 && (
                  <div className="min-w-0 text-[12px]">
                    <div className={`${styles.accent} mb-1 font-medium`}>
                      {profile.toolsHeading || "Tools"}
                    </div>
                    <ul className="columns-1 gap-x-4 space-y-0.5 text-gray-300 sm:columns-2">
                      {profile.tools.map((t) => (
                        <li key={t} className="truncate">
                          <span className={styles.accent}>{t}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <div className={styles.panelFooter}>/help for commands</div>
            </div>
            <p className="mt-3 text-gray-200">{profile.welcome}</p>
            {profile.tip && (
              <p className={`${styles.tip} mt-1`}>
                <span aria-hidden>✦</span> {profile.tip}
              </p>
            )}
          </div>
        )}

        <div className="space-y-2">
          {lines.map((l) => (
            <div
              key={l.id}
              className={
                l.kind === "in"
                  ? `${styles.in} whitespace-pre-wrap break-words`
                  : l.kind === "err"
                    ? `${styles.err} whitespace-pre-wrap break-words`
                    : l.kind === "sys"
                      ? "whitespace-pre-wrap break-words text-gray-700"
                      : l.kind === "tip"
                        ? `${styles.tip} whitespace-pre-wrap break-words`
                        : "whitespace-pre-wrap break-words text-gray-1000"
              }
            >
              {l.kind === "in" ? `› ${l.text}` : l.text}
            </div>
          ))}
          {busy && <div className="text-gray-500">thinking…</div>}
        </div>
      </div>

      <div className={`${styles.promptBar} shrink-0 px-3 py-2`}>
        <div className="flex items-center gap-2 font-mono text-[13px]">
          <span className={styles.accent}>$</span>
          <span className={styles.accent}>{runtime.model}</span>
          <span className="text-gray-600">|</span>
          <span className="text-gray-500">ctx --</span>
          <span className="text-gray-600">|</span>
          <span className="text-gray-500">[ {busy ? "####" : "    "} ]</span>
          <span className="text-gray-600">|</span>
          <span className="text-gray-500">{statusTime}</span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className={`${styles.accent} select-none`}>›</span>
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void onSubmit();
              }
            }}
            disabled={!ready || busy}
            className={`${styles.input} flex-1 bg-transparent font-mono text-[13px] outline-none`}
            placeholder={ready ? "message or /help" : "starting…"}
            aria-label={`${profile.productName} input`}
            spellCheck={false}
            autoComplete="off"
          />
          <span className={styles.cursor} aria-hidden />
        </div>
      </div>
    </div>
  );
}
