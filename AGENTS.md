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
   tier, open it (agent `GET /health`, `POST /egress` to github returns a real
   fetch body or honest `cors_or_network`, deny `evil.com`; mini-OS boots to a
   shell), edit settings, reload and confirm persistence.
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
  AgentConsole.tsx             agent tier: policy editor + API console
lib/
  container.ts                 model, tiers, bottled apps
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

## Cursor Cloud specific instructions

- Dependencies are refreshed automatically on startup via the environment update
  script (`npm install`). No manual install step is needed at the start of a run.
- Run the dev server with `npm run dev` (serves on http://localhost:3000). All
  standard commands (`typecheck`, `lint`, `build`, static export) are in the
  **Development loop** section above — use those, don't reinvent them.
- There is **no automated test suite**; quality gates are `npm run typecheck`,
  `npm run lint`, `npm run build`, `STATIC_EXPORT=true PAGES_BASE_PATH=/clientside-containers npm run build`,
  plus the browser smoke test in the loop above.
- `npm run fetch-v86-images` is an optional, heavy (~694 MB) download used only
  by the Ubuntu 10.04 mini-OS preset; skip it for normal dev/build. The
  Buildroot and Windows 1.01 images are already bundled under `public/v86/`, so
  the Mini OS tier boots to a shell without any fetch step.
- End-to-end verification requires a browser (WebAssembly + Web Workers +
  IndexedDB); the container tiers actually execute client-side, so use the GUI
  smoke test rather than trying to exercise tiers headlessly.
- The Agent sandbox has two runtimes (toggle at the top of the agent console):
  the **built-in** ReAct agent loop (Web Worker, `public/workers/agent-engine.js`,
  unit-tested by `npm test`) and the **OpenShell runtime**
  (`components/runtime/OpenShellRuntime.tsx`), which is pluggable — it runs an
  agent on whatever in-browser runtime fits.
- OpenShell backends: **Node · WebContainer** (real Node.js+npm; runs Node
  agents like OpenClaw) and **Linux · v86** (a real x86 Linux/WASM with a BusyBox
  shell, bundled + same-origin, no Node, no server — reuses `EmulatorScreen`,
  bumped to 256 MiB).
- **Cross-origin isolation is scoped, on purpose.** WebContainer needs COI
  (SharedArrayBuffer), but the v86 tiers HALT under cross-origin isolation, and
  isolation is all-or-nothing per page. So `next.config.mjs` sets COOP/COEP
  (`credentialless`) ONLY on the `/openshell` route. The dashboard + v86 stay
  non-isolated; the Node backend runs on the isolated `/openshell` page, which
  the agent console opens in a new tab. Do NOT re-enable global COI — it breaks
  v86. (These headers are a no-op in static export; GitHub Pages would need a COI
  service worker scoped to /openshell.)
- Non-obvious WebContainer caveats: `npm prefix -g` returns empty (use
  `npm config get prefix`); `npm install -g` often doesn't link a global bin, so
  agents launch via an `npx -y <pkg>` fallback; `jsh` lacks `if/fi` (use `||`).
  Node/npm agents (OpenClaw) run in-browser; agents whose installer needs
  Python/uv or Docker (Hermes, NemoClaw) can't run in the Node backend, and the
  offline v86 backend has no package manager/network — so those remain out of
  reach in-browser today.
