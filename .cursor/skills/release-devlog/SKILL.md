---
name: release-devlog
description: "Ship a release devlog with architecture drawings, walkthrough videos, version bump, and changelog. Use after a feature merges to main, or when the user asks for a release post, devlog, or release pipeline docs."
environments: [cloud, local]
---

# Release devlog pipeline

Ship a **docs-only release** that explains what merged: a devlog post,
GenerateImage architecture drawings, walkthrough screenshots/videos, and a
patch version bump.

Follow this skill **after** the feature code is already on `main` and CI is
green. Split feature work and release docs into separate pull requests when
possible (example: feature in v0.2.0, devlog in v0.2.1).

## When to use

Use this skill when:

- A notable feature just merged and needs a public devlog.
- The user asks for release notes, drawings, or demo videos for a ship.
- You are closing a release loop and the code PR is already merged.

Do **not** use this skill for tiny fixes with no user-visible story. A
`CHANGELOG.md` entry under `[Unreleased]` is enough for those.

## Prerequisites

1. The feature is on `main` (or you are documenting what will merge imminently
   — prefer waiting until merge).
2. You understand the technical path you will explain (read the diff and the
   code map).
3. All quality gates still pass:
   ```bash
   npm run typecheck
   npm run lint
   npm test
   npm run build
   STATIC_EXPORT=true PAGES_BASE_PATH=/clientside-containers npm run build
   bash scripts/check-static-export.sh /clientside-containers
   ```

## Branch and version

1. Branch off `main`: `cursor/<topic>-devlog-62fa` or `loop/<yyyy-mm-dd>-devlog-<topic>`.
2. Bump **patch** in `package.json` for docs-only releases (devlog + images +
   changelog). Use minor/major only when the same PR also ships code.
