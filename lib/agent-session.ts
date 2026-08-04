/** Persisted chat/tool transcript for an agent sandbox container. */

export type AgentMessageRole = "system" | "user" | "assistant" | "tool";

export interface AgentToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AgentMessage {
  id: string;
  role: AgentMessageRole;
  content: string;
  /** Present when role is tool — which tool produced this result. */
  toolName?: string;
  toolCallId?: string;
  /** Present when the assistant requested tools. */
  toolCalls?: AgentToolCall[];
  at: string;
}

export interface AgentConsoleLine {
  dir: "in" | "out" | "sys";
  text: string;
}

export interface AgentSession {
  messages: AgentMessage[];
  consoleLog: AgentConsoleLine[];
  /** Snapshot of the worker virtual filesystem. */
  files?: Record<string, string>;
}

export type AgentProvider = "openai" | "anthropic" | "openai-compatible";

export function emptyAgentSession(): AgentSession {
  return { messages: [], consoleLog: [], files: {} };
}

export function newMessageId(): string {
  return `msg-${Math.random().toString(36).slice(2, 10)}`;
}

export function makeMessage(
  role: AgentMessageRole,
  content: string,
  extra?: Partial<Pick<AgentMessage, "toolName" | "toolCallId">>,
): AgentMessage {
  return {
    id: newMessageId(),
    role,
    content,
    at: new Date().toISOString(),
    ...extra,
  };
}
