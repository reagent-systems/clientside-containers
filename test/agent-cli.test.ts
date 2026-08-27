import { describe, expect, it } from "vitest";

import { formatModelList, newAgentCliSessionId } from "@/lib/agent-cli";
import {
  CLAUDE_CODE_DEFAULT_HOST,
  CLAUDE_CODE_DEFAULT_MODEL,
  CLAUDE_CODE_MODELS,
  CLAUDE_CODE_VERSION,
} from "@/lib/claude-code";
import {
  GEMINI_CLI_DEFAULT_HOST,
  GEMINI_CLI_DEFAULT_MODEL,
  GEMINI_CLI_MODELS,
  GEMINI_CLI_VERSION,
} from "@/lib/gemini-cli";
import { buildContainer } from "@/lib/container";

describe("agent CLI catalogs", () => {
  it("builds session ids for CLI agents", () => {
    const id = newAgentCliSessionId(new Date("2026-08-27T14:00:00.123Z"));
    expect(id).toMatch(/^\d{8}_\d{6}_\d{6}$/);
  });

  it("lists models with an active marker", () => {
    expect(formatModelList(["a", "b"], "b")).toContain("* b");
  });

  it("exposes Claude Code defaults", () => {
    expect(CLAUDE_CODE_VERSION).toBeTruthy();
    expect(CLAUDE_CODE_MODELS).toContain(CLAUDE_CODE_DEFAULT_MODEL);
    expect(CLAUDE_CODE_DEFAULT_HOST).toBe("api.anthropic.com");
  });

  it("exposes Gemini CLI defaults", () => {
    expect(GEMINI_CLI_VERSION).toBeTruthy();
    expect(GEMINI_CLI_MODELS).toContain(GEMINI_CLI_DEFAULT_MODEL);
    expect(GEMINI_CLI_DEFAULT_HOST).toBe("generativelanguage.googleapis.com");
  });

  it("seeds Claude Code and Gemini CLI containers", () => {
    const claude = buildContainer("agent", "claude-code");
    expect(claude.settings.claudeModel).toBe(CLAUDE_CODE_DEFAULT_MODEL);
    expect(claude.settings.claudeApiHost).toBe(CLAUDE_CODE_DEFAULT_HOST);

    const gemini = buildContainer("agent", "gemini-cli");
    expect(gemini.settings.geminiModel).toBe(GEMINI_CLI_DEFAULT_MODEL);
    expect(gemini.settings.geminiApiHost).toBe(GEMINI_CLI_DEFAULT_HOST);
  });
});
