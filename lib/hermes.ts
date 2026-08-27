/** Hermes Agent terminal catalog — releases, providers, tools, skills, slash help. */

export interface HermesRelease {
  id: string;
  /** Semver as shown in the CLI banner. */
  version: string;
  /** Calendar tag Hermes uses, e.g. 2026.8.27 */
  buildDate: string;
  /** Short upstream git sha. */
  upstream: string;
  label: string;
  blurb: string;
  /** When true, this is the default for new Hermes containers. */
  latest?: boolean;
}

/** Known Hermes Agent releases we can boot into (splash + help text). */
export const HERMES_RELEASES: HermesRelease[] = [
  {
    id: "0.20.6",
    version: "0.20.6",
    buildDate: "2026.8.27",
    upstream: "9dfbde19",
    label: "v0.20.6 (latest)",
    blurb: "Current Hermes Agent release (v2026.8.27).",
    latest: true,
  },
  {
    id: "0.10.0",
    version: "0.10.0",
    buildDate: "2026.4.16",
    upstream: "d0e1388c",
    label: "v0.10.0",
    blurb: "Earlier Hermes Agent splash (April 2026).",
  },
];

export function getHermesRelease(id: string | undefined): HermesRelease {
  return HERMES_RELEASES.find((r) => r.id === id) ?? HERMES_RELEASES.find((r) => r.latest) ?? HERMES_RELEASES[0];
}

export function latestHermesRelease(): HermesRelease {
  return HERMES_RELEASES.find((r) => r.latest) ?? HERMES_RELEASES[0];
}

/** @deprecated use getHermesRelease / latestHermesRelease */
export const HERMES_VERSION = latestHermesRelease().version;
/** @deprecated */
export const HERMES_BUILD_DATE = latestHermesRelease().buildDate;
/** @deprecated */
export const HERMES_UPSTREAM = latestHermesRelease().upstream;

export const HERMES_BANNER = `
 ██╗  ██╗███████╗██████╗ ███╗   ███╗███████╗███████╗
 ██║  ██║██╔════╝██╔══██╗████╗ ████║██╔════╝██╔════╝
 ███████║█████╗  ██████╔╝██╔████╔██║█████╗  ███████╗
 ██╔══██║██╔══╝  ██╔══██╗██║╚██╔╝██║██╔══╝  ╚════██║
 ██║  ██║███████╗██║  ██║██║ ╚═╝ ██║███████╗███████║
 ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝╚══════╝╚══════╝
                █████╗  ██████╗ ███████╗███╗   ██╗████████╗
               ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝
               ███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║
               ██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║
               ██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║
               ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝
`.replace(/^\n/, "");

/** Caduceus mark used in the Hermes CLI splash panel. */
export const HERMES_CADUCEUS = `
      .·:·.
     ( o o )
      \\ - /
   .--'   '--.
  /  .-----.  \\
 |  /  .·.  \\  |
 | |  ( o )  | |
 |  \\  '-'  /  |
  \\  '-----'  /
   '--.   .--'
      | | |
     /  |  \\
    '   '   '
`.replace(/^\n/, "");

export interface HermesToolset {
  name: string;
  tools: string[];
}

export interface HermesSkillset {
  name: string;
  skills: string[];
}

export const HERMES_TOOLSETS: HermesToolset[] = [
  { name: "browser", tools: ["browser_back", "browser_click", "browser_navigate", "browser_snapshot"] },
  { name: "clarify", tools: ["clarify"] },
  { name: "code_execution", tools: ["execute_code"] },
  { name: "cronjob", tools: ["cronjob"] },
  { name: "delegation", tools: ["delegate_task"] },
  { name: "file", tools: ["patch", "read_file", "search_files", "write_file"] },
  { name: "homeassistant", tools: ["ha_call_service", "ha_get_state", "ha_list_entities"] },
  { name: "image_gen", tools: ["image_generate"] },
];

export const HERMES_EXTRA_TOOLSET_COUNT = 10;

