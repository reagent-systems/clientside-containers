"use client";

import type { Container, ContainerPreview, ContainerSettings } from "@/lib/container";
import type { AgentCliRuntime } from "@/lib/agent-cli";
import {
  GEMINI_CLI_API_STYLE,
  GEMINI_CLI_BANNER,
  GEMINI_CLI_DEFAULT_HOST,
  GEMINI_CLI_DEFAULT_MODEL,
  GEMINI_CLI_DEFAULT_PATH,
  GEMINI_CLI_HELP,
  GEMINI_CLI_MODELS,
  GEMINI_CLI_PRODUCT,
  GEMINI_CLI_TIP,
  GEMINI_CLI_TOOLS,
  GEMINI_CLI_VENDOR,
  GEMINI_CLI_VERSION,
} from "@/lib/gemini-cli";
import { AgentCliTerminal, type AgentCliProfile } from "./AgentCliTerminal";
import styles from "./GeminiCliTerminal.module.css";

function readSettings(container: Container): AgentCliRuntime {
  const s = container.settings;
  return {
    model: s.geminiModel || GEMINI_CLI_DEFAULT_MODEL,
    apiKey: s.geminiApiKey || "",
    apiHost: s.geminiApiHost || GEMINI_CLI_DEFAULT_HOST,
    apiPath: s.geminiApiPath || GEMINI_CLI_DEFAULT_PATH,
    quiet: Boolean(s.geminiQuiet),
  };
}

function writeSettings(rt: AgentCliRuntime, sessionId: string): Partial<ContainerSettings> {
  return {
    geminiModel: rt.model,
    geminiApiKey: rt.apiKey,
    geminiApiHost: rt.apiHost,
    geminiApiPath: rt.apiPath,
    geminiQuiet: rt.quiet,
    geminiSessionId: sessionId,
  };
}

const profile: AgentCliProfile = {
  id: "gemini-cli",
  productName: GEMINI_CLI_PRODUCT,
  vendor: GEMINI_CLI_VENDOR,
  version: GEMINI_CLI_VERSION,
  banner: GEMINI_CLI_BANNER,
  welcome: "Welcome to Gemini CLI! Type a message or /help for commands.",
  tip: GEMINI_CLI_TIP,
  help: GEMINI_CLI_HELP,
  systemPrompt:
    "You are Gemini CLI (Google), running inside a clientside-containers OpenShell-style sandbox in the browser. Be concise and helpful for coding tasks.",
  defaultModel: GEMINI_CLI_DEFAULT_MODEL,
  models: GEMINI_CLI_MODELS,
  defaultHost: GEMINI_CLI_DEFAULT_HOST,
  defaultPath: GEMINI_CLI_DEFAULT_PATH,
  apiStyle: GEMINI_CLI_API_STYLE,
  tools: GEMINI_CLI_TOOLS,
  toolsHeading: "Tools",
  readSettings,
  readSessionId: (c) => c.settings.geminiSessionId,
  writeSettings,
  handleExtraSlash(cmd, _arg, ctx) {
    if (cmd === "tools") {
      ctx.append("out", GEMINI_CLI_TOOLS.map((t) => `- ${t}`).join("\n"));
      return true;
    }
    if (cmd === "theme") {
      ctx.append("out", "theme: Default (Gemini blue)");
      return true;
    }
    if (cmd === "auth") {
      ctx.append(
        "out",
        ctx.runtime.apiKey
          ? "auth: API key is set for this container."
          : "auth: no API key. Use /key <token> (Gemini API key).",
      );
      return true;
    }
    return false;
  },
};

export function GeminiCliTerminal({
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
