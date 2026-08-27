"use client";

import { useEffect } from "react";
import { TIERS, type Container, type ContainerPreview } from "@/lib/container";
import { EmulatorScreen } from "./runtime/EmulatorScreen";
import { AgentConsole } from "./runtime/AgentConsole";
import { HermesTerminal } from "./runtime/HermesTerminal";
import { ClaudeCodeTerminal } from "./runtime/ClaudeCodeTerminal";
import { GeminiCliTerminal } from "./runtime/GeminiCliTerminal";

interface Props {
  container: Container;
  onClose: () => void;
  onStatus: (status: Container["status"]) => void;
  onPreview: (preview: ContainerPreview) => void;
  onContainerChange?: (container: Container) => void;
}

type CliAgentKind = "hermes" | "claude-code" | "gemini-cli";

function cliAgentKind(container: Container): CliAgentKind | null {
  if (container.tier !== "agent") return null;
  if (container.agentId === "hermes") return "hermes";
  if (container.agentId === "claude-code") return "claude-code";
  if (container.agentId === "gemini-cli") return "gemini-cli";
  return null;
}

const CLI_STAGE: Record<CliAgentKind, { title: string; badge: string }> = {
  hermes: { title: "ollama launch hermes", badge: "Hermes Agent" },
  "claude-code": { title: "claude", badge: "Claude Code" },
  "gemini-cli": { title: "gemini", badge: "Gemini CLI" },
};

export function ContainerStage({ container, onClose, onStatus, onPreview, onContainerChange }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const cli = cliAgentKind(container);
  const stage = cli ? CLI_STAGE[cli] : null;

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
          <span className="text-heading-14 text-gray-1000">
            {stage ? stage.title : container.name}
          </span>
          <span className="badge">{stage ? stage.badge : TIERS[container.tier].label}</span>
        </div>
        <button type="button" onClick={onClose} className="btn-tertiary btn-small">
          Close
        </button>
      </header>
      <div className="flex-1 overflow-hidden bg-black">
        {container.tier === "agent" ? (
          cli === "hermes" ? (
            <HermesTerminal
              container={container}
              onStatus={onStatus}
              onPreview={onPreview}
              onContainerChange={onContainerChange}
            />
          ) : cli === "claude-code" ? (
            <ClaudeCodeTerminal
              container={container}
              onStatus={onStatus}
              onPreview={onPreview}
              onContainerChange={onContainerChange}
            />
          ) : cli === "gemini-cli" ? (
            <GeminiCliTerminal
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
      {!cli && (
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
