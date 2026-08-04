---
iteration: 2
max_iterations: 8
completion_promise: "COMPLETE"
---

Fix the agent sandbox so it is persistent and actually runnable.

Acceptance criteria (all must be true before <promise>COMPLETE</promise>):

1. Persistence — Opening an agent container, chatting / using the runtime, closing it, reloading the page, and reopening restores the conversation and session (IndexedDB). Policy, provider settings, and API key survive reload.
2. Runnable agent — The Agent sandbox has a chat UI. Sending a message runs a real policy-gated agent turn in the Web Worker (model call via allowlisted egress + tools: http_request, eval_js, fs_*). No faked model replies. CORS/network failures are reported honestly.
3. Honest egress remains — Allowed fetches are real; denied hosts return 403 without calling the network.
4. Green builds — `npm run typecheck`, `npm run lint`, `npm run build`, and `STATIC_EXPORT=true PAGES_BASE_PATH=/clientside-containers npm run build` all pass; `out/v86/*` and `out/workers/*` exist.
5. Constraints — Client-side only, no simulation, grid is the app, same-origin assets, no privacy reassurance UI copy.
6. Docs — ROADMAP/AGENTS/README reflect that the agent tier is a persistent, runnable sandbox.

Work from `.ralph/prd.json` one story at a time. Log learnings in `.ralph/progress.md`. Commit and push after each shippable story. Keep changes focused.
