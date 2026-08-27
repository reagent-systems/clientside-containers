/** Hermes Agent terminal catalog — banner, tools, skills, and slash commands. */

export const HERMES_VERSION = "0.10.0";
export const HERMES_BUILD_DATE = "2026.4.16";
export const HERMES_UPSTREAM = "d0e1388c";

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

export const HERMES_HELP = `Commands:
  /help              Show this help
  /clear             Clear the transcript (keeps the banner)
  /status            Show model, session, and uptime
  /model [name]      Show or set the model id
  /key [token]       Set API key for inference (stored in this browser)
  /base [url]        Set OpenAI-compatible base URL host path
  /policy            Show the OpenShell network allowlist
  /tools             List toolsets
  /skills            List skillsets
  /quiet             Toggle quiet mode (hide banner on next open)

Type a message to talk to Hermes. Inference uses policy-gated egress.`;

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
