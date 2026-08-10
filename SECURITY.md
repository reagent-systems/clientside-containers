# Security policy

## Supported versions

The published page always runs the current `main`. Only `main` gets fixes.
Older commits and older deployments are not supported.

| Version | Supported |
| --- | --- |
| `main` (the published page) | Yes |
| Any earlier commit or fork | No |

## Report a fault

**Do not open a public issue for a security fault.**

Report it in private through GitHub Security Advisories:

<https://github.com/reagent-systems/clientside-containers/security/advisories/new>

If that page is not available to you, send an email to
<thyfriendlyfox@gmail.com> with `SECURITY` in the subject line.

Please include:

1. What the fault is, and what an attacker gains from it.
2. The exact steps to repeat it.
3. The browser and the version you used.
4. Any proof-of-concept code you have.

You can expect a first reply within 7 days. You can expect a decision on the
report within 30 days. We will tell you when the fix ships, and we will credit
you in the advisory unless you ask us not to.

## What counts as a security fault here

The whole app runs in the visitor's browser tab. There is no server to attack
and no account to take over. The interesting faults are these:

| In scope | Why it matters |
| --- | --- |
| **Policy bypass in the agent sandbox** | The OpenShell-style policy in `lib/policy.ts` decides which hosts an agent may reach. A request that escapes a `deny` verdict is a real fault. |
| **Guest escape from v86** | Code inside a Mini OS or App container must not reach the host page, its origin, or its storage. |
| **Cross-site scripting** | Container names, policy text, and config commands are attacker-influenced. Any of them that executes as script is a fault. |
| **Leaks across containers** | One container must not read another container's IndexedDB records or its secrets. |
| **Supply chain** | A malicious dependency, or a runtime asset under `public/` that does not match its upstream source. |
| **Workflow escalation** | A change that lets an unreviewed pull request reach `main`, or that exposes a repository secret. |

| Out of scope | Why |
| --- | --- |
| A guest OS is old and has known faults | Windows 1.01 and Ubuntu 10.04 are museum pieces on purpose. They run inside the emulator sandbox. |
| A request fails because of CORS | The browser enforces CORS. The app reports it honestly and does not work around it. |
| A denial of service against the visitor's own tab | The visitor controls their own tab. Booting a large image is meant to use memory. |
| A report from an automated scanner with no working proof | Send a proof of concept. |
| The Agent Console's `/eval` sample runs its expression via `Function` | This is the sample's whole point — the same visitor's tab evaluating text it sent to itself, in a context DevTools already gives it equivalent reach into. `/eval` cannot reach the network outside the `/egress` policy (`lib/eval-sandbox.ts`); that was a real, in-scope fault and is fixed. Static scanners flag the `Function` call itself as code injection; there is no cross-visitor or cross-origin path here for it to describe. |

## How the automation is contained

An autonomous agent opens pull requests against this repository every day. These
limits keep that from becoming an attack path:

- CI runs with read-only permissions.
- The merge workflow runs from the default branch, so a pull request cannot
  change the rules that judge it.
- A pull request merges automatically only when it carries the `automated`
  label, comes from this repository, passes CI, and still points at the exact
  commit CI verified.
- No workflow that handles untrusted input holds a secret.
- Dependabot and CodeQL run on a schedule, and the loop reads their findings.

Read [docs/autonomous-loop.md](./docs/autonomous-loop.md) for the full design.
