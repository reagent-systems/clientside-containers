import { describe, expect, it } from "vitest";

import { getNodeCliProfile, isNodeCliAgent, NODE_CLI_PROFILES } from "@/lib/node-cli";
import { buildContainer } from "@/lib/container";

describe("node CLI profiles", () => {
  it("maps Claude Code and Gemini CLI to real npm packages", () => {
    expect(NODE_CLI_PROFILES["claude-code"].packageName).toBe("@anthropic-ai/claude-code");
    expect(NODE_CLI_PROFILES["claude-code"].packageVersion).toBe("2.1.112");
    expect(NODE_CLI_PROFILES["claude-code"].entry).toContain("cli.js");
    expect(NODE_CLI_PROFILES["claude-code"].apiKeyEnv).toBe("ANTHROPIC_API_KEY");

    expect(NODE_CLI_PROFILES["gemini-cli"].packageName).toBe("@google/gemini-cli");
    expect(NODE_CLI_PROFILES["gemini-cli"].entry).toContain("gemini.js");
    expect(NODE_CLI_PROFILES["gemini-cli"].apiKeyEnv).toBe("GEMINI_API_KEY");
  });

  it("detects Node CLI agent containers", () => {
    expect(getNodeCliProfile("hermes")).toBeNull();
    expect(getNodeCliProfile("claude-code")?.id).toBe("claude-code");
    expect(isNodeCliAgent(buildContainer("agent", "claude-code"))).toBe(true);
    expect(isNodeCliAgent(buildContainer("agent", "gemini-cli"))).toBe(true);
    expect(isNodeCliAgent(buildContainer("agent", "hermes"))).toBe(false);
  });
});
