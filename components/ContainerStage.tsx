"use client";

import { useEffect } from "react";
import { TIERS, type Container, type ContainerPreview } from "@/lib/container";
import { EmulatorScreen } from "./runtime/EmulatorScreen";
import { AgentConsole } from "./runtime/AgentConsole";

interface Props {
  container: Container;
  onClose: () => void;
  onStatus: (status: Container["status"]) => void;
  onPreview: (preview: ContainerPreview) => void;
}

export function ContainerStage({ container, onClose, onStatus, onPreview }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-alpha-800">
      <header className="flex items-center justify-between border-b border-gray-alpha-400 bg-background-100 px-4 py-2">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={onClose}
              className="h-3 w-3 rounded-full bg-red-600 hover:bg-red-700"
              aria-label="Close"
            />
            <span className="h-3 w-3 rounded-full bg-gray-400" />
            <span className="h-3 w-3 rounded-full bg-gray-400" />
          </div>
          <span className="text-heading-14 text-gray-1000">{container.name}</span>
          <span className="badge">{TIERS[container.tier].label}</span>
        </div>
        <button type="button" onClick={onClose} className="btn-tertiary btn-small">
          Close
        </button>
      </header>
      <div className="flex-1 overflow-hidden bg-black">
        {container.tier === "agent" ? (
          <AgentConsole container={container} onStatus={onStatus} onPreview={onPreview} />
        ) : (
          <EmulatorScreen container={container} onStatus={onStatus} onPreview={onPreview} />
        )}
      </div>
      <footer className="border-t border-gray-alpha-400 bg-background-100 px-4 py-1.5 text-center text-copy-13 text-gray-700">
        {container.tier === "agent"
          ? "OpenShell-style agent runtime — real policy-gated fetch, honest CORS."
          : container.tier === "app"
            ? "Linux container running its config. Type into the terminal once the prompt appears."
            : "x86 OS via WebAssembly. Click the screen, then type."}
      </footer>
    </div>
  );
}
