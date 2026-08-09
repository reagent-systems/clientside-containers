import yaml from "js-yaml";

// A small, real subset of the OpenShell policy model, evaluated client-side.
// Reference: https://github.com/NVIDIA/OpenShell

export type Verdict = "allow" | "deny";

export interface EgressRule {
  host: string;
  methods: string[];
}

export interface AgentPolicy {
  network: {
    default: Verdict;
    allow: EgressRule[];
  };
  filesystem: {
    writable: string[];
    readonly: string[];
  };
}

export const DEFAULT_AGENT_POLICY: AgentPolicy = {
  network: {
    default: "deny",
    allow: [
      { host: "api.github.com", methods: ["GET"] },
      { host: "registry.npmjs.org", methods: ["GET"] },
      { host: "pypi.org", methods: ["GET"] },
      { host: "files.pythonhosted.org", methods: ["GET"] },
    ],
  },
  filesystem: {
    writable: ["/workspace", "/tmp"],
    readonly: ["/etc", "/usr"],
  },
};

export const DEFAULT_AGENT_POLICY_YAML = `# OpenShell-style policy, enforced in the browser.
network:
  default: deny
  allow:
    - host: api.github.com
      methods: [GET]
    - host: registry.npmjs.org
      methods: [GET]
    - host: pypi.org
      methods: [GET]
    - host: files.pythonhosted.org
      methods: [GET]
filesystem:
  writable: [/workspace, /tmp]
  readonly: [/etc, /usr]
`;

export function parsePolicy(text: string): AgentPolicy {
  const raw = (yaml.load(text) ?? {}) as Partial<AgentPolicy>;
  return {
    network: {
      default: raw.network?.default === "allow" ? "allow" : "deny",
      allow: Array.isArray(raw.network?.allow)
        ? raw.network!.allow.map((r) => ({
            host: String(r.host ?? ""),
            methods: (r.methods ?? ["GET"]).map((m) => String(m).toUpperCase()),
          }))
        : [],
    },
    filesystem: {
      writable: raw.filesystem?.writable?.map(String) ?? [],
      readonly: raw.filesystem?.readonly?.map(String) ?? [],
    },
  };
}

export function policyToYaml(policy: AgentPolicy): string {
  return yaml.dump(policy, { lineWidth: 80 });
}

export function evaluateEgress(
  policy: AgentPolicy,
  req: { host: string; method: string },
): { verdict: Verdict; reason: string } {
  const method = req.method.toUpperCase();
  const match = policy.network.allow.find(
    (r) => r.host === req.host && (r.methods.includes(method) || r.methods.includes("*")),
  );
  if (match) {
    return { verdict: "allow", reason: `matched allow rule for ${match.host}` };
  }
  if (policy.network.default === "allow") {
    return { verdict: "allow", reason: "default policy is allow" };
  }
  return { verdict: "deny", reason: `no rule permits ${method} ${req.host}` };
}

/** Build the HTTPS URL an allowed egress call actually fetches. */
export function egressUrl(host: string, path?: string): string {
  const p = path && path.length > 0 ? (path.startsWith("/") ? path : `/${path}`) : "/";
  return `https://${host}${p}`;
}
