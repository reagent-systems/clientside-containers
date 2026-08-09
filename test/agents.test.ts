import { describe, expect, it } from "vitest";

import { AGENT_PRESETS, getAgentPreset, policyYamlForAgent } from "@/lib/agents";
import { evaluateEgress, parsePolicy } from "@/lib/policy";

const SHARED_DEV_HOSTS = [
  "api.github.com",
  "registry.npmjs.org",
  "pypi.org",
  "files.pythonhosted.org",
];

describe("getAgentPreset", () => {
  it("returns the preset with that id", () => {
    expect(getAgentPreset("claude-code").id).toBe("claude-code");
  });

  it("falls back to the first preset for an unknown id", () => {
    expect(getAgentPreset("does-not-exist").id).toBe(AGENT_PRESETS[0].id);
  });

  it("falls back to the first preset when the id is missing", () => {
    expect(getAgentPreset(undefined).id).toBe(AGENT_PRESETS[0].id);
  });
});

describe("AGENT_PRESETS", () => {
  it("gives every preset a unique id", () => {
    const ids = AGENT_PRESETS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every preset a label, a vendor, and at least one API host", () => {
    for (const agent of AGENT_PRESETS) {
      expect(agent.label.length).toBeGreaterThan(0);
      expect(agent.vendor.length).toBeGreaterThan(0);
      expect(agent.apiHosts.length).toBeGreaterThan(0);
    }
  });
});

describe("policyYamlForAgent", () => {
  it.each(AGENT_PRESETS.map((a) => [a.id, a] as const))(
    "makes a policy for %s that allows its API hosts and denies the rest",
    (_id, agent) => {
      const policy = parsePolicy(policyYamlForAgent(agent.id));

      expect(policy.network.default).toBe("deny");

      for (const host of agent.apiHosts) {
        expect(evaluateEgress(policy, { host, method: "POST" }).verdict).toBe("allow");
        expect(evaluateEgress(policy, { host, method: "GET" }).verdict).toBe("allow");
      }

      for (const host of SHARED_DEV_HOSTS) {
        expect(evaluateEgress(policy, { host, method: "GET" }).verdict).toBe("allow");
      }

      expect(evaluateEgress(policy, { host: "evil.com", method: "GET" }).verdict).toBe("deny");
    },
  );

  it("names the agent in a comment at the top of the document", () => {
    expect(policyYamlForAgent("grok").startsWith("# Grok Code (xAI)")).toBe(true);
  });

  it("falls back to the first preset's policy for an unknown id", () => {
    expect(policyYamlForAgent("does-not-exist")).toBe(policyYamlForAgent(AGENT_PRESETS[0].id));
  });
});