3. Move `[Unreleased]` items in `CHANGELOG.md` into a new `## [X.Y.Z] - YYYY-MM-DD`
   section. Match [Keep a Changelog](https://keepachangelog.com/) style already
   used in the repo.

## Step 1 — Plan the story

Before writing, decide:

| Item | Target |
| --- | --- |
| **One-line thesis** | What changed in plain language |
| **Before / after** | What was fake, missing, or broken vs what is real now |
| **Architecture** | 3–6 boxes and arrows for the data/runtime path |
| **Boot or flow sequence** | Numbered steps a user or agent triggers |
| **Honest limits** | Network, CORS, pins, first-run slowness, etc. |
| **Code map** | Table of 4–8 files and their jobs |
| **Demo moments** | 1–2 browser scenes worth recording |

Use the existing post as the template:
`docs/devlog/2026-08-27-webcontainer-clis.md`.

## Step 2 — Generate architecture drawings

Use Cursor's built-in **`GenerateImage`** tool (`cursor` namespace).

1. Call `GetDynamicTools` for `cursor` / `GenerateImage` and read the schema.
2. Invoke via `CallDynamicTool` with explicit image requests (the tool only runs
   when images are explicitly requested — this skill counts as that request).

### House style (every diagram)

Match **`public/og.png`** — the product social card. Pass it as
`reference_image_paths: ["/workspace/public/og.png"]` (or the repo-relative
path when not on Cloud) on every `GenerateImage` call.

| Token | Value |
| --- | --- |
| Background | Near-black `#0a0a0a` with a faint isometric grid |
| Accent | Neon electric blue `#0070f3` / `#3291ff` with soft glow |
| Primary text | White `#ededed` |
| Secondary text | Muted gray `#a1a1a1` |
| Motif | Isometric wireframe cubes; `>_` on the top face; padlock on a side face |
| Active vs quiet | Active steps: blue stroke + glow. Quiet steps: thin dark-gray wireframe |
| Typography | Geometric sans-serif (Geist / Inter-like) |
| Aspect ratio | `16:9` (closest GenerateImage ratio to the OG’s 1536×1024) |

- **Layout:** isometric cubes + thin neon-blue arrows; short labels under each stage
- **Title:** one clear white title at the top
- **Forbidden:** white/cream backgrounds; teal/cyan/lime accent palettes;
  colorful flat icon cards; privacy / "local" / "never leaves your device"
  reassurance copy; fake UI chrome; watermarks; photorealistic clutter

Also see `design.md` / `app/globals.css` for the same dark token set.

### Standard set (pick 2–4)

| Filename | Purpose |
| --- | --- |
| `devlog-<topic>-overview.png` | End-to-end architecture (cubes + arrows) |
| `devlog-<topic>-sequence.png` | Numbered boot or request flow |
| `devlog-<topic>-before-after.png` | Side-by-side: dim gray cubes vs glowing blue cubes |
| `devlog-<topic>-detail.png` | Optional zoom on one tricky subsystem |

### Prompt skeleton

```
Generate a 16:9 technical diagram for clientside-containers.
Match the attached brand OG image exactly in visual language.

BRAND: near-black #0a0a0a background, subtle isometric grid,
neon electric blue #0070f3 glow accents, white #ededed titles,
gray #a1a1a1 captions, geometric sans-serif.
Motif: isometric wireframe cubes with >_ prompts and padlocks.
Active = blue glow; quiet = dark-gray wireframe.
No teal/lime/white background. No privacy marketing.

Title: "<Title>"

Show:
1. <stage A> → <stage B> → …
2. <short captions>

Pass reference_image_paths: public/og.png
```

### Save into the repo

1. Generated files land under the agent artifacts directory.
2. Copy PNGs into `docs/images/devlog/` with the filenames above.
3. Reference them from the devlog with relative paths, e.g.
   `../images/devlog/devlog-<topic>-overview.png`.
4. Commit images to git (they are part of the release).

## Step 3 — Walkthrough videos and screenshots

Read and follow **`walkthrough-artifacts`** for proof-of-work media.

Minimum for a tier-visible feature:

1. `npm run dev` and open the app in the browser (`computerUse` subagent).
2. One **screen recording** showing the headline behavior end-to-end.
3. One **screenshot** of the success state (welcome banner, shell prompt, etc.).

Workflow:

1. `RecordScreen` → `START_RECORDING`
2. `computerUse` performs the demo (create container, enter key if needed, show real output)
3. `RecordScreen` → `SAVE_RECORDING` with a descriptive snake_case name
4. `videoReview` subagent on each video before you cite it
5. Copy the best screenshot(s) to `docs/images/devlog/` as `.webp` or `.png`
6. Link screenshots in the devlog; attach videos to the PR body or GitHub
   Release (videos are often too large for git — do not commit multi‑MB mp4
   unless the repo already does)

## Step 4 — Write the devlog

Create `docs/devlog/YYYY-MM-DD-<short-topic>.md`.

### Voice

Simplified technical English (same as `CONTRIBUTING.md`):

- Short sentences. One idea per sentence.
- Active voice.
- No hype. State what is real and what is not.

### Required sections

Use these headings (adapt names only when the story demands it):

1. **Title** — `# Devlog: <human title> (vX.Y.Z)`
2. **Metadata** — date, release link, version this post ships with
3. **What changed** — before/after; include before-after diagram if you made one
4. **The big picture** — architecture overview diagram
5. **Boot sequence** (or **Flow**) — numbered steps + sequence diagram
6. **What you should see** — literal terminal/UI snippets + screenshots
7. **Code map** — markdown table of files
8. **Limits (honest)** — bullets only; no reassurance copy
9. **Try it** — three-line quickstart
10. **Release notes pointer** — link to `CHANGELOG.md` section

Add the row to `docs/devlog/README.md`.

## Step 5 — Update release metadata

| File | Action |
| --- | --- |
| `package.json` | Bump `"version"` |
| `CHANGELOG.md` | New version section; devlog called out under `### Added` |
| `docs/devlog/README.md` | New table row |
| `docs/loop-log.md` | Optional one-line note if an autonomous cycle shipped this |
| `README.md` | Only if the user-facing summary needs a single new bullet |

Do not add reassurance subtitles to the app UI. This skill is docs-only.

## Step 6 — Verify and open PR

1. Re-run the five quality gates (see Prerequisites).
2. Preview markdown links: images resolve under `docs/images/devlog/`.
3. Commit in logical chunks:
   - `docs(devlog): add <topic> post and diagrams`
   - `chore(release): bump to vX.Y.Z`
4. Push and open a PR to `main`.
5. PR body must include:
   - Link to the devlog file
   - Thumbnails or embedded images of the GenerateImage diagrams
   - Walkthrough video(s) as artifact references or release attachments
   - Version bumped and changelog excerpt

After merge, tag `vX.Y.Z` on `main` when maintainers cut a GitHub Release.

## Quick checklist

- [ ] Feature already on `main` (or explicitly scoped as combined release)
- [ ] 2–4 GenerateImage diagrams committed under `docs/images/devlog/`
- [ ] Walkthrough video recorded and reviewed
- [ ] At least one screenshot in the devlog
- [ ] `docs/devlog/YYYY-MM-DD-*.md` written in simplified English
- [ ] `docs/devlog/README.md` updated
- [ ] `CHANGELOG.md` + `package.json` version bump
- [ ] CI green
- [ ] PR demonstrates diagrams and demo media

## Reference release

The WebContainer CLI devlog (v0.2.1) is the canonical example:

- Post: `docs/devlog/2026-08-27-webcontainer-clis.md`
- Images: `docs/images/devlog/devlog-*.png`, `claude-code-welcome.webp`
- Feature release: v0.2.0 — docs release: v0.2.1
