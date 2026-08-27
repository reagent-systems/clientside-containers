/** Profiles for real Node CLIs bootstrapped inside a WebContainer. */

import type { Container, ContainerSettings } from "./container";

export interface NodeCliProfile {
  id: "claude-code" | "gemini-cli";
  label: string;
  vendor: string;
  /** npm package that provides the CLI. */
  packageName: string;
  /**
   * Exact version to install. Claude Code ≥2.1.113 ships a native binary that
   * WebContainer cannot execute; pin the last JS entrypoint.
   */
  packageVersion: string;
  /** Binary name on PATH after install. */
  bin: string;
  /** JS entry to spawn with `node` (more reliable than npx in WebContainer). */
  entry: string;
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
    // Last release with a Node `cli.js` entry before the native-binary switch.
    packageVersion: "2.1.112",
    bin: "claude",
    entry: "node_modules/@anthropic-ai/claude-code/cli.js",
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
    packageVersion: "0.57.0",
    bin: "gemini",
    entry: "node_modules/@google/gemini-cli/bundle/gemini.js",
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
