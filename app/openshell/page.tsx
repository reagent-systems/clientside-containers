"use client";

import { useEffect, useState } from "react";
import { buildContainer, type Container } from "@/lib/container";
import { getAgentPreset } from "@/lib/agents";
import { WebContainerBackend } from "@/components/runtime/OpenShellRuntime";

// A dedicated, cross-origin-isolated page for the Node (WebContainer) backend.
// Isolation is required for SharedArrayBuffer and can't share a page with the
// v86 runtime, so this opens in its own tab from the agent console.
export default function OpenShellPage() {
  const [container, setContainer] = useState<Container | null>(null);

  useEffect(() => {
    const agentId = new URLSearchParams(window.location.search).get("agent") ?? undefined;
    setContainer(buildContainer("agent", agentId));
  }, []);

  if (!container) return null;
  const preset = getAgentPreset(container.agentId);

  return (
    <div className="flex h-screen w-screen flex-col bg-black">
      <header className="flex items-center gap-3 border-b border-gray-alpha-400 bg-background-100 px-4 py-2">
        <span className="text-heading-14 text-gray-1000">OpenShell runtime</span>
        <span className="badge">{preset.label}</span>
        <span className="text-copy-13 text-gray-700">Node · WebContainer (isolated)</span>
      </header>
      <div className="min-h-0 flex-1">
        <WebContainerBackend container={container} />
      </div>
    </div>
  );
}
