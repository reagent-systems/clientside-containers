# Contributing to clientside-containers

Thank you for your interest. This repository takes changes from humans and from
autonomous agents, and it holds both to the same gates.

This document is written in simplified technical English: short sentences, one
idea per sentence, and the active voice. Write your issues, your commits, and
your pull requests the same way.

## The product goal

**The easiest and fastest way to try any AI system, any app, on any environment,
on any device — entirely in the browser.**

Judge every change against that sentence. A change that does not move toward it
is out of scope, even when the change is good work.

## Before you start

1. Read [AGENTS.md](./AGENTS.md). It holds the development loop and the map of
   the code.
2. Read [ROADMAP.md](./ROADMAP.md). It holds the planned horizons.
3. Search the open issues. Somebody may already do this work.
4. For a large change, open an issue first and agree on the approach. For a
   small fix, open a pull request directly.

## Set up your machine

You need Node.js 20 or later.

```bash
git clone https://github.com/reagent-systems/clientside-containers.git
cd clientside-containers
npm install
npm run dev
```

Open <http://localhost:3000>.

The large disk images are not in git. Fetch them only when you work on the
Ubuntu desktop image:

```bash
npm run fetch-v86-images
```

## Hard constraints

These constraints define the product. A change that breaks one of them is
rejected, however good the change is otherwise.

| Constraint | What it means |
| --- | --- |
| **Client-side only** | No server, no backend, and no API route the interface depends on. GitHub Pages must behave the same as self-hosting. |
| **No simulation** | Every tier must really execute — a Web Worker, or v86 on WebAssembly. Never fake a result. |
| **The app is the grid** | Root `/` is the dashboard. No landing page, and no side menu of sections. |
| **Assets are same-origin** | Bundle runtimes under `public/`. A container must never need a CDN to boot. |
| **No reassurance copy** | Do not add interface text about privacy, "local", or "never leaves the device". Put that in the docs. |
| **Keep it green** | Typecheck, lint, tests, and both builds must pass before you push. |

## Make a change

1. **Branch off `main`.** Name the branch for the work, for example
   `feat/save-v86-state` or `fix/agent-console-scroll`.
2. **Keep the change small.** One idea per pull request. A reviewer must be able
   to hold the whole change in mind.
3. **Write a test** for any pure logic you add or change. The tests live in
   `test/` and run on Vitest.
4. **Match the code around you.** Follow the comment density, the naming, and
   the idiom of the file you edit.

## Verify your change

Run all five commands. All five must pass.

```bash
npm run typecheck
npm run lint
npm test
npm run build
STATIC_EXPORT=true PAGES_BASE_PATH=/clientside-containers npm run build
```

Then check the static export really carries its runtime:

```bash
bash scripts/check-static-export.sh /clientside-containers
```

Then run the manual smoke test in the browser with `npm run dev`:

1. Create one container of each tier.
2. Open the agent container. It must answer `GET /health`. It must deny
   `egress evil.com`.
3. Open a Mini OS container. It must boot to a shell.
4. Change a setting, reload the page, and confirm the container survived.

## Commit messages

Use the [Conventional Commits](https://www.conventionalcommits.org/) form. The
changelog and the release notes are built from these messages.

```
<type>(<scope>): <subject>
```

| Type | Use it for |
| --- | --- |
| `feat` | A new capability. |
| `fix` | A fault repair. |
| `perf` | A speed or size improvement. |
| `refactor` | A change that keeps the behaviour. |
| `docs` | Documentation only. |
| `test` | Tests only. |
| `ci` | Workflows and automation. |
| `chore` | Everything else. |

Write the subject in the imperative mood and in lower case. Do not end it with a
full stop.

```
feat(minios): save and restore v86 state so a guest resumes after a reload
fix(agent): keep the console scrolled to the newest line
```

## Open a pull request

1. Push your branch: `git push -u origin <branch>`.
2. Open a pull request into `main`.
3. Fill in the pull request template. Do not delete its checklists.
4. Wait for CI. It runs the typecheck, the lint, the tests, and both builds.
5. Fix anything CI reports.

A maintainer reviews the pull request and merges it.

## How the automation treats your pull request

The repository runs an autonomous daily loop. See
[docs/autonomous-loop.md](./docs/autonomous-loop.md).

The loop merges its own pull requests without a human, but only pull requests
that carry the `automated` label **and** pass CI. A pull request from a person
never merges automatically. A pull request from a fork never merges
automatically. Only a maintainer can add the `automated` label.

## Report a security fault

Do not open a public issue. Follow [SECURITY.md](./SECURITY.md).

## Licence

This project uses GPL-3.0-only. When you contribute, you agree to release your
contribution under that licence.
