import yaml from "js-yaml";

// A small, real subset of the OpenShell policy model, evaluated client-side.
// Reference: https://github.com/NVIDIA/OpenShell

export type Verdict = "allow" | "deny";

export type NetworkMode = "off" | "restricted" | "open";

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

/** Resolve host + absolute URL for an egress request body. */
export function resolveEgressTarget(body: {
  url?: string;
  host?: string;
  path?: string;
  method?: string;
}): { url: string; host: string; method: string } | { error: string } {
  const method = String(body.method || "GET").toUpperCase();
  const rawUrl = typeof body.url === "string" ? body.url.trim() : "";
  let host = typeof body.host === "string" ? body.host.trim() : "";
  let path = typeof body.path === "string" ? body.path : "/";

  if (rawUrl) {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return { error: "invalid url" };
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { error: "only http(s) urls are allowed" };
    }
    return { url: parsed.href, host: parsed.hostname, method };
  }

  if (!host) return { error: "url or host is required" };
  if (!path.startsWith("/")) path = `/${path}`;
  return { url: `https://${host}${path}`, host, method };
}

export function evaluateEgress(
  policy: AgentPolicy,
  req: { host: string; method: string },
  network: NetworkMode = "restricted",
): { verdict: Verdict; reason: string } {
  const method = req.method.toUpperCase();
  if (network === "off") {
    return { verdict: "deny", reason: "networking is off" };
  }
  if (network === "open") {
    return { verdict: "allow", reason: "networking is open" };
  }
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

/** True if `path` is under any of the given prefixes (OpenShell-style). */
export function pathAllowed(path: string, prefixes: string[]): boolean {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return prefixes.some((p) => {
    const prefix = p.endsWith("/") ? p.slice(0, -1) : p;
    return normalized === prefix || normalized.startsWith(`${prefix}/`);
  });
}
