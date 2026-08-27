"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BASE_PATH } from "@/lib/base-path";
import { DEFAULT_AGENT_POLICY_YAML, parsePolicy } from "@/lib/policy";
import { saveContainer } from "@/lib/containers-db";
import type { AgentTranscriptLine, Container, ContainerPreview } from "@/lib/container";
import {
  formatProviderList,
  formatReleaseList,
  formatSkillLine,
  formatToolLine,
  getHermesProvider,
  getHermesRelease,
  HERMES_BANNER,
  HERMES_CADUCEUS,
  HERMES_DEFAULT_MODEL,
  HERMES_EXTRA_TOOLSET_COUNT,
  HERMES_HELP,
  HERMES_PROVIDERS,
  HERMES_RELEASES,
  HERMES_SKILL_COUNT,
  HERMES_SKILLSETS,
  HERMES_TIP,
  HERMES_TOOL_COUNT,
  HERMES_TOOLSETS,
  HERMES_VENDOR,
  newHermesSessionId,
  parseHermesModelArg,
} from "@/lib/hermes";
import styles from "./HermesTerminal.module.css";

type LineKind = AgentTranscriptLine["kind"];

interface TermLine {
  id: string;
  kind: LineKind;
  text: string;
}

interface HermesRuntimeSettings {
  model: string;
  apiKey: string;
  apiHost: string;
  apiPath: string;
  quiet: boolean;
  providerId: string;
  releaseId: string;
}

function lineId(): string {
  return `ln-${Math.random().toString(36).slice(2, 10)}`;
}

