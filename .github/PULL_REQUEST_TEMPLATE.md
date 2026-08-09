<!--
Write in short, plain sentences. One idea per sentence. Use the active voice.
-->

## What this changes

<!-- One or two sentences. Say what the change does, not how you made it. -->

## Why

<!-- The problem this solves, or the capability it adds. Link the issue if one exists. -->

Closes #

## How it works

<!-- The approach, and any decision a reviewer would question. -->

## Verification

All of these must pass before the pull request can merge:

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `STATIC_EXPORT=true PAGES_BASE_PATH=/clientside-containers npm run build`

Manual check in the browser (`npm run dev`):

- [ ] A container of each affected tier can be created and opened.
- [ ] The agent tier answers `GET /health` and denies `egress evil.com`.
- [ ] A Mini OS container boots to a shell.
- [ ] Settings save, and containers survive a page reload.

## Constraint check

The repository has hard constraints. Confirm this change keeps them:

- [ ] Client-side only. No server, and no API route the interface depends on.
- [ ] No simulation. Every tier really executes.
- [ ] Root `/` stays the dashboard grid. No landing page, and no side menu.
- [ ] Runtime assets stay same-origin under `public/`.
- [ ] No reassurance copy in the interface about privacy or local execution.

## Risk

<!-- What could break, and how a reader would notice. Write "None known" if that is true. -->
