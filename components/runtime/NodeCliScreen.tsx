"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { saveContainer } from "@/lib/containers-db";
import type { Container, ContainerPreview } from "@/lib/container";
import { getNodeCliProfile, type NodeCliProfile } from "@/lib/node-cli";
import {
  isCrossOriginIsolated,
  spawnNodeCli,
  type SpawnedCli,
} from "@/lib/webcontainer-runtime";

export function NodeCliScreen({
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
  const profile = getNodeCliProfile(container.agentId);
  const termHostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const spawnedRef = useRef<SpawnedCli | null>(null);
  const containerRef = useRef(container);
  containerRef.current = container;

  const [phase, setPhase] = useState<"booting" | "need-key" | "running" | "error">("booting");
  const [error, setError] = useState<string | null>(null);
  const [apiKeyDraft, setApiKeyDraft] = useState(() =>
    profile ? profile.readApiKey(container.settings) : "",
  );

  const writePreview = useCallback(
    (text: string) => {
      onPreview?.({
        kind: "text",
        data: text.slice(-800) || profile?.label || "Node CLI",
        at: new Date().toISOString(),
      });
    },
    [onPreview, profile?.label],
  );

  const persistKey = useCallback(
    async (key: string) => {
      if (!profile) return;
      const updated: Container = {
        ...containerRef.current,
        settings: { ...containerRef.current.settings, ...profile.writeApiKey(key) },
      };
      containerRef.current = updated;
      onContainerChange?.(updated);
      try {
        await saveContainer(updated);
      } catch (err) {
        console.error("persist api key failed", err);
      }
    },
    [onContainerChange, profile],
  );

  const startCli = useCallback(
    async (key: string, p: NodeCliProfile, term: Terminal) => {
      setPhase("booting");
      setError(null);
      onStatus?.("booting");

      if (!isCrossOriginIsolated()) {
        throw new Error(
          "Cross-origin isolation is required for WebContainer (SharedArrayBuffer). Reload after the COI service worker registers, or serve with COOP/COEP headers.",
        );
      }

      const fit = fitRef.current;
      fit?.fit();
      const cols = term.cols || 80;
      const rows = term.rows || 24;

      term.writeln(`\x1b[1m${p.label}\x1b[0m · ${p.vendor}`);
      term.writeln(`Booting Node runtime (WebContainer) and installing \x1b[36m${p.packageName}\x1b[0m…`);
      term.writeln("");

      const spawned = await spawnNodeCli(p, {
        apiKey: key,
        cols,
        rows,
        onData: (chunk) => {
          term.write(chunk);
          writePreview(chunk);
        },
      });
      spawnedRef.current = spawned;

      const dataSub = term.onData((data) => {
        void spawned.input.write(data);
      });

      setPhase("running");
      onStatus?.("running");

      const code = await spawned.process.exit;
      dataSub.dispose();
      spawnedRef.current = null;
      term.writeln(`\r\n\x1b[33m[${p.label} exited with code ${code}]\x1b[0m`);
      onStatus?.("stopped");
      setPhase("error");
      setError(`Process exited (${code}). Re-enter the API key area and click Start to relaunch.`);
    },
    [onStatus, writePreview],
  );

  useEffect(() => {
    if (!profile || !termHostRef.current) return;

    const term = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: 13,
      theme: {
        background: "#0a0a0a",
        foreground: "#ededed",
        cursor: "#ededed",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(termHostRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    const onResize = () => fit.fit();
    window.addEventListener("resize", onResize);

    const existingKey = profile.readApiKey(container.settings);
    if (!existingKey) {
      setPhase("need-key");
      term.writeln(`${profile.label} needs an API key (${profile.apiKeyEnv}).`);
      term.writeln("Enter it below, then click Start.");
      onStatus?.("stopped");
    } else {
      void startCli(existingKey, profile, term).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setPhase("error");
        term.writeln(`\r\n\x1b[31m${msg}\x1b[0m`);
        onStatus?.("error");
      });
    }

    return () => {
      window.removeEventListener("resize", onResize);
      void spawnedRef.current?.input.close().catch(() => undefined);
      spawnedRef.current?.process.kill();
      spawnedRef.current = null;
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container.id, profile?.id]);

  if (!profile) {
    return (
      <div className="flex h-full items-center justify-center text-copy-14 text-gray-700">
        Unknown Node CLI profile
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col bg-black">
      {(phase === "need-key" || phase === "error") && (
        <div className="flex shrink-0 flex-wrap items-end gap-2 border-b border-gray-alpha-400 bg-background-100 px-3 py-2">
          <div className="min-w-[16rem] flex-1">
            <label className="label" htmlFor="node-cli-key">
              {profile.apiKeyEnv}
            </label>
            <input
              id="node-cli-key"
              className="input"
              type="password"
              value={apiKeyDraft}
              onChange={(e) => setApiKeyDraft(e.target.value)}
              placeholder="API key"
              autoComplete="off"
            />
          </div>
          <button
            type="button"
            className="btn-primary"
            disabled={!apiKeyDraft.trim() || !termRef.current}
            onClick={() => {
              const key = apiKeyDraft.trim();
              const term = termRef.current;
              if (!key || !term) return;
              void persistKey(key);
              void startCli(key, profile, term).catch((err) => {
                const msg = err instanceof Error ? err.message : String(err);
                setError(msg);
                setPhase("error");
                term.writeln(`\r\n\x1b[31m${msg}\x1b[0m`);
                onStatus?.("error");
              });
            }}
          >
            Start {profile.label}
          </button>
          {error && <p className="w-full text-copy-13 text-red-400">{error}</p>}
        </div>
      )}
      <div ref={termHostRef} className="min-h-0 flex-1 p-2" />
    </div>
  );
}
