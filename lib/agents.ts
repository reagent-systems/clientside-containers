// Preconfigured agent sandboxes. Each agent gets an OpenShell-style policy whose
// network allowlist matches the APIs that agent actually talks to. Everything is
// evaluated client-side by the agent worker.

export interface EgressAllow {
  host: string;
  methods: string[];
}

/**
 * How an agent is provisioned in the OpenShell (WebContainer) runtime.
 * `runtime: "node"` agents install and run in the in-browser Node runtime.
 * `runtime: "native"` agents (Python/Docker toolchains) can't run in a browser
 * Node runtime — their real installers need a full OS, so we surface that
 * honestly rather than pretend.
 */
export interface AgentSetup {
  runtime: "node" | "native";
  /** The real one-line install, executed for real in the runtime terminal. */
  install: string;
  /** The command that starts the agent after install. */
  run: string;
  /** For native-runtime agents, why the browser Node runtime can't host them. */
  requires?: string;
}

export interface AgentPreset {
  id: string;
  label: string;
  vendor: string;
  blurb: string;
  /** API hosts this agent needs (beyond the shared developer hosts). */
  apiHosts: string[];
  /** Real install/run commands used by the OpenShell runtime. */
  setup: AgentSetup;
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
    setup: {
      runtime: "node",
      install: "npm install -g openclaw@latest --omit=optional",
      run: "openclaw --version",
    },
  },
  {
    id: "nanoclaw",
    label: "NanoClaw",
    vendor: "NVIDIA NemoClaw",
    blurb: "Minimal NemoClaw agent — a single inference backend.",
    apiHosts: ["api.anthropic.com"],
    setup: {
      runtime: "node",
      install: "npm install -g openclaw@latest --omit=optional",
      run: "openclaw --version",
    },
  },
  {
    id: "hermes",
    label: "Hermes",
    vendor: "Nous Research",
    blurb: "Hermes agent over OpenAI-compatible inference.",
    apiHosts: ["api.openai.com", "api.anthropic.com"],
    setup: {
      runtime: "native",
      install: "curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash",
      run: "hermes",
      requires: "Python 3.11 (uv) + git — the installer provisions a native toolchain",
    },
  },
  {
    id: "claude-code",
    label: "Claude Code",
    vendor: "Anthropic",
    blurb: "Anthropic's coding agent. Egress limited to the Anthropic API.",
    apiHosts: ["api.anthropic.com"],
    setup: {
      runtime: "node",
      install: "npm install -g @anthropic-ai/claude-code",
      run: "claude --version",
    },
  },
  {
    id: "gemini-cli",
    label: "Gemini CLI",
    vendor: "Google",
    blurb: "Google's Gemini command-line agent.",
    apiHosts: ["generativelanguage.googleapis.com", "oauth2.googleapis.com"],
    setup: {
      runtime: "node",
      install: "npm install -g @google/gemini-cli",
      run: "gemini --version",
    },
  },
  {
    id: "grok",
    label: "Grok Code",
    vendor: "xAI",
    blurb: "xAI's coding agent over the Grok API.",
    apiHosts: ["api.x.ai"],
    setup: {
      runtime: "node",
      install: "npm install -g @vibe-kit/grok-cli",
      run: "grok --version",
    },
  },
  {
    id: "cursor",
    label: "Cursor",
    vendor: "Anysphere",
    blurb: "Cursor's agent backend.",
    apiHosts: ["api2.cursor.sh", "api.cursor.com", "repo42.cursor.sh"],
    setup: {
      runtime: "node",
      install: "npm install -g cursor-agent",
      run: "cursor-agent --version",
    },
  },
  {
    id: "cursor-cli",
    label: "Cursor CLI",
    vendor: "Anysphere",
    blurb: "Cursor's command-line agent.",
    apiHosts: ["api2.cursor.sh", "api.cursor.com"],
    setup: {
      runtime: "node",
      install: "npm install -g cursor-agent",
      run: "cursor-agent --version",
    },
  },
];

export function getAgentPreset(id: string | undefined): AgentPreset {
  return AGENT_PRESETS.find((a) => a.id === id) ?? AGENT_PRESETS[0];
}

/** Build the OpenShell policy YAML for an agent preset. */
export function policyYamlForAgent(id: string | undefined): string {
  const agent = getAgentPreset(id);
  const apiRules = agent.apiHosts.map((host) => ({ host, methods: ["GET", "POST"] }));
  const rules = [...apiRules, ...SHARED_DEV_HOSTS];
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
