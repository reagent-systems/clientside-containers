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
| 2 | 2026-08-09 | shipped | A container's terminal (App bottle, Mini OS) no longer shows garbled leftover characters from an ANSI escape sequence — the parser now consumes the whole sequence instead of cutting it short after two bytes. | [#34](https://github.com/reagent-systems/clientside-containers/pull/34) | 17/20 | Found while surveying `lib/serial-terminal.ts` for test coverage, not from an open issue. Runners-up #14 (13/20) and #15 (12/20) are still open and still unbuilt; no new candidate this cycle scored ≥ 12, so no new issue was filed. This is the first cycle to actually exercise the self-merge gate end to end (`automated` label + green CI + `auto-merge.yml`). |

---

## Rejected ideas

An idea rejected twice must not be raised again. Record it here with the reason.

| Idea | Cycles rejected | Reason |
| --- | --- | --- |
| — | — | — |
