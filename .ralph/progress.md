# Ralph progress — agent sandbox persistent + runnable

## Learnings

- Main still had verdict-only egress; honest fetch shipped with the runnable agent (model calls need real `fetch`).
- Anthropic/OpenAI APIs usually block browser CORS — agent turn surfaces `cors_or_network` honestly and supports custom OpenAI-compatible `apiBaseUrl`.
- Do not fake assistant replies when the model call fails; return produced tool/assistant messages so far plus the error.
- Persist assistant `toolCalls` so multi-turn tool transcripts reload cleanly.
- Virtual FS hydrated via `fs-hydrate` on worker ready; snapshot returned from `/agent/turn`.
- Avoid privacy reassurance UI copy under headings.

## Iteration log

### Iteration 1
- Created Ralph scratchpad + PRD.
- Implemented US-001 through US-005 in one pass:
  - Honest egress + network modes
  - `agentSession` + inference settings on Container
  - `/agent/turn` tool loop + virtual FS
  - Chat UI + API console tabs
  - Presets with systemPrompt/provider/model
  - Docs updated

### Iteration 2
- Verify builds + browser smoke (persist + agent turn path).
