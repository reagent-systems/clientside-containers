/** Profiles for real Node CLIs bootstrapped inside a WebContainer. */

import type { Container, ContainerSettings } from "./container";

export interface NodeCliProfile {
  id: "claude-code" | "gemini-cli";
  label: string;
  vendor: string;
  /** npm package that provides the CLI. */
  packageName: string;
  /** Binary name after install (`npx <bin>` / `node_modules/.bin/<bin>`). */
  bin: string;
  /** Env var the real CLI reads for its API key. */
  apiKeyEnv: string;
  /** Working directory inside the WebContainer. */
  workdir: string;
  readApiKey: (settings: ContainerSettings) => string;
  writeApiKey: (key: string) => Partial<ContainerSettings>;
}

export const NODE_CLI_PROFILES: Record<"claude-code" | "gemini-cli", NodeCliProfile> = {
  "claude-code": {
    id: "claude-code",
    label: "Claude Code",
    vendor: "Anthropic",
    packageName: "@anthropic-ai/claude-code",
    bin: "claude",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    workdir: "claude-code",
    readApiKey: (s) => s.claudeApiKey || "",
    writeApiKey: (key) => ({ claudeApiKey: key }),
  },
  "gemini-cli": {
    id: "gemini-cli",
    label: "Gemini CLI",
    vendor: "Google",
    packageName: "@google/gemini-cli",
    bin: "gemini",
    apiKeyEnv: "GEMINI_API_KEY",
    workdir: "gemini-cli",
    readApiKey: (s) => s.geminiApiKey || "",
    writeApiKey: (key) => ({ geminiApiKey: key }),
  },
};

export function getNodeCliProfile(agentId: string | undefined): NodeCliProfile | null {
  if (agentId === "claude-code" || agentId === "gemini-cli") {
    return NODE_CLI_PROFILES[agentId];
  }
  return null;
}

export function isNodeCliAgent(container: Container): boolean {
  return container.tier === "agent" && getNodeCliProfile(container.agentId) !== null;
}
