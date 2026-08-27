/** Gemini CLI terminal catalog — banner, models, slash help. */

import type { AgentCliApiStyle } from "./agent-cli";

export const GEMINI_CLI_VERSION = "0.12.0";
export const GEMINI_CLI_VENDOR = "Google";
export const GEMINI_CLI_PRODUCT = "Gemini CLI";

/** Short ASCII logo adapted from google-gemini/gemini-cli. */
export const GEMINI_CLI_BANNER = `
 █████████ ██████████ ██████   ██████ █████ ██████   █████ █████
███░░░░░███░░███░░░░░█░░██████ ██████ ░░███ ░░██████ ░░███ ░░███
███     ░░░  ░███  █ ░  ░███░█████░███  ░███  ░███░███  ░███  ░███
░███          ░██████   ░███░░███ ░███  ░███  ░███░░███ ░███  ░███
░███    █████ ░███░░█   ░███ ░░░  ░███  ░███  ░███ ░░██████   ░███
░░███  ░░███  ░███ ░ █  ░███      ░███  ░███  ░███  ░░█████   ░███
 ░░█████████  ██████████ █████     █████ █████ █████  ░░█████  █████
  ░░░░░░░░░  ░░░░░░░░░░ ░░░░░     ░░░░░ ░░░░░ ░░░░░   ░░░░░  ░░░░░
`.replace(/^\n/, "");

export const GEMINI_CLI_DEFAULT_MODEL = "gemini-2.5-pro";
export const GEMINI_CLI_DEFAULT_HOST = "generativelanguage.googleapis.com";
/** Google's OpenAI-compatible chat completions endpoint. */
export const GEMINI_CLI_DEFAULT_PATH = "/v1beta/openai/chat/completions";
export const GEMINI_CLI_API_STYLE: AgentCliApiStyle = "openai";

export const GEMINI_CLI_MODELS = [
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-pro",
];

export const GEMINI_CLI_TIP =
  "Tip: /model set gemini-2.5-flash for faster turns. /tools lists built-in tools.";

export const GEMINI_CLI_HELP = `Commands:
  /help                 Show this help (alias: /?)
  /clear                Clear the transcript
  /status               Show model, session, and uptime
  /model [name]         Show or set the Gemini model
  /key [token]          Set Gemini API key
  /base [url]           Set OpenAI-compatible base URL
  /policy               Show the OpenShell network allowlist
  /tools                List available tools
  /theme                Show active theme name
  /auth                 Show auth status for this container
  /quiet                Toggle quiet mode (hide banner)

Type a message to talk to Gemini. Inference uses Google's OpenAI-compatible endpoint via policy-gated egress.
Examples:
  /model gemini-2.5-flash
  /key AIza...`;

export const GEMINI_CLI_TOOLS = [
  "read_file",
  "write_file",
  "edit",
  "shell",
  "glob",
  "search_file_content",
  "web_fetch",
  "web_search",
  "save_memory",
  "mcp",
];
