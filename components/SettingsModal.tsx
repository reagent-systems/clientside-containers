"use client";

import { useState } from "react";
import { TIERS, tierUsesEmulator, type Container, type ContainerSettings } from "@/lib/container";
import { getNodeCliProfile } from "@/lib/node-cli";

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
  const nodeCli = getNodeCliProfile(container.agentId);
  const [name, setName] = useState(container.name);
  const [memoryMb, setMemoryMb] = useState(container.settings.memoryMb);
  const [network, setNetwork] = useState(container.settings.network);
  const [autostart, setAutostart] = useState(container.settings.autostart);
  const [apiKey, setApiKey] = useState(() => (nodeCli ? nodeCli.readApiKey(container.settings) : ""));
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

        {nodeCli && (
          <>
            <label className="label mt-4" htmlFor="settings-node-cli-key">
              {nodeCli.apiKeyEnv}
            </label>
            <input
              id="settings-node-cli-key"
              className="input"
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
                  ...(nodeCli ? nodeCli.writeApiKey(apiKey) : {}),
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
