// The whole app is containers, sized by how much OS you need. All run in-browser:
//   agent  — the smallest tier: an OpenShell-style, policy-governed agent
//            runtime (the NVIDIA NemoClaw/OpenShell stack), answering API calls
//   app    — a "bottle": one program in a minified Linux, shown as a single app
//   minios — a full minified Linux (x86 via v86/WASM) with a shell and tools
//
// OpenShell normally needs a supported host plus Docker/Podman/MicroVM;
// clientside-containers removes that barrier by running the runtime and
// progressively larger minified OSes in the browser, on any device.

import { DEFAULT_AGENT_POLICY_YAML } from "./policy";
import { emptyAgentSession, type AgentProvider, type AgentSession } from "./agent-session";
import { getAgentPreset, policyYamlForAgent } from "./agents";
import { getOsImage } from "./os-images";
import { getConfig } from "./configs";

export type ContainerTier = "agent" | "app" | "minios";

export type ContainerStatus = "stopped" | "booting" | "running" | "error";

export interface ContainerSettings {
  /** Guest RAM in MiB (minios/app tiers). */
  memoryMb: number;
  /** Outbound networking posture. */
  network: "off" | "restricted" | "open";
  /** Start automatically when the dashboard loads. */
  autostart: boolean;
  /** OpenShell-style policy (agent tier). YAML text. */
  policyYaml?: string;
  /** Inference provider for agent tier turns. */
  provider?: AgentProvider;
  /** Model id sent to the provider. */
  model?: string;
  /** Optional OpenAI-compatible base URL (no trailing slash required). */
  apiBaseUrl?: string;
  /** Provider API key — stored only in this browser's IndexedDB. */
  apiKey?: string;
}

/** A thumbnail of a container's interface, captured while it ran. */
export interface ContainerPreview {
  /** "image": a downscaled screenshot (data URL). "text": terminal/console text. */
  kind: "image" | "text";
  data: string;
  at: string;
}

export interface Container {
  id: string;
  name: string;
  tier: ContainerTier;
  /** For the `app` tier: which config (command sequence) to run after boot. */
  configId?: string;
  /** For the `agent` tier: which preconfigured agent. */
  agentId?: string;
  /** For the `minios` tier: which OS image to boot. */
  imageId?: string;
  status: ContainerStatus;
  createdAt: string;
  settings: ContainerSettings;
  /** Last captured preview of the running interface. */
  preview?: ContainerPreview;
  /** Persisted agent chat/console session (agent tier). */
  agentSession?: AgentSession;
}

export const TIERS: Record<
  ContainerTier,
  { label: string; blurb: string; defaultMemoryMb: number; icon: string }
> = {
  agent: {
    label: "Agent sandbox",
    blurb:
      "A policy-governed agent runtime — chat, tools, and egress under an OpenShell YAML policy. The smallest tier.",
    defaultMemoryMb: 64,
    icon: "M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-4z",
  },
  app: {
    label: "App bottle",
    blurb: "A minified Linux that runs a config — a sequence of commands — on boot.",
    defaultMemoryMb: 192,
    icon: "M4 4h16v6H4zM4 14h16v6H4z",
  },
  minios: {
    label: "Mini OS",
    blurb: "A full minified Linux booted in your browser (x86 via WASM).",
    defaultMemoryMb: 256,
    icon: "M3 5h18v12H3zM8 21h8M12 17v4",
  },
};

export const DEFAULT_SETTINGS: Record<ContainerTier, ContainerSettings> = {
  agent: {
    memoryMb: 64,
    network: "restricted",
    autostart: false,
    policyYaml: DEFAULT_AGENT_POLICY_YAML,
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    apiBaseUrl: "",
    apiKey: "",
  },
  app: { memoryMb: 192, network: "restricted", autostart: false },
  minios: { memoryMb: 256, network: "restricted", autostart: false },
};

export function newId(prefix = "ctr"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function tierUsesEmulator(tier: ContainerTier): boolean {
  return tier === "app" || tier === "minios";
}

/**
 * Pure factory — build a Container without touching storage. `selectionId` is
 * the per-tier choice: an agent id (agent), a bottled-app id (app), or an OS
 * image id (minios).
 */
export function buildContainer(tier: ContainerTier, selectionId?: string, name?: string): Container {
  const settings: ContainerSettings = { ...DEFAULT_SETTINGS[tier] };
  let configId: string | undefined;
  let agentId: string | undefined;
  let imageId: string | undefined;
  let prefix: string;
  let agentSession: AgentSession | undefined;

  if (tier === "agent") {
    const preset = getAgentPreset(selectionId);
    agentId = preset.id;
    settings.policyYaml = policyYamlForAgent(agentId);
    settings.provider = preset.provider;
    settings.model = preset.model;
    settings.apiBaseUrl = preset.apiBaseUrl ?? "";
    agentSession = emptyAgentSession();
    if (preset.systemPrompt) {
      agentSession.messages.push({
        id: `msg-sys-${agentId}`,
        role: "system",
        content: preset.systemPrompt,
        at: new Date().toISOString(),
      });
    }
    prefix = agentId;
  } else if (tier === "app") {
    configId = getConfig(selectionId).id;
    prefix = configId;
  } else {
    const image = getOsImage(selectionId);
    imageId = image.id;
    settings.memoryMb = image.memoryMb;
    prefix =
      image.kind === "windows" ? "win" : image.kind === "desktop" ? "ubuntu" : "linux";
  }

  return {
    id: newId(),
    name: name?.trim() || `${prefix}-${Math.random().toString(36).slice(2, 5)}`,
    tier,
    configId,
    agentId,
    imageId,
    status: "stopped",
    createdAt: new Date().toISOString(),
    settings,
    agentSession,
  };
}

/** Short label describing a container's preconfigured selection. */
export function containerSubtitle(c: Container): string {
  if (c.tier === "agent") return getAgentPreset(c.agentId).label;
  if (c.tier === "app") return getConfig(c.configId).label;
  return getOsImage(c.imageId).label;
}
