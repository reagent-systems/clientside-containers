"use client";

import { useState } from "react";
import { TIERS, tierUsesEmulator, type Container, type ContainerSettings } from "@/lib/container";
import type { AgentProvider } from "@/lib/agent-session";

interface Props {
  container: Container;
  onSave: (name: string, settings: Partial<ContainerSettings>) => void;
  onDelete: () => void;
  onClose: () => void;
}

const NETWORKS: { value: ContainerSettings["network"]; label: string }[] = [
  { value: "off", label: "Off — no egress" },
  { value: "restricted", label: "Restricted — allowlist only" },
  { value: "open", label: "Open — all egress" },
];

const MEMORY_OPTIONS = [64, 128, 192, 256, 384, 512];

export function SettingsModal({ container, onSave, onDelete, onClose }: Props) {
  const [name, setName] = useState(container.name);
  const [memoryMb, setMemoryMb] = useState(container.settings.memoryMb);
  const [network, setNetwork] = useState(container.settings.network);
  const [autostart, setAutostart] = useState(container.settings.autostart);
  const [provider, setProvider] = useState<AgentProvider>(container.settings.provider ?? "anthropic");
  const [model, setModel] = useState(container.settings.model ?? "");
  const [apiBaseUrl, setApiBaseUrl] = useState(container.settings.apiBaseUrl ?? "");
  const [apiKey, setApiKey] = useState(container.settings.apiKey ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-panel max-w-md"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-heading-20 text-gray-1000">Container Settings</h2>
          <span className="badge">{TIERS[container.tier].label}</span>
        </div>

        <label className="label">Name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />

        {tierUsesEmulator(container.tier) && (
          <>
            <label className="label mt-4">Memory</label>
            <select
              className="input"
              value={memoryMb}
              onChange={(e) => setMemoryMb(Number(e.target.value))}
            >
              {MEMORY_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m} MiB
                </option>
              ))}
            </select>
          </>
        )}

        <label className="label mt-4">Networking</label>
        <select
          className="input"
          value={network}
          onChange={(e) => setNetwork(e.target.value as ContainerSettings["network"])}
        >
          {NETWORKS.map((n) => (
            <option key={n.value} value={n.value}>
              {n.label}
            </option>
          ))}
        </select>

        {container.tier === "agent" && (
          <>
            <label className="label mt-4">Provider</label>
            <select
              className="input"
              value={provider}
              onChange={(e) => setProvider(e.target.value as AgentProvider)}
            >
              <option value="anthropic">anthropic</option>
              <option value="openai">openai</option>
              <option value="openai-compatible">openai-compatible</option>
            </select>
            <label className="label mt-4">Model</label>
            <input className="input" value={model} onChange={(e) => setModel(e.target.value)} />
            <label className="label mt-4">API base URL</label>
            <input
              className="input"
              value={apiBaseUrl}
              onChange={(e) => setApiBaseUrl(e.target.value)}
              placeholder="optional OpenAI-compatible base"
            />
            <label className="label mt-4">API key</label>
            <input
              className="input font-mono"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
            />
          </>
        )}

        <label className="mt-4 flex items-center gap-2 text-copy-14 text-gray-1000">
          <input
            type="checkbox"
            checked={autostart}
            onChange={(e) => setAutostart(e.target.checked)}
            className="h-4 w-4 rounded-sm border-gray-alpha-500 accent-blue-700"
          />
          Start automatically when the dashboard loads
        </label>

        <p className="mt-3 text-copy-13 text-gray-700">
          Memory and networking apply on next start.
        </p>

        <div className="mt-6 flex items-center justify-between">
          {confirmDelete ? (
            <button type="button" onClick={onDelete} className="btn-danger btn-small">
              Confirm Delete
            </button>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="btn-danger btn-small">
              Delete Container
            </button>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-secondary btn-small">
              Cancel
            </button>
            <button
              type="button"
              onClick={() =>
                onSave(name, {
                  memoryMb,
                  network,
                  autostart,
                  ...(container.tier === "agent" ? { provider, model, apiBaseUrl, apiKey } : {}),
                })
              }
              className="btn-primary btn-small"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