export const HERMES_SKILLSETS: HermesSkillset[] = [
  { name: "apple", skills: ["apple-notes", "imessage"] },
  { name: "autonomous-ai-agents", skills: ["claude-code", "hermes-agent"] },
  { name: "creative", skills: ["writing", "design"] },
  { name: "data-science", skills: ["notebooks", "analysis"] },
  { name: "devops", skills: ["docker", "k8s"] },
  { name: "email", skills: ["imap", "send"] },
  { name: "gaming", skills: ["steam"] },
  { name: "general", skills: ["web-search"] },
  { name: "github", skills: ["codebase-inspection", "github-auth"] },
  { name: "leisure", skills: ["music"] },
  { name: "mcp", skills: ["mcporter", "native-mcp"] },
  { name: "media", skills: ["ffmpeg"] },
  { name: "mlops", skills: ["training"] },
  { name: "note-taking", skills: ["obsidian"] },
  { name: "productivity", skills: ["google-workspace", "notion", "slack"] },
  { name: "red-teaming", skills: ["recon"] },
  { name: "research", skills: ["papers"] },
  { name: "smart-home", skills: ["homeassistant"] },
  { name: "social-media", skills: ["post"] },
  { name: "software-development", skills: ["plan", "requesting-code-review"] },
];

export const HERMES_TOOL_COUNT = 31;
export const HERMES_SKILL_COUNT = 79;

export const HERMES_DEFAULT_MODEL = "kimi-k2.5:cloud";
export const HERMES_VENDOR = "Nous Research";
export const HERMES_TIP =
  "hermes chat -Q enables quiet mode for programmatic use — suppresses banner and spinner.";

/** OpenAI-compatible inference providers Hermes can switch to in-browser. */
export interface HermesProvider {
  id: string;
  label: string;
  host: string;
  path: string;
  defaultModel: string;
  /** Extra API hosts this provider needs in the OpenShell allowlist. */
  apiHosts: string[];
  /** When true, an empty API key is allowed (local / no-auth endpoints). */
  allowEmptyKey?: boolean;
  note?: string;
}

export const HERMES_PROVIDERS: HermesProvider[] = [
  {
    id: "openai",
    label: "OpenAI API",
    host: "api.openai.com",
    path: "/v1/chat/completions",
    defaultModel: "gpt-4o-mini",
    apiHosts: ["api.openai.com"],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    host: "openrouter.ai",
    path: "/api/v1/chat/completions",
    defaultModel: "anthropic/claude-sonnet-4",
    apiHosts: ["openrouter.ai"],
    note: "Routes many models (Anthropic, Google, …) through one OpenAI-compatible endpoint.",
  },
  {
    id: "nous",
    label: "Nous Portal",
    host: "inference-api.nousresearch.com",
    path: "/v1/chat/completions",
    defaultModel: HERMES_DEFAULT_MODEL,
    apiHosts: ["inference-api.nousresearch.com", "portal.nousresearch.com"],
    note: "Nous Research subscription / portal inference.",
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    host: "api.x.ai",
    path: "/v1/chat/completions",
    defaultModel: "grok-2-latest",
    apiHosts: ["api.x.ai"],
  },
  {
    id: "fireworks",
    label: "Fireworks AI",
    host: "api.fireworks.ai",
    path: "/inference/v1/chat/completions",
    defaultModel: "accounts/fireworks/models/llama-v3p1-70b-instruct",
    apiHosts: ["api.fireworks.ai"],
  },
  {
    id: "novita",
    label: "Novita AI",
    host: "api.novita.ai",
    path: "/openai/v1/chat/completions",
    defaultModel: "moonshotai/kimi-k2.5",
    apiHosts: ["api.novita.ai"],
  },
  {
    id: "kimi",
    label: "Kimi / Moonshot",
    host: "api.moonshot.ai",
    path: "/v1/chat/completions",
    defaultModel: "kimi-k2.5",
    apiHosts: ["api.moonshot.ai"],
  },
  {
    id: "ollama-cloud",
    label: "Ollama Cloud",
    host: "ollama.com",
    path: "/v1/chat/completions",
    defaultModel: "gpt-oss:120b",
    apiHosts: ["ollama.com"],
  },
  {
    id: "custom",
    label: "Custom endpoint",
    host: "localhost",
    path: "/v1/chat/completions",
    defaultModel: "local-model",
    apiHosts: [],
    allowEmptyKey: true,
    note: "Set host/path with /base https://host/v1/chat/completions",
  },
];

