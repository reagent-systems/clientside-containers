// Preconfigured agent sandboxes. Each agent gets an OpenShell-style policy whose
// network allowlist matches the APIs that agent actually talks to, plus a system
// prompt and default inference settings. Runtime evaluation is client-side.

import type { AgentProvider } from "./agent-session";

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
  provider: AgentProvider;
  model: string;
  /** Optional OpenAI-compatible base URL. */
  apiBaseUrl?: string;
  systemPrompt: string;
}

// Hosts every coding agent tends to reach: source, packages.
const SHARED_DEV_HOSTS: EgressAllow[] = [
  { host: "api.github.com", methods: ["GET"] },
  { host: "registry.npmjs.org", methods: ["GET"] },
  { host: "pypi.org", methods: ["GET"] },
  { host: "files.pythonhosted.org", methods: ["GET"] },
];

const TOOL_PREAMBLE = `You are running inside a clientside-containers Agent sandbox (OpenShell-style policy in a Web Worker).
Use tools when they help. Respect that network and filesystem access are policy-gated.
Tools: http_request, eval_js, fs_list, fs_read, fs_write.
Keep answers concise unless the user asks for detail.`;

export const AGENT_PRESETS: AgentPreset[] = [
  {
    id: "openclaw",
    label: "OpenClaw",
    vendor: "openclaw.ai · NVIDIA NemoClaw",
    blurb: "The NemoClaw reference agent. Talks to Anthropic and OpenAI inference.",
    apiHosts: ["api.anthropic.com", "api.openai.com"],
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    systemPrompt: `${TOOL_PREAMBLE}\nYou are OpenClaw, a NemoClaw-style coding agent.`,
  },
  {
    id: "nanoclaw",
    label: "NanoClaw",
    vendor: "NVIDIA NemoClaw",
    blurb: "Minimal NemoClaw agent — a single inference backend.",
    apiHosts: ["api.anthropic.com"],
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    systemPrompt: `${TOOL_PREAMBLE}\nYou are NanoClaw, a minimal coding agent.`,
  },
  {
    id: "hermes",
    label: "Hermes",
    vendor: "Nous Research",
    blurb: "Hermes agent over OpenAI-compatible inference.",
    apiHosts: ["api.openai.com", "api.anthropic.com"],
    provider: "openai",
    model: "gpt-4o-mini",
    systemPrompt: `${TOOL_PREAMBLE}\nYou are Hermes, a tool-using coding agent.`,
  },
  {
    id: "claude-code",
    label: "Claude Code",
    vendor: "Anthropic",
    blurb: "Anthropic's coding agent. Egress limited to the Anthropic API.",
    apiHosts: ["api.anthropic.com"],
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    systemPrompt: `${TOOL_PREAMBLE}\nYou are Claude Code — prefer precise, actionable coding help.`,
  },
  {
    id: "gemini-cli",
    label: "Gemini CLI",
    vendor: "Google",
    blurb: "Google's Gemini command-line agent.",
    apiHosts: ["generativelanguage.googleapis.com", "oauth2.googleapis.com"],
    provider: "openai-compatible",
    model: "gemini-2.0-flash",
    apiBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    systemPrompt: `${TOOL_PREAMBLE}\nYou are Gemini CLI in an OpenShell-style sandbox.`,
  },
  {
    id: "grok",
    label: "Grok Code",
    vendor: "xAI",
    blurb: "xAI's coding agent over the Grok API.",
    apiHosts: ["api.x.ai"],
    provider: "openai-compatible",
    model: "grok-2-latest",
    apiBaseUrl: "https://api.x.ai/v1",
    systemPrompt: `${TOOL_PREAMBLE}\nYou are Grok Code in a policy-gated sandbox.`,
  },
  {
    id: "cursor",
    label: "Cursor",
    vendor: "Anysphere",
    blurb: "Cursor's agent backend.",
    apiHosts: ["api2.cursor.sh", "api.cursor.com", "repo42.cursor.sh", "api.openai.com", "api.anthropic.com"],
    provider: "openai-compatible",
    model: "gpt-4o-mini",
    systemPrompt: `${TOOL_PREAMBLE}\nYou are a Cursor-style coding agent in the browser sandbox.`,
  },
  {
    id: "cursor-cli",
    label: "Cursor CLI",
    vendor: "Anysphere",
    blurb: "Cursor's command-line agent.",
    apiHosts: ["api2.cursor.sh", "api.cursor.com", "api.openai.com", "api.anthropic.com"],
    provider: "openai-compatible",
    model: "gpt-4o-mini",
    systemPrompt: `${TOOL_PREAMBLE}\nYou are Cursor CLI in the browser sandbox.`,
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
