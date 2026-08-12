"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAgentPreset } from "@/lib/agents";
import type { Container, ContainerPreview } from "@/lib/container";
import type { WebContainer as WebContainerType, WebContainerProcess } from "@webcontainer/api";
import { EmulatorScreen } from "./EmulatorScreen";
import { BASE_PATH } from "@/lib/base-path";

// A single WebContainer per page (the API allows only one instance). Booting is
// expensive, so we keep the boot promise at module scope and reuse it.
let bootPromise: Promise<WebContainerType> | null = null;

async function bootWebContainer(): Promise<WebContainerType> {
  if (!bootPromise) {
    bootPromise = import("@webcontainer/api").then(({ WebContainer }) =>
      WebContainer.boot({ coep: "credentialless" }),
    );
  }
  return bootPromise;
}

// WebContainer's user cannot write to /usr/local, so `npm install -g` fails with
// EACCES. Point the global prefix at a writable dir and expose its bin on PATH —
// the same fix OpenClaw's own install docs recommend for EACCES. We derive the
// bin dir from `npm prefix -g` at run time so it is correct regardless of $HOME.
const NPM_PREFIX_SETUP =
  'mkdir -p "$HOME/.npm-global" && npm config set prefix "$HOME/.npm-global"';
const PATH_EXPORT = 'export PATH="$(npm config get prefix)/bin:$PATH"; hash -r 2>/dev/null;';

type Phase = "idle" | "booting" | "ready" | "running" | "error";

