"use client";

import type { Container, ContainerPreview, ContainerSettings } from "@/lib/container";
import type { AgentCliRuntime } from "@/lib/agent-cli";
import {
  CLAUDE_CODE_API_STYLE,
  CLAUDE_CODE_BANNER,
  CLAUDE_CODE_DEFAULT_HOST,
  CLAUDE_CODE_DEFAULT_MODEL,
  CLAUDE_CODE_DEFAULT_PATH,
  CLAUDE_CODE_HELP,
  CLAUDE_CODE_MODELS,
  CLAUDE_CODE_PRODUCT,
  CLAUDE_CODE_TIP,
  CLAUDE_CODE_TOOLS,
  CLAUDE_CODE_VENDOR,
  CLAUDE_CODE_VERSION,
} from "@/lib/claude-code";
import { AgentCliTerminal, type AgentCliProfile } from "./AgentCliTerminal";
import styles from "./ClaudeCodeTerminal.module.css";

function readSettings(container: Container): AgentCliRuntime {
  const s = container.settings;
  return {
    model: s.claudeModel || CLAUDE_CODE_DEFAULT_MODEL,
    apiKey: s.claudeApiKey || "",
    apiHost: s.claudeApiHost || CLAUDE_CODE_DEFAULT_HOST,
    apiPath: s.claudeApiPath || CLAUDE_CODE_DEFAULT_PATH,
    quiet: Boolean(s.claudeQuiet),
  };
}

function writeSettings(rt: AgentCliRuntime, sessionId: string): Partial<ContainerSettings> {
  return {
    claudeModel: rt.model,
    claudeApiKey: rt.apiKey,
    claudeApiHost: rt.apiHost,
    claudeApiPath: rt.apiPath,
    claudeQuiet: rt.quiet,
    claudeSessionId: sessionId,
  };
}

const profile: AgentCliProfile = {
  id: "claude-code",
  productName: CLAUDE_CODE_PRODUCT,
  vendor: CLAUDE_CODE_VENDOR,
  version: CLAUDE_CODE_VERSION,
  banner: CLAUDE_CODE_BANNER,
  welcome: "Welcome to Claude Code! Type a message or /help for commands.",
  tip: CLAUDE_CODE_TIP,
  help: CLAUDE_CODE_HELP,
  systemPrompt:
    "You are Claude Code (Anthropic), running inside a clientside-containers OpenShell-style sandbox in the browser. Be concise and helpful for coding tasks.",
  defaultModel: CLAUDE_CODE_DEFAULT_MODEL,
  models: CLAUDE_CODE_MODELS,
  defaultHost: CLAUDE_CODE_DEFAULT_HOST,
  defaultPath: CLAUDE_CODE_DEFAULT_PATH,
  apiStyle: CLAUDE_CODE_API_STYLE,
  tools: CLAUDE_CODE_TOOLS,
  toolsHeading: "Tools",
  readSettings,
  readSessionId: (c) => c.settings.claudeSessionId,
  writeSettings,
  handleExtraSlash(cmd, _arg, ctx) {
    if (cmd === "compact") {
      ctx.append("sys", "compact: context compression is a no-op in this browser sandbox.");
      return true;
    }
    if (cmd === "cost" || cmd === "usage") {
      ctx.append("out", "usage: session tokens — (not metered in this sandbox)");
      return true;
    }
    return false;
  },
};

export function ClaudeCodeTerminal({
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
  return (
    <AgentCliTerminal
      container={container}
      profile={profile}
      styles={styles}
      onStatus={onStatus}
      onPreview={onPreview}
      onContainerChange={onContainerChange}
    />
  );
}