function elapsedLabel(startedAt: number): string {
  const s = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m${String(r).padStart(2, "0")}s`;
}

function readHermesSettings(container: Container): HermesRuntimeSettings {
  const s = container.settings;
  const provider = getHermesProvider(s.hermesProvider);
  const release = getHermesRelease(s.hermesReleaseId);
  return {
    model: s.hermesModel || provider.defaultModel || HERMES_DEFAULT_MODEL,
    apiKey: s.hermesApiKey || "",
    apiHost: s.hermesApiHost || provider.host,
    apiPath: s.hermesApiPath || provider.path,
    quiet: Boolean(s.hermesQuiet),
    providerId: s.hermesProvider || provider.id,
    releaseId: release.id,
  };
}

export function HermesTerminal({
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
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const startedAt = useRef(Date.now());
  const sessionId = useRef(container.settings.hermesSessionId || newHermesSessionId());
  const containerRef = useRef(container);
  containerRef.current = container;
  const linesRef = useRef<TermLine[]>([]);
  const runtimeRef = useRef<HermesRuntimeSettings>(readHermesSettings(container));

  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [runtime, setRuntime] = useState<HermesRuntimeSettings>(runtimeRef.current);
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
  const release = getHermesRelease(runtime.releaseId);
  const provider = getHermesProvider(runtime.providerId);

  const callWorker = useCallback((payload: { method: string; path: string; body?: unknown }) => {
    const worker = workerRef.current;
    if (!worker) return Promise.reject(new Error("worker not ready"));
    const id = ++reqId.current;
    const p = new Promise<{ status: number; body: unknown }>((resolve) => pending.current.set(id, resolve));
    worker.postMessage({ type: "request", id, payload });
    return p;
  }, []);

  const persist = useCallback(
    async (nextLines: TermLine[], nextRuntime?: HermesRuntimeSettings) => {
      const rt = nextRuntime ?? runtimeRef.current;
      const transcript = nextLines
        .filter((l) => l.kind === "in" || l.kind === "out" || l.kind === "err" || l.kind === "sys")
        .slice(-200)
        .map((l) => ({ kind: l.kind, text: l.text }));
      const updated: Container = {
        ...containerRef.current,
        settings: {
          ...containerRef.current.settings,
          hermesModel: rt.model,
          hermesApiKey: rt.apiKey,
          hermesApiHost: rt.apiHost,
          hermesApiPath: rt.apiPath,
          hermesProvider: rt.providerId,
          hermesReleaseId: rt.releaseId,
          hermesQuiet: rt.quiet,
          hermesSessionId: sessionId.current,
        },
        agentTranscript: transcript,
      };
      containerRef.current = updated;
      onContainerChange?.(updated);
      try {
        await saveContainer(updated);
      } catch (err) {
        console.error("hermes persist failed", err);
      }
    },
    [onContainerChange],
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
    (patch: Partial<HermesRuntimeSettings>, note?: string) => {
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
    onPreview({ kind: "text", data: text || "Hermes Agent", at: new Date().toISOString() });
  }, [lines, onPreview]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [ready]);

  const handleSlash = useCallback(
    async (raw: string) => {
      const [cmd, ...rest] = raw.slice(1).trim().split(/\s+/);
      const arg = rest.join(" ").trim();
      switch (cmd.toLowerCase()) {
        case "help":
          append("out", HERMES_HELP);
          return;
        case "clear":
          linesRef.current = [];
          setLines([]);
          void persist([]);
          return;
        case "status": {
          const up = elapsedLabel(startedAt.current);
          const rt = runtimeRef.current;
          const rel = getHermesRelease(rt.releaseId);
          const prov = getHermesProvider(rt.providerId);
          append(
            "out",
            [
              `Hermes Agent v${rel.version} (${rel.buildDate})`,
              `provider: ${prov.id} (${prov.label})`,
              `model: ${rt.model} · ${HERMES_VENDOR}`,
              `session: ${sessionId.current}`,
              `path: ${workspacePath}`,
              `api: ${rt.apiHost}${rt.apiPath}`,
              `key: ${rt.apiKey ? "set" : prov.allowEmptyKey ? "optional" : "missing"}`,
              `uptime: ${up}`,
              `worker: ${ready ? "ready" : "booting"}`,
            ].join("\n"),
          );
          return;
        }
        case "provider": {
          if (!arg) {
            append("out", formatProviderList(runtimeRef.current.providerId));
            return;
          }
          const id = arg.toLowerCase();
          const next = HERMES_PROVIDERS.find((p) => p.id === id);
          if (!next) {
            append(
              "err",
              `unknown provider: ${arg}. Try /provider for the list (${HERMES_PROVIDERS.map((p) => p.id).join(", ")}).`,
            );
            return;
          }
          updateRuntime(
            {
              providerId: next.id,
              apiHost: next.host,
              apiPath: next.path,
              model: next.defaultModel,
            },
            `provider set to ${next.id} (${next.label}) · model ${next.defaultModel}`,
          );
          if (next.note) append("sys", next.note);
          return;
        }
        case "model": {
          if (!arg) {
            const rt = runtimeRef.current;
            append("out", `model: ${rt.model}\nprovider: ${rt.providerId}`);
            return;
          }
          const parsed = parseHermesModelArg(arg);
          if (!parsed.model) {
            append("err", "Usage: /model <name> or /model provider:model");
            return;
          }
          if (parsed.providerId) {
            const next = getHermesProvider(parsed.providerId);
            updateRuntime(
              {
                providerId: next.id,
                apiHost: next.host,
                apiPath: next.path,
                model: parsed.model,
              },
              `model set to ${parsed.model} via ${next.id}`,
            );
            return;
          }
          updateRuntime({ model: parsed.model }, `model set to ${parsed.model}`);
          return;
        }
        case "version": {
          if (!arg) {
            append("out", formatReleaseList(runtimeRef.current.releaseId));
            return;
          }
          const next = HERMES_RELEASES.find((r) => r.id === arg || r.version === arg);
          if (!next) {
            append(
              "err",
              `unknown release: ${arg}. Try /version for the list (${HERMES_RELEASES.map((r) => r.id).join(", ")}).`,
            );
            return;
          }
          updateRuntime(
            { releaseId: next.id },
            `Hermes Agent release set to v${next.version} (${next.buildDate})`,
          );
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
            const path = u.pathname === "/" ? "/v1/chat/completions" : u.pathname;
            updateRuntime(
              {
                apiHost: u.hostname,
                apiPath: path,
                providerId: "custom",
              },
              `base set to https://${u.hostname}${path} (provider: custom)`,
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
        case "tools":
          append(
            "out",
            HERMES_TOOLSETS.map(formatToolLine).join("\n") +
              `\n(and ${HERMES_EXTRA_TOOLSET_COUNT} more toolsets…)`,
          );
          return;
        case "skills":
          append("out", HERMES_SKILLSETS.map(formatSkillLine).join("\n"));
          return;
        case "quiet":
          updateRuntime({ quiet: !runtimeRef.current.quiet }, `quiet mode ${!runtimeRef.current.quiet ? "on" : "off"}`);
          return;
        default:
          append("err", `unknown command: /${cmd}. Try /help.`);
      }
    },
    [append, callWorker, persist, ready, updateRuntime],
  );

  const sendChat = useCallback(
    async (text: string) => {
      const rt = runtimeRef.current;
      const prov = getHermesProvider(rt.providerId);
      if (!rt.apiKey && !prov.allowEmptyKey) {
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
          {
            role: "system",
            content:
              "You are Hermes Agent (Nous Research), running inside a clientside-containers OpenShell-style sandbox in the browser. Be concise and helpful.",
          },
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
            allowEmptyKey: Boolean(prov.allowEmptyKey),
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
    [append, callWorker],
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

  // `tick` re-renders so the prompt clock advances each second.
  const statusTime = elapsedLabel(startedAt.current + tick * 0);

  return (
    <div
      className={`${styles.term} flex h-full w-full flex-col`}
      onClick={() => inputRef.current?.focus()}
      role="application"
      aria-label="Hermes Agent terminal"
    >
      <div ref={scrollRef} className="flex-1 overflow-auto px-4 py-3 font-mono text-[13px] leading-relaxed">
        {!runtime.quiet && (
          <div className="mb-4">
            <pre className={`${styles.banner} overflow-x-auto whitespace-pre`}>{HERMES_BANNER}</pre>
            <div className={`${styles.panel} mt-3`}>
              <div className={styles.panelTitle}>
                Hermes Agent v{release.version} ({release.buildDate}) · upstream {release.upstream}
              </div>
              <div className="grid gap-4 p-3 md:grid-cols-[220px_1fr]">
                <div>
                  <pre className={`${styles.caduceus} whitespace-pre text-[10px] leading-tight`}>
                    {HERMES_CADUCEUS}
                  </pre>
                  <div className="mt-2 space-y-0.5 text-[12px]">
                    <div>
                      <span className={styles.accent}>{runtime.model}</span>
                      <span className="text-gray-600"> · {HERMES_VENDOR}</span>
                    </div>
                    <div className="text-gray-600">
                      provider: {provider.id}
                    </div>
                    <div className="text-gray-600">{workspacePath}</div>
                    <div className="text-gray-600">Session: {sessionId.current}</div>
                  </div>
                </div>
                <div className="min-w-0 space-y-3 text-[12px]">
                  <div>
                    <div className={`${styles.accent} mb-1 font-medium`}>Available Tools</div>
                    <ul className="space-y-0.5 text-gray-300">
                      {HERMES_TOOLSETS.map((t) => (
                        <li key={t.name} className="truncate">
                          <span className={styles.accent}>{t.name}</span>
                          <span className="text-gray-500">: </span>
                          {t.tools.slice(0, 4).join(", ")}
                          {t.tools.length > 4 ? ", ..." : ""}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-1 text-gray-600">
                      (and {HERMES_EXTRA_TOOLSET_COUNT} more toolsets…)
                    </div>
                  </div>
                  <div>
                    <div className={`${styles.accent} mb-1 font-medium`}>Available Skills</div>
                    <ul className="columns-1 gap-x-6 space-y-0.5 text-gray-300 sm:columns-2">
                      {HERMES_SKILLSETS.map((s) => (
                        <li key={s.name} className="break-inside-avoid truncate">
                          <span className={styles.accent}>{s.name}</span>
                          <span className="text-gray-500">: </span>
                          {s.skills.join(", ")}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
              <div className={styles.panelFooter}>
                {HERMES_TOOL_COUNT} tools · {HERMES_SKILL_COUNT} skills · /help for commands
              </div>
            </div>
            <p className="mt-3 text-gray-200">Welcome to Hermes Agent! Type your message or /help for commands.</p>
            <p className={`${styles.tip} mt-1`}>
              <span aria-hidden>✦</span> Tip: {HERMES_TIP}
            </p>
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
          <span className="text-gray-500">{provider.id}</span>
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
            aria-label="Hermes input"
            spellCheck={false}
            autoComplete="off"
          />
          <span className={styles.cursor} aria-hidden />
        </div>
      </div>
    </div>
  );
}
