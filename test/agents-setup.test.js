import { describe, it, expect } from "vitest";
import { AGENT_PRESETS, getAgentPreset } from "../lib/agents.ts";

describe("agent setup commands (OpenShell runtime)", () => {
  it("every preset declares a real install + run command", () => {
    for (const p of AGENT_PRESETS) {
      expect(p.setup, `${p.id} setup`).toBeTruthy();
      expect(["node", "native"]).toContain(p.setup.runtime);
      expect(typeof p.setup.install).toBe("string");
      expect(p.setup.install.length).toBeGreaterThan(0);
      expect(typeof p.setup.run).toBe("string");
      expect(p.setup.run.length).toBeGreaterThan(0);
    }
  });

  it("node-runtime agents install via a package manager (runnable in WebContainer)", () => {
    const node = AGENT_PRESETS.filter((p) => p.setup.runtime === "node");
    expect(node.length).toBeGreaterThan(0);
    for (const p of node) {
      expect(p.setup.install, `${p.id} install`).toMatch(/^(npm|npx|pnpm|bun|yarn)\b/);
    }
  });

  it("native-runtime agents explain what full-OS toolchain they require", () => {
    const native = AGENT_PRESETS.filter((p) => p.setup.runtime === "native");
    for (const p of native) {
      expect(p.setup.requires, `${p.id} requires`).toBeTruthy();
    }
  });

  it("OpenClaw uses its documented one-line npm install", () => {
    expect(getAgentPreset("openclaw").setup.install).toContain("npm install -g openclaw@latest");
  });

  it("Hermes is native (needs Python/uv), so it can't run in a browser Node runtime", () => {
    const hermes = getAgentPreset("hermes");
    expect(hermes.setup.runtime).toBe("native");
    expect(hermes.setup.requires.toLowerCase()).toContain("python");
  });
});