export function getHermesProvider(id: string | undefined): HermesProvider {
  return HERMES_PROVIDERS.find((p) => p.id === id) ?? HERMES_PROVIDERS[0];
}

/** Hosts every Hermes container should allow so /provider switches work. */
export function hermesProviderApiHosts(): string[] {
  const hosts = new Set<string>(["api.openai.com", "api.anthropic.com"]);
  for (const p of HERMES_PROVIDERS) {
    for (const h of p.apiHosts) hosts.add(h);
  }
  return [...hosts];
}

export function formatProviderList(activeId: string): string {
  const lines = HERMES_PROVIDERS.map((p) => {
    const mark = p.id === activeId ? "*" : " ";
    return `${mark} ${p.id.padEnd(14)} ${p.label}  → ${p.host}${p.path}`;
  });
  return [
    "Providers (* = active):",
    ...lines,
    "",
    "Usage:",
    "  /provider                 Show this list",
    "  /provider openrouter      Switch provider (sets host + default model)",
    "  /model openrouter:claude-sonnet-4",
    "  /model anthropic/claude-sonnet-4",
  ].join("\n");
}

/**
 * Parse `/model` args the way Hermes CLI does:
 *   claude-sonnet-4
 *   openrouter:anthropic/claude-sonnet-4
 *   custom:qwen-2.5
 */
export function parseHermesModelArg(arg: string): { providerId?: string; model: string } {
  const trimmed = arg.trim();
  if (!trimmed) return { model: "" };
  const colon = trimmed.indexOf(":");
  if (colon > 0) {
    const maybeProvider = trimmed.slice(0, colon).toLowerCase();
    if (HERMES_PROVIDERS.some((p) => p.id === maybeProvider)) {
      return { providerId: maybeProvider, model: trimmed.slice(colon + 1).trim() || getHermesProvider(maybeProvider).defaultModel };
    }
  }
  return { model: trimmed };
}

export const HERMES_HELP = `Commands:
  /help                    Show this help
  /clear                   Clear the transcript (keeps the banner)
  /status                  Show model, provider, session, and uptime
  /provider [name]         List or switch inference provider
  /model [name]            Show or set model (supports provider:model)
  /key [token]             Set API key for inference (stored in this browser)
  /base [url]              Set OpenAI-compatible base URL
  /version [id]            Show or switch Hermes Agent release (e.g. 0.20.6)
  /policy                  Show the OpenShell network allowlist
  /tools                   List toolsets
  /skills                  List skillsets
  /quiet                   Toggle quiet mode (hide banner on next open)

Type a message to talk to Hermes. Inference uses policy-gated egress.
Examples:
  /provider openrouter
  /model openrouter:anthropic/claude-sonnet-4
  /key sk-...`;

export function newHermesSessionId(d = new Date()): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}_` +
    `${pad(d.getMilliseconds(), 6)}`
  );
}

export function countHermesTools(): number {
  return HERMES_TOOLSETS.reduce((n, t) => n + t.tools.length, 0);
}

export function formatToolLine(t: HermesToolset): string {
  const shown = t.tools.slice(0, 4).join(", ");
  const more = t.tools.length > 4 ? ", ..." : "";
  return `${t.name}: ${shown}${more}`;
}

export function formatSkillLine(s: HermesSkillset): string {
  return `${s.name}: ${s.skills.join(", ")}`;
}

export function formatReleaseList(activeId: string): string {
  return [
    "Hermes Agent releases (* = active):",
    ...HERMES_RELEASES.map((r) => {
      const mark = r.id === activeId ? "*" : " ";
      return `${mark} ${r.id.padEnd(8)} v${r.version} (${r.buildDate}) · upstream ${r.upstream}${r.latest ? "  [latest]" : ""}`;
    }),
    "",
    "Usage: /version 0.20.6",
  ].join("\n");
}
