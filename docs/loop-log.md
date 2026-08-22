# Loop log

One row per cycle of the [autonomous daily loop](./autonomous-loop.md).

The loop appends a row at the end of every cycle, whether the cycle shipped, was
blocked, or was abandoned. The next cycle reads this file first, so that it never
repeats work and never raises an idea that was already rejected.

## How to read a row

| Field | Meaning |
| --- | --- |
| **Cycle** | The cycle number, counting from 1. |
| **Date** | The UTC date the cycle started. |
| **Outcome** | `shipped`, `blocked`, or `abandoned`. |
| **Change** | One sentence, in the user's words. |
| **PR** | The pull request number. |
| **Score** | Goal + Reach + Proof + Fit, out of 20. |
| **Follow-up** | What was left out, and the issues that were filed. |

---

## Cycles

| Cycle | Date | Outcome | Change | PR | Score | Follow-up |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | 2026-08-01 | shipped | Set up the loop itself: a test suite, CI gates, an auto-merge gate, and the open-source files the repository was missing. | — | — | The first scheduled cycle runs the loop from section 3.1 of the specification. |
| 1 | 2026-08-01 | shipped | An agent container's allowed egress calls now really reach the network and report the real result, instead of only returning a policy verdict. | [#16](https://github.com/reagent-systems/clientside-containers/pull/16) | 17/20 | Cycle 0's CI/auto-merge/label infrastructure had not reached `main` yet, so this cycle could not open a self-merging pull request; it was pushed straight to the branch carrying the loop spec, then merged by hand once CI passed. That merge put the infrastructure on `main`, so cycle 2 could self-merge for real. Runners-up filed as issues [#14](https://github.com/reagent-systems/clientside-containers/issues/14) (close the `/eval` fetch bypass, 13/20) and [#15](https://github.com/reagent-systems/clientside-containers/issues/15) (preview an agent preset's policy before creating it, 12/20). |
| 2 | 2026-08-09 | shipped | A container's terminal (App bottle, Mini OS) no longer shows garbled leftover characters from an ANSI escape sequence — the parser now consumes the whole sequence instead of cutting it short after two bytes. | [#34](https://github.com/reagent-systems/clientside-containers/pull/34) | 17/20 | Found while surveying `lib/serial-terminal.ts` for test coverage, not from an open issue. Runners-up #14 (13/20) and #15 (12/20) are still open and still unbuilt; no new candidate this cycle scored ≥ 12, so no new issue was filed. This is the first cycle to actually exercise the self-merge gate end to end (`automated` label + green CI + `auto-merge.yml`); it merged on its own. |
| 3 | 2026-08-09 | shipped | The Agent Console's `/eval` sample can no longer reach the network directly, closing the one way a request could bypass the egress policy. | [#36](https://github.com/reagent-systems/clientside-containers/pull/36) | 13/20 | Built issue [#14](https://github.com/reagent-systems/clientside-containers/issues/14) from cycle 1's brainstorm — still the highest-scoring open candidate; no fresh candidate this cycle beat it. Issue [#15](https://github.com/reagent-systems/clientside-containers/issues/15) (12/20, preview an agent preset's policy before creating it) remains open and unbuilt. |
| — | 2026-08-10 | shipped | Reactive triage, not a scored cycle: documented the CodeQL "critical" code-injection alert that PR #36 surfaced on `/eval`'s `Function` call — real per the scanner, already covered by `SECURITY.md`'s stated threat model, no behavior changed. | [#37](https://github.com/reagent-systems/clientside-containers/pull/37) | — | The attempted inline `lgtm[js/code-injection]` suppression did not clear the alert — CodeQL still reported it as new on both commits in the PR. The alert remains open on the Security tab; closing it needs a repo admin to dismiss it by hand, or a rewrite of `/eval` to not use `Function` at all (declined for now — no in-scope fault remains, per `SECURITY.md`). Per §7's reading of automated-tool signals, not the survey→ideate→score flow. |
| 4 | 2026-08-10 | shipped | The New Container dialog shows an agent preset's network policy — every host and method it will allow — before you create the container. | — | 12/20 | Built issue [#15](https://github.com/reagent-systems/clientside-containers/issues/15) from cycle 1's brainstorm, the last remaining open runner-up. No fresh candidate this cycle beat it; the loop-log/issue backlog is now clear of unbuilt candidates ≥ 12. |

---

## Rejected ideas

An idea rejected twice must not be raised again. Record it here with the reason.

| Idea | Cycles rejected | Reason |
| --- | --- | --- |
| — | — | — |
