/** Shared helpers for browser CLI agent terminals (Claude Code, Gemini CLI, …). */

export interface AgentCliRuntime {
  model: string;
  apiKey: string;
  apiHost: string;
  apiPath: string;
  quiet: boolean;
}

/** How `/agent/chat` should speak to the provider. */
export type AgentCliApiStyle = "openai" | "anthropic";

export function newAgentCliSessionId(d = new Date()): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}_` +
    `${pad(d.getMilliseconds(), 6)}`
  );
}

export function formatModelList(models: string[], active: string): string {
  return [
    "Models (* = active):",
    ...models.map((m) => `${m === active ? "*" : " "} ${m}`),
    "",
    "Usage: /model <name>",
  ].join("\n");
}

export function elapsedLabel(startedAt: number): string {
  const s = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m${String(r).padStart(2, "0")}s`;
}