// The Node backend: a real in-browser Node.js + npm OS (WebContainer).
export function WebContainerBackend({ container }: { container: Container }) {
  const preset = getAgentPreset(container.agentId);
  const wcRef = useRef<WebContainerType | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [lines, setLines] = useState<string[]>([]);
  const [command, setCommand] = useState("");
  const bufferRef = useRef("");

  const append = useCallback((chunk: string) => {
    // Strip the most common ANSI escape sequences for a readable log.
    // eslint-disable-next-line no-control-regex
    const clean = chunk.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "");
    bufferRef.current += clean;
    const parts = bufferRef.current.split("\n");
    bufferRef.current = parts.pop() ?? "";
    if (parts.length) setLines((l) => [...l, ...parts]);
  }, []);

  const flush = useCallback(() => {
    if (bufferRef.current) {
      const rest = bufferRef.current;
      bufferRef.current = "";
      setLines((l) => [...l, rest]);
    }
  }, []);

  const sys = useCallback((text: string) => setLines((l) => [...l, `\u2022 ${text}`]), []);

  const runRaw = useCallback(
    async (cmd: string, wc?: WebContainerType) => {
      const instance = wc ?? wcRef.current;
      if (!instance) return -1;
      setPhase("running");
      setLines((l) => [...l, `$ ${cmd}`]);
      try {
        const proc: WebContainerProcess = await instance.spawn("jsh", ["-c", cmd]);
        void proc.output.pipeTo(new WritableStream({ write: (data) => append(data) }));
        const code = await proc.exit;
        flush();
        setLines((l) => [...l, `\u2022 exited with code ${code}`]);
        setPhase("ready");
        return code;
      } catch (err) {
        flush();
        setLines((l) => [...l, `\u2022 command error: ${String((err as Error)?.message ?? err)}`]);
        setPhase("ready");
        return -1;
      }
    },
    [append, flush],
  );

  // Commands the user/agent runs go through a shell that exposes the writable
  // npm global bin, so installed CLIs are on PATH.
  const runShell = useCallback((cmd: string) => runRaw(`${PATH_EXPORT} ${cmd}`), [runRaw]);

  useEffect(() => {
    let cancelled = false;

    if (!globalThis.crossOriginIsolated) {
      setPhase("error");
      setLines([
        "\u2022 this page is not cross-origin isolated, so the OpenShell runtime cannot start.",
        "\u2022 crossOriginIsolated === false (SharedArrayBuffer unavailable).",
      ]);
      return;
    }

    setPhase("booting");
    sys("booting OpenShell runtime (WebContainer)\u2026");
    const startedAt = Date.now();
    const heartbeat = setInterval(() => {
      if (cancelled) return;
      sys(`still booting\u2026 ${Math.round((Date.now() - startedAt) / 1000)}s (downloading the runtime)`);
    }, 10000);
    const timeout = setTimeout(() => {
      if (cancelled || wcRef.current) return;
      clearInterval(heartbeat);
      setPhase("error");
      sys("boot timed out after 150s \u2014 the runtime download may be blocked. Reload to retry.");
    }, 150000);
    bootWebContainer()
      .then(async (wc) => {
        clearInterval(heartbeat);
        clearTimeout(timeout);
        if (cancelled) return;
        wcRef.current = wc;
        setPhase("ready");
        sys("runtime ready \u2014 Node.js in the browser");
        await runRaw("node -v && npm -v", wc);
        await runRaw(NPM_PREFIX_SETUP, wc);
        sys("environment ready \u2014 install the agent, or run any command below");
      })
      .catch((err) => {
        clearInterval(heartbeat);
        clearTimeout(timeout);
        if (cancelled) return;
        setPhase("error");
        sys(`boot failed: ${String((err as Error)?.message ?? err)}`);
      });
    return () => {
      cancelled = true;
      clearInterval(heartbeat);
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const installAgent = useCallback(async () => {
    if (preset.setup.runtime === "native") {
      sys(
        `${preset.label} ships a native installer that needs ${preset.setup.requires ?? "a full OS"}; ` +
          "the browser Node runtime has no Docker/pip, so the install below is expected to fail honestly.",
      );
      await runRaw(preset.setup.install);
      return;
    }
    await runShell(`npm install -g ${preset.setup.pkg}`);
    // Show what actually got linked into the global bin.
    await runRaw('ls -la "$(npm config get prefix)/bin" 2>&1');
  }, [preset, runShell, runRaw, sys]);

  const startAgent = useCallback(() => {
    if (preset.setup.runtime === "native") {
      void runRaw(preset.setup.run);
      return;
    }
    // Prefer the installed global bin; WebContainer's npm doesn't always link a
    // global bin, so fall back to `npx` (which resolves the real package) so the
    // CLI actually runs either way. Uses `||` (not `if/fi`) for jsh compatibility.
    const { bin, args = "", pkg } = preset.setup;
    void runRaw(`${PATH_EXPORT} ${bin} ${args} || npx -y ${pkg} ${args}`);
  }, [preset, runRaw]);

  const busy = phase === "booting" || phase === "running";

  return (
    <div className="flex h-full w-full flex-col bg-black">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-alpha-400 bg-background-100 px-3 py-2">
        <span className="badge">{preset.label}</span>
        <code className="text-copy-13 text-gray-700">{preset.setup.install}</code>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={installAgent}
            disabled={busy || phase === "error"}
            className="btn-primary btn-small"
          >
            {phase === "running" ? "Working\u2026" : "Install agent"}
          </button>
          <button
            type="button"
            onClick={startAgent}
            disabled={busy || phase === "error"}
            className="btn-secondary btn-small"
          >
            Run agent
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 font-mono text-copy-13 leading-relaxed">
        {lines.length === 0 ? (
          <p className="text-gray-700">Starting the runtime\u2026</p>
        ) : (
          lines.map((line, i) => (
            <div
              key={i}
              className={
                line.startsWith("$ ")
                  ? "text-blue-600"
                  : line.startsWith("\u2022 ")
                    ? "text-gray-700"
                    : "text-gray-1000"
              }
            >
              <span className="break-all whitespace-pre-wrap">{line}</span>
            </div>
          ))
        )}
      </div>

      <form
        className="flex gap-2 border-t border-gray-alpha-400 bg-background-100 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!command.trim() || busy) return;
          void runShell(command.trim());
          setCommand("");
        }}
      >
        <input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          className="input flex-1 font-mono text-copy-13"
          placeholder="Run a command in the runtime, e.g. npm install -g openclaw@latest"
          aria-label="Runtime command"
          disabled={phase === "error"}
        />
        <button type="submit" disabled={busy || phase === "error" || !command.trim()} className="btn-primary">
          Run
        </button>
      </form>
    </div>
  );
}

