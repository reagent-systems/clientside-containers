import { describe, expect, it } from "vitest";

import {
  countHermesTools,
  formatProviderList,
  formatReleaseList,
  formatSkillLine,
  formatToolLine,
  getHermesProvider,
  getHermesRelease,
  hermesProviderApiHosts,
  HERMES_DEFAULT_MODEL,
  HERMES_PROVIDERS,
  HERMES_RELEASES,
  HERMES_SKILLSETS,
  HERMES_TOOLSETS,
  latestHermesRelease,
  newHermesSessionId,
  parseHermesModelArg,
} from "@/lib/hermes";
import { agentPolicyRules, getAgentPreset } from "@/lib/agents";
import { buildContainer } from "@/lib/container";

describe("hermes catalog", () => {
  it("lists toolsets and skills for the splash panel", () => {
    expect(HERMES_TOOLSETS.length).toBeGreaterThan(0);
    expect(HERMES_SKILLSETS.length).toBeGreaterThan(0);
    expect(countHermesTools()).toBeGreaterThan(0);
    expect(formatToolLine(HERMES_TOOLSETS[0])).toContain(HERMES_TOOLSETS[0].name);
    expect(formatSkillLine(HERMES_SKILLSETS[0])).toContain(HERMES_SKILLSETS[0].name);
  });

  it("builds a session id shaped like the Hermes CLI", () => {
    const id = newHermesSessionId(new Date("2026-04-17T12:46:23.417Z"));
    expect(id).toMatch(/^\d{8}_\d{6}_\d{6}$/);
  });

  it("defaults the prompt model", () => {
    expect(HERMES_DEFAULT_MODEL).toContain("kimi");
  });

  it("tracks the latest Hermes Agent release as v0.20.6", () => {
    const latest = latestHermesRelease();
    expect(latest.version).toBe("0.20.6");
    expect(latest.latest).toBe(true);
    expect(HERMES_RELEASES.some((r) => r.id === "0.10.0")).toBe(true);
    expect(getHermesRelease("0.10.0").version).toBe("0.10.0");
    expect(formatReleaseList(latest.id)).toContain("* 0.20.6");
  });

  it("lists providers and parses provider:model args", () => {
    expect(HERMES_PROVIDERS.length).toBeGreaterThan(3);
    expect(getHermesProvider("openrouter").host).toBe("openrouter.ai");
    expect(formatProviderList("openai")).toContain("* openai");
    expect(parseHermesModelArg("openrouter:anthropic/claude-sonnet-4")).toEqual({
      providerId: "openrouter",
      model: "anthropic/claude-sonnet-4",
    });
    expect(parseHermesModelArg("gpt-4o-mini")).toEqual({ model: "gpt-4o-mini" });
  });

  it("seeds Hermes containers with release + provider defaults", () => {
    const c = buildContainer("agent", "hermes");
    expect(c.settings.hermesReleaseId).toBe("0.20.6");
    expect(c.settings.hermesProvider).toBe("openai");
    expect(c.settings.hermesApiHost).toBe("api.openai.com");

    const legacy = buildContainer("agent", "hermes", undefined, { hermesReleaseId: "0.10.0" });
    expect(legacy.settings.hermesReleaseId).toBe("0.10.0");
  });

  it("allows Hermes provider hosts in the generated policy", () => {
    const hermes = getAgentPreset("hermes");
    expect(hermes.apiHosts).toEqual(expect.arrayContaining(hermesProviderApiHosts()));
    const hosts = agentPolicyRules("hermes").map((r) => r.host);
    expect(hosts).toContain("openrouter.ai");
    expect(hosts).toContain("api.x.ai");
  });
});
