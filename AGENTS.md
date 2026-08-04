# Working on clientside-containers

This repo is agent-first. If you are an automated agent (or a human) improving
it, follow this loop. The goal: **the easiest, fastest way to try any AI system,
any app, on any environment, on any device — entirely in the browser.**

## The product, in one paragraph

The app is a grid of containers that run client-side. Containers come in tiers,
sized by how much OS you need:

1. **Agent sandbox** (smallest) — the OpenShell runtime for autonomous agents
   ([NVIDIA NemoClaw](https://github.com/NVIDIA/NemoClaw) +
   [OpenShell](https://github.com/NVIDIA/OpenShell)), governed by a declarative
   YAML policy. OpenShell normally needs a host plus Docker/Podman/MicroVM; here
   it runs in the browser.
2. **App bottle** — one program inside a minified Linux.
3. **Mini OS** — a full minified Linux booted via [v86](https://github.com/copy/v86) (x86/WASM).

Everything is static and runs in the visitor's tab. The published page is the
real app; there is no server and nothing is simulated.

## Development loop

Run this loop for every change. Keep changes small and shippable.

1. **Pick one improvement** that moves toward the product goal above. Prefer
   making an existing tier more real/capable over adding surface area.
2. **Branch**: `git checkout -b cursor/<short-name>-1b48` off `main`.
3. **Implement** with the constraints below.
4. **Verify locally — all must pass:**
   ```bash
   npm run typecheck
   npm run lint
   npm run build                                   # server build
   STATIC_EXPORT=true PAGES_BASE_PATH=/clientside-containers npm run build
   ```
   Then confirm the static export emitted runtime assets:
   `out/v86/*`, `out/workers/*`, and that `/clientside-containers` is inlined.
5. **Manual smoke (browser):** `npm run dev`, then: create one container of each
   tier, open it (agent chat UI loads; API console `GET /health` and deny
   `evil.com`; with a key, an agent turn hits the provider or reports honest
   CORS; reload restores messages), edit settings, confirm persistence.
6. **Commit** in logical chunks with clear messages.
7. **Push** `git push -u origin <branch>` and **open/update a PR** to `main`.
8. **Review** the diff against the constraints; fix anything that regresses the
   loop (broken build, dead code, scope creep).
9. **Repeat.**

## Constraints (do not regress these)

- **Client-side only.** No server, no backend, no API routes the UI depends on.
  GitHub Pages must behave identically to self-hosting.
- **No simulation.** Tiers must actually execute (Web Worker, v86/WASM).
- **The app is the grid.** No marketing/landing page, no side-menu of sections.
  Root `/` is the dashboard.
- **Assets are same-origin.** Bundle runtimes under `public/` — no CDN/CORS
  dependency for booting a container.
- **No reassurance copy in the UI.** Do not add subtitles about where data runs,
  privacy, "local", "never leaves the device", etc. Document behavior in product
  docs instead.
- **Keep it green.** typecheck + lint + both builds must pass before pushing.

## Map

```
app/page.tsx                  → <Dashboard/>
components/Dashboard.tsx       grid + new/open/settings
components/ContainerCard.tsx   grid cell (click=open, gear=settings)
components/ContainerStage.tsx  full-screen container interface
components/SettingsModal.tsx   per-container settings
components/NewContainerMenu.tsx tier picker
components/runtime/
  EmulatorScreen.tsx           v86 (app + mini-OS)
  AgentConsole.tsx             agent tier: chat + policy + API console
lib/
  container.ts                 model, tiers, bottled apps
  agent-session.ts             persisted agent messages / console / FS
  containers-db.ts             IndexedDB persistence
  policy.ts                    OpenShell policy: parse/serialize/evaluate
  v86-runtime.ts               load + boot the guest
public/v86/                    engine, BIOS, Linux bzImage
public/workers/                agent worker (headless-worker.js)
```

## Good next steps

- More bottled apps; boot straight into a chosen app.
- Persist/restore v86 state (save_state) so a mini-OS resumes where it left off.
- Larger images behind a tier (desktop/Xorg) with the same grid UX.
- Networking for v86 (virtio + a relay) as an explicit, off-by-default setting.
