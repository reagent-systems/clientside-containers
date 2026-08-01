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
| 1 | 2026-08-01 | shipped | An agent container's allowed egress calls now really reach the network and report the real result, instead of only returning a policy verdict. | — | 17/20 | Cycle 0's CI/auto-merge/label infrastructure has not reached `main` yet, so this cycle could not open a self-merging pull request; the change was pushed straight to the branch that carries the loop spec. Runners-up filed as issues [#14](https://github.com/reagent-systems/clientside-containers/issues/14) (close the `/eval` fetch bypass, 13/20) and [#15](https://github.com/reagent-systems/clientside-containers/issues/15) (preview an agent preset's policy before creating it, 12/20). |

---

## Rejected ideas

An idea rejected twice must not be raised again. Record it here with the reason.

| Idea | Cycles rejected | Reason |
| --- | --- | --- |
| — | — | — |
