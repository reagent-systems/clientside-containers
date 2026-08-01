import { describe, expect, it } from "vitest";

import {
  DEFAULT_SETTINGS,
  TIERS,
  buildContainer,
  containerSubtitle,
  newId,
  tierUsesEmulator,
  type ContainerTier,
} from "@/lib/container";
import { getOsImage } from "@/lib/os-images";
import { evaluateEgress, parsePolicy } from "@/lib/policy";

const TIER_IDS = Object.keys(TIERS) as ContainerTier[];

describe("newId", () => {
  it("uses the given prefix", () => {
    expect(newId("agent")).toMatch(/^agent-[a-z0-9]{1,6}$/);
  });

  it("defaults to the ctr prefix", () => {
    expect(newId()).toMatch(/^ctr-/);
  });

  it("does not repeat itself across many calls", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newId()));
    expect(ids.size).toBeGreaterThan(190);
  });
});

describe("tierUsesEmulator", () => {
  it("is true for the tiers that boot a guest", () => {
    expect(tierUsesEmulator("app")).toBe(true);
    expect(tierUsesEmulator("minios")).toBe(true);
  });

  it("is false for the agent tier", () => {
    expect(tierUsesEmulator("agent")).toBe(false);
  });
});

describe("TIERS", () => {
  it("describes every tier and gives it a default memory size", () => {
    for (const tier of TIER_IDS) {
      expect(TIERS[tier].label.length).toBeGreaterThan(0);
      expect(TIERS[tier].blurb.length).toBeGreaterThan(0);
      expect(TIERS[tier].defaultMemoryMb).toBeGreaterThanOrEqual(32);
      expect(TIERS[tier].icon.length).toBeGreaterThan(0);
    }
  });

  it("has default settings for every tier", () => {
    for (const tier of TIER_IDS) {
      expect(DEFAULT_SETTINGS[tier]).toBeDefined();
      expect(DEFAULT_SETTINGS[tier].memoryMb).toBe(TIERS[tier].defaultMemoryMb);
      expect(DEFAULT_SETTINGS[tier].autostart).toBe(false);
    }
  });
});

describe("buildContainer", () => {
  it.each(TIER_IDS)("builds a stopped %s container with an id and a timestamp", (tier) => {
    const container = buildContainer(tier);
    expect(container.tier).toBe(tier);
    expect(container.status).toBe("stopped");
    expect(container.id).toMatch(/^ctr-/);
    expect(Number.isNaN(Date.parse(container.createdAt))).toBe(false);
    expect(container.name.length).toBeGreaterThan(0);
  });

  it("uses the given name and removes the surrounding spaces", () => {
    expect(buildContainer("agent", undefined, "  my box  ").name).toBe("my box");
  });

  it("makes a name when the given name holds only spaces", () => {
    expect(buildContainer("agent", undefined, "   ").name.length).toBeGreaterThan(0);
  });

  it("does not share a settings object between two containers", () => {
    const first = buildContainer("minios");
    const second = buildContainer("minios");
    first.settings.memoryMb = 1024;
    expect(second.settings.memoryMb).not.toBe(1024);
    expect(DEFAULT_SETTINGS.minios.memoryMb).not.toBe(1024);
  });

  describe("agent tier", () => {
    it("records the agent and writes a policy that matches it", () => {
      const container = buildContainer("agent", "grok");
      expect(container.agentId).toBe("grok");
      expect(container.configId).toBeUndefined();
      expect(container.imageId).toBeUndefined();

      const policy = parsePolicy(container.settings.policyYaml!);
      expect(evaluateEgress(policy, { host: "api.x.ai", method: "POST" }).verdict).toBe("allow");
      expect(evaluateEgress(policy, { host: "evil.com", method: "GET" }).verdict).toBe("deny");
    });

    it("falls back to the first agent for an unknown selection", () => {
      expect(buildContainer("agent", "does-not-exist").agentId).toBe("openclaw");
    });
  });

  describe("app tier", () => {
    it("records the config and leaves the agent and image unset", () => {
      const container = buildContainer("app", "openttd");
      expect(container.configId).toBe("openttd");
      expect(container.agentId).toBeUndefined();
      expect(container.imageId).toBeUndefined();
    });

    it("falls back to the first config for an unknown selection", () => {
      expect(buildContainer("app", "does-not-exist").configId).toBe("shell");
    });
  });

  describe("minios tier", () => {
    it("records the image and takes the memory size from it", () => {
      const container = buildContainer("minios", "ubuntu1004");
      expect(container.imageId).toBe("ubuntu1004");
      expect(container.settings.memoryMb).toBe(getOsImage("ubuntu1004").memoryMb);
    });

    it("names a windows guest win and a desktop guest ubuntu", () => {
      expect(buildContainer("minios", "windows101").name.startsWith("win-")).toBe(true);
      expect(buildContainer("minios", "ubuntu1004").name.startsWith("ubuntu-")).toBe(true);
      expect(buildContainer("minios", "buildroot").name.startsWith("linux-")).toBe(true);
    });

    it("falls back to the first image for an unknown selection", () => {
      expect(buildContainer("minios", "does-not-exist").imageId).toBe("buildroot");
    });
  });
});

describe("containerSubtitle", () => {
  it("names the agent for the agent tier", () => {
    expect(containerSubtitle(buildContainer("agent", "claude-code"))).toBe("Claude Code");
  });

  it("names the config for the app tier", () => {
    expect(containerSubtitle(buildContainer("app", "openttd"))).toBe("OpenTTD");
  });

  it("names the image for the minios tier", () => {
    expect(containerSubtitle(buildContainer("minios", "windows101"))).toBe("Windows 1.01");
  });

  it("returns a label for every tier built with no selection", () => {
    for (const tier of TIER_IDS) {
      expect(containerSubtitle(buildContainer(tier)).length).toBeGreaterThan(0);
    }
  });
});
