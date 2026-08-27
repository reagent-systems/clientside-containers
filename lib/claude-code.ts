/** Claude Code terminal catalog — banner, models, slash help. */

import type { AgentCliApiStyle } from "./agent-cli";

export const CLAUDE_CODE_VERSION = "2.1.0";
export const CLAUDE_CODE_VENDOR = "Anthropic";
export const CLAUDE_CODE_PRODUCT = "Claude Code";

export const CLAUDE_CODE_BANNER = `
 ██████╗██╗      █████╗ ██╗   ██╗██████╗ ███████╗
██╔════╝██║     ██╔══██╗██║   ██║██╔══██╗██╔════╝
██║     ██║     ███████║██║   ██║██║  ██║█████╗
██║     ██║     ██╔══██║██║   ██║██║  ██║██╔══╝
╚██████╗███████╗██║  ██║╚██████╔╝██████╔╝███████╗
 ╚═════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝
          ██████╗ ██████╗ ██████╗ ███████╗
         ██╔════╝██╔═══██╗██╔══██╗██╔════╝
         ██║     ██║   ██║██║  ██║█████╗
         ██║     ██║   ██║██║  ██║██╔══╝
         ╚██████╗╚██████╔╝██████╔╝███████╗
          ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝
`.replace(/^\n/, "");

export const CLAUDE_CODE_DEFAULT_MODEL = "claude-sonnet-4-20250514";
export const CLAUDE_CODE_DEFAULT_HOST = "api.anthropic.com";
export const CLAUDE_CODE_DEFAULT_PATH = "/v1/messages";
export const CLAUDE_CODE_API_STYLE: AgentCliApiStyle = "anthropic";

export const CLAUDE_CODE_MODELS = [
  "claude-opus-4-20250514",
  "claude-sonnet-4-20250514",
  "claude-haiku-4-20250414",
  "claude-3-5-sonnet-latest",
  "claude-3-5-haiku-latest",
];

export const CLAUDE_CODE_TIP =
  "Use /model to switch Sonnet ↔ Opus. /key sets your Anthropic API key for this container.";

export const CLAUDE_CODE_HELP = `Commands:
  /help                 Show this help
  /clear                Clear the transcript
  /status               Show model, session, and uptime
  /model [name]         Show or set the Claude model
  /key [token]          Set Anthropic API key
  /base [url]           Set Messages API base URL
  /policy               Show the OpenShell network allowlist
  /compact              Note: context compact is a no-op in this sandbox
  /cost                 Show a placeholder usage line
  /quiet                Toggle quiet mode (hide banner)

Type a message to talk to Claude Code. Inference uses the Anthropic Messages API via policy-gated egress.
Examples:
  /model claude-opus-4-20250514
  /key sk-ant-...`;

export const CLAUDE_CODE_TOOLS = [
  "Read",
  "Write",
  "Edit",
  "Bash",
  "Glob",
  "Grep",
  "WebFetch",
  "WebSearch",
  "Task",
  "TodoWrite",
];
