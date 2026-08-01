import { describe, expect, it } from "vitest";

import {
  DEFAULT_AGENT_POLICY,
  DEFAULT_AGENT_POLICY_YAML,
  evaluateEgress,
  parsePolicy,
  policyToYaml,
} from "@/lib/policy";

describe("parsePolicy", () => {
  it("parses the default policy YAML", () => {
    const policy = parsePolicy(DEFAULT_AGENT_POLICY_YAML);
    expect(policy.network.default).toBe("deny");
    expect(policy.network.allow.map((r) => r.host)).toEqual(
      DEFAULT_AGENT_POLICY.network.allow.map((r) => r.host),
    );
    expect(policy.filesystem.writable).toEqual(["/workspace", "/tmp"]);
    expect(policy.filesystem.readonly).toEqual(["/etc", "/usr"]);
  });

  it("defaults to deny when the document is empty", () => {
    const policy = parsePolicy("");
    expect(policy.network.default).toBe("deny");
    expect(policy.network.allow).toEqual([]);
    expect(policy.filesystem.writable).toEqual([]);
  });

  it("defaults to deny when the default field is not a known verdict", () => {
    const policy = parsePolicy("network:\n  default: maybe\n");
    expect(policy.network.default).toBe("deny");
  });

  it("keeps an explicit allow default", () => {
    const policy = parsePolicy("network:\n  default: allow\n");
    expect(policy.network.default).toBe("allow");
  });

  it("uppercases methods and defaults a rule with no methods to GET", () => {
    const policy = parsePolicy("network:\n  allow:\n    - host: a.example\n      methods: [get, post]\n    - host: b.example\n");
    expect(policy.network.allow[0].methods).toEqual(["GET", "POST"]);
    expect(policy.network.allow[1].methods).toEqual(["GET"]);
  });

  it("ignores an allow list that is not a list", () => {
    const policy = parsePolicy("network:\n  allow: nonsense\n");
    expect(policy.network.allow).toEqual([]);
  });
});

describe("policyToYaml", () => {
  it("makes a document that parses back to the same policy", () => {
    const roundTripped = parsePolicy(policyToYaml(DEFAULT_AGENT_POLICY));
    expect(roundTripped).toEqual(DEFAULT_AGENT_POLICY);
  });
});

describe("evaluateEgress", () => {
  it("allows a request that matches host and method", () => {
    const result = evaluateEgress(DEFAULT_AGENT_POLICY, {
      host: "api.github.com",
      method: "GET",
    });
    expect(result.verdict).toBe("allow");
    expect(result.reason).toContain("api.github.com");
  });

  it("compares the method without case", () => {
    expect(
      evaluateEgress(DEFAULT_AGENT_POLICY, { host: "api.github.com", method: "get" }).verdict,
    ).toBe("allow");
  });

  it("denies a host that has no rule", () => {
    const result = evaluateEgress(DEFAULT_AGENT_POLICY, { host: "evil.com", method: "GET" });
    expect(result.verdict).toBe("deny");
    expect(result.reason).toContain("evil.com");
  });

  it("denies a known host when the method is not allowed", () => {
    expect(
      evaluateEgress(DEFAULT_AGENT_POLICY, { host: "api.github.com", method: "POST" }).verdict,
    ).toBe("deny");
  });

  it("treats a wildcard method as every method", () => {
    const policy = parsePolicy("network:\n  allow:\n    - host: a.example\n      methods: ['*']\n");
    expect(evaluateEgress(policy, { host: "a.example", method: "DELETE" }).verdict).toBe("allow");
  });

  it("allows an unlisted host when the default is allow", () => {
    const policy = parsePolicy("network:\n  default: allow\n");
    const result = evaluateEgress(policy, { host: "anything.example", method: "POST" });
    expect(result.verdict).toBe("allow");
    expect(result.reason).toBe("default policy is allow");
  });

  it("does not match a subdomain of an allowed host", () => {
    expect(
      evaluateEgress(DEFAULT_AGENT_POLICY, { host: "evil.api.github.com", method: "GET" }).verdict,
    ).toBe("deny");
  });
});
