"use client";

import { useEffect } from "react";
import { TIERS, type Container, type ContainerPreview } from "@/lib/container";
import { isNodeCliAgent } from "@/lib/node-cli";
import { EmulatorScreen } from "./runtime/EmulatorScreen";
import { AgentConsole } from "./runtime/AgentConsole";
import { HermesTerminal } from "./runtime/HermesTerminal";
import { NodeCliScreen } from "./runtime/NodeCliScreen";

interface Props {
  container: Container;
  onClose: () => void;
  onStatus: (status: Container["status"]) => void;
  onPreview: (preview: ContainerPreview) => void;
  onContainerChange?: (container: Container) => void;
}

export function ContainerStage({ container, onClose, onStatus, onPreview, onContainerChange }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isHermes = container.tier === "agent" && container.agentId === "hermes";
  const isNodeCli = isNodeCliAgent(container);
  const stageTitle = isHermes
    ? "ollama launch hermes"
    : container.agentId === "claude-code"
      ? "claude"
      : container.agentId === "gemini-cli"
        ? "gemini"
        : container.name;
  const stageBadge = isHermes
    ? "Hermes Agent"
    : container.agentId === "claude-code"
      ? "Claude Code"
      : container.agentId === "gemini-cli"
        ? "Gemini CLI"
        : TIERS[container.tier].label;
  const hideFooter = isHermes || isNodeCli;

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
          <span className="text-heading-14 text-gray-1000">{stageTitle}</span>
          <span className="badge">{stageBadge}</span>
        </div>
        <button type="button" onClick={onClose} className="btn-tertiary btn-small">
          Close
        </button>
      </header>
      <div className="flex-1 overflow-hidden bg-black">
        {container.tier === "agent" ? (
          isHermes ? (
            <HermesTerminal
              container={container}
              onStatus={onStatus}
              onPreview={onPreview}
              onContainerChange={onContainerChange}
            />
          ) : isNodeCli ? (
            <NodeCliScreen
              container={container}
              onStatus={onStatus}
              onPreview={onPreview}
              onContainerChange={onContainerChange}
            />
          ) : (
            <AgentConsole container={container} onStatus={onStatus} onPreview={onPreview} />
          )
        ) : (
          <EmulatorScreen container={container} onStatus={onStatus} onPreview={onPreview} />
        )}
      </div>
      {!hideFooter && (
        <footer className="border-t border-gray-alpha-400 bg-background-100 px-4 py-1.5 text-center text-copy-13 text-gray-700">
          {container.tier === "agent"
            ? "OpenShell-style agent runtime — API calls and policy egress decisions."
            : container.tier === "app"
              ? "Linux container running its config. Type into the terminal once the prompt appears."
              : "x86 OS via WebAssembly. Click the screen, then type."}
        </footer>
      )}
    </div>
  );
}
