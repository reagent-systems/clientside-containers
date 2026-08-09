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
2. **Branch**: `git checkout -b loop/<yyyy-mm-dd>-<short-name>` off `main`.
3. **Implement** with the constraints below.
4. **Write a test** for any pure logic you touch. Tests live in `test/` and run
   on Vitest. A test must fail before your change and pass after it.
5. **Verify locally — all must pass:**
   ```bash
   npm run typecheck
   npm run lint
   npm test
   npm run build                                   # server build
   STATIC_EXPORT=true PAGES_BASE_PATH=/clientside-containers npm run build
   bash scripts/check-static-export.sh /clientside-containers
   ```
   The last command fails when the export loses `out/v86/*`, `out/workers/*`,
   or the inlined `/clientside-containers` base path.
6. **Manual smoke (browser):** `npm run dev`, then: create one container of each
   tier, open it (agent answers `GET /health` and denies `egress evil.com`;
   mini-OS boots to a shell), edit settings, reload and confirm persistence.
7. **Commit** in logical chunks, using Conventional Commits
   (`feat(minios): ...`). See [CONTRIBUTING.md](./CONTRIBUTING.md).
8. **Push** `git push -u origin <branch>` and **open/update a PR** to `main`.
   CI repeats every check in step 5.
9. **Review** the diff against the constraints; fix anything that regresses the
   loop (broken build, dead code, scope creep).
10. **Repeat.**

## The daily loop runs this automatically

A scheduled session runs this loop once a day, on its own. It spends up to two
hours choosing the single highest-value change, hands that change to a build
agent, and merges the result into `main` when CI is green.

[**docs/autonomous-loop.md**](./docs/autonomous-loop.md) is the specification:
how a change is chosen and scored, what the build agent may and may not do, and
what must hold before a pull request merges by itself. Read it before you change
anything under `.github/workflows/`.

Two rules matter to any agent working here:

- A pull request merges without a human only when it carries the `automated`
  label **and** CI passes. Nothing else merges by itself.
- Never weaken a gate to make it pass. Do not delete a test, skip a test, or
  loosen a type to silence an error. Fixing a wrong gate is separate work, and
  it needs its own pull request.

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
- **Keep it green.** typecheck + lint + tests + both builds must pass before
  pushing. CI enforces this, and a red CI blocks the automatic merge.

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
test/                          Vitest unit tests for the lib/ logic
scripts/check-static-export.sh guards the export's runtime assets + base path
docs/autonomous-loop.md        specification for the daily self-improvement loop
docs/loop-log.md               one row per cycle of that loop
.github/workflows/ci.yml       the gate: typecheck, lint, test, both builds
.github/workflows/auto-merge.yml merges an `automated` PR once CI is green
```

## Good next steps

- Real egress: have the agent worker perform allowed `fetch`es and surface CORS
  honestly; deny the rest by policy.
- More bottled apps; boot straight into a chosen app.
- Persist/restore v86 state (save_state) so a mini-OS resumes where it left off.
- Larger images behind a tier (desktop/Xorg) with the same grid UX.
- Networking for v86 (virtio + a relay) as an explicit, off-by-default setting.