// The Linux backend: a real x86 Linux (v86/WASM), bundled and same-origin. No
// Node required — a genuine OS with a BusyBox shell. Buildroot needs more RAM
// than the agent tier's tiny default, so bump it here.
function LinuxBackend({
  container,
  onStatus,
  onPreview,
}: {
  container: Container;
  onStatus?: (s: Container["status"]) => void;
  onPreview?: (p: ContainerPreview) => void;
}) {
  const linuxContainer: Container = {
    ...container,
    settings: { ...container.settings, memoryMb: Math.max(container.settings.memoryMb, 256) },
  };
  return (
    <div className="flex h-full w-full flex-col bg-black">
      <div className="border-b border-gray-alpha-400 bg-background-100 px-3 py-2 text-copy-13 text-gray-700">
        Real x86 Linux (v86/WASM) — BusyBox shell. Click the terminal, then type.
      </div>
      <div className="min-h-0 flex-1">
        <EmulatorScreen container={linuxContainer} onStatus={onStatus} onPreview={onPreview} />
      </div>
    </div>
  );
}

// The Node backend needs cross-origin isolation (SharedArrayBuffer), which the
// dashboard page can't have without breaking the v86 tiers. When this page is
// not isolated, run the Node backend on the dedicated isolated /openshell page.
function NodeBackend({ container }: { container: Container }) {
  const [isolated, setIsolated] = useState<boolean | null>(null);
  useEffect(() => setIsolated(!!globalThis.crossOriginIsolated), []);

  if (isolated === null) return null;
  if (isolated) return <WebContainerBackend container={container} />;

  const url = `${BASE_PATH}/openshell/?agent=${encodeURIComponent(container.agentId ?? "")}`;
  return (
    <div className="flex h-full w-full flex-col items-start gap-3 bg-black p-6 text-copy-14 text-gray-800">
      <p className="text-gray-1000">
        The Node runtime is a real in-browser Node.js + npm OS (WebContainer). It needs a
        cross-origin-isolated page, which can&apos;t coexist with the Linux (v86) runtime here, so it opens
        in its own tab.
      </p>
      <button type="button" onClick={() => window.open(url, "_blank", "noopener")} className="btn-primary">
        Open Node runtime
      </button>
      <p className="text-copy-13 text-gray-700">
        There you can run its real one-line install, e.g. <code>npm install -g openclaw@latest</code>.
      </p>
    </div>
  );
}

type Backend = "webcontainer" | "linux";

// The OpenShell runtime is pluggable: it runs an agent on whatever in-browser
// runtime fits. Node/npm agents use WebContainer; anything else can use a real
// x86 Linux (v86). Neither needs a server, and both are same-origin (v86) or
// browser-sandboxed (WebContainer).
export function OpenShellRuntime({
  container,
  onStatus,
  onPreview,
}: {
  container: Container;
  onStatus?: (s: Container["status"]) => void;
  onPreview?: (p: ContainerPreview) => void;
}) {
  const preset = getAgentPreset(container.agentId);
  const [backend, setBackend] = useState<Backend>(
    preset.setup.runtime === "native" ? "linux" : "webcontainer",
  );

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-alpha-400 bg-background-100 px-3 py-1.5">
        <span className="text-label-12 text-gray-700">Backend</span>
        <button
          type="button"
          onClick={() => setBackend("webcontainer")}
          className={backend === "webcontainer" ? "btn-primary btn-small" : "btn-tertiary btn-small"}
        >
          Node · WebContainer
        </button>
        <button
          type="button"
          onClick={() => setBackend("linux")}
          className={backend === "linux" ? "btn-primary btn-small" : "btn-tertiary btn-small"}
        >
          Linux · v86
        </button>
      </div>
      <div className="min-h-0 flex-1">
        {backend === "webcontainer" ? (
          <NodeBackend container={container} />
        ) : (
          <LinuxBackend container={container} onStatus={onStatus} onPreview={onPreview} />
        )}
      </div>
    </div>
  );
}
