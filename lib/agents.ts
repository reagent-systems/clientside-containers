// Preconfigured agent sandboxes. Each agent gets an OpenShell-style policy whose
// network allowlist matches the APIs that agent actually talks to. Everything is
// evaluated client-side by the agent worker.

export interface EgressAllow {
  host: string;
  methods: string[];
}

export interface AgentPreset {
  id: string;
  label: string;
  vendor: string;
  blurb: string;
  /** API hosts this agent needs (beyond the shared developer hosts). */
  apiHosts: string[];
}

// Hosts every coding agent tends to reach: source, packages.
const SHARED_DEV_HOSTS: EgressAllow[] = [
  { host: "api.github.com", methods: ["GET"] },
  { host: "registry.npmjs.org", methods: ["GET"] },
  { host: "pypi.org", methods: ["GET"] },
  { host: "files.pythonhosted.org", methods: ["GET"] },
];

export const AGENT_PRESETS: AgentPreset[] = [
  {
    id: "openclaw",
    label: "OpenClaw",
    vendor: "openclaw.ai · NVIDIA NemoClaw",
    blurb: "The NemoClaw reference agent. Talks to Anthropic and OpenAI inference.",
    apiHosts: ["api.anthropic.com", "api.openai.com"],
  },
  {
    id: "nanoclaw",
    label: "NanoClaw",
    vendor: "NVIDIA NemoClaw",
    blurb: "Minimal NemoClaw agent — a single inference backend.",
    apiHosts: ["api.anthropic.com"],
  },
  {
    id: "hermes",
    label: "Hermes",
    vendor: "Nous Research",
    blurb: "Hermes agent over OpenAI-compatible inference.",
    apiHosts: ["api.openai.com", "api.anthropic.com"],
  },
  {
    id: "claude-code",
    label: "Claude Code",
    vendor: "Anthropic",
    blurb: "Anthropic's coding agent. Egress limited to the Anthropic API.",
    apiHosts: ["api.anthropic.com"],
  },
  {
    id: "gemini-cli",
    label: "Gemini CLI",
    vendor: "Google",
    blurb: "Google's Gemini command-line agent.",
    apiHosts: ["generativelanguage.googleapis.com", "oauth2.googleapis.com"],
  },
  {
    id: "grok",
    label: "Grok Code",
    vendor: "xAI",
    blurb: "xAI's coding agent over the Grok API.",
    apiHosts: ["api.x.ai"],
  },
  {
    id: "cursor",
    label: "Cursor",
    vendor: "Anysphere",
    blurb: "Cursor's agent backend.",
    apiHosts: ["api2.cursor.sh", "api.cursor.com", "repo42.cursor.sh"],
  },
  {
    id: "cursor-cli",
    label: "Cursor CLI",
    vendor: "Anysphere",
    blurb: "Cursor's command-line agent.",
    apiHosts: ["api2.cursor.sh", "api.cursor.com"],
  },
];

export function getAgentPreset(id: string | undefined): AgentPreset {
  return AGENT_PRESETS.find((a) => a.id === id) ?? AGENT_PRESETS[0];
}

/** The network rules an agent preset's generated policy allows — its own API
 * hosts, then the shared developer hosts every preset gets. */
export function agentPolicyRules(id: string | undefined): EgressAllow[] {
  const agent = getAgentPreset(id);
  const apiRules = agent.apiHosts.map((host) => ({ host, methods: ["GET", "POST"] }));
  return [...apiRules, ...SHARED_DEV_HOSTS];
}

/** Build the OpenShell policy YAML for an agent preset. */
export function policyYamlForAgent(id: string | undefined): string {
  const agent = getAgentPreset(id);
  const rules = agentPolicyRules(id);
  const allowLines = rules
    .map((r) => `    - host: ${r.host}\n      methods: [${r.methods.join(", ")}]`)
    .join("\n");
  return `# ${agent.label} (${agent.vendor}) — generated OpenShell policy.
network:
  default: deny
  allow:
${allowLines}
filesystem:
  writable: [/workspace, /tmp]
  readonly: [/etc, /usr]
`;
}
