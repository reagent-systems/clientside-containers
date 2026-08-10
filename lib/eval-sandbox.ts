// The Agent Console's /eval route runs an arbitrary expression for demo
// purposes. Left alone, that expression runs in the same global scope as
// `fetch` and the worker's own messaging surface — meaning it could reach
// the network directly, routing around the policy `/egress` enforces
// (see evaluateEgress in policy.ts). Shadowing these names as parameters
// bound to `undefined` makes them unreachable from inside the expression,
// regardless of what actually exists in the calling scope.
export const SANDBOXED_GLOBALS = [
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "importScripts",
  "self",
  "postMessage",
  "indexedDB",
  "caches",
  "Worker",
] as const;

/** Evaluate `expr` with the sandboxed globals unreachable inside it. */
export function sandboxedEval(expr: string): unknown {
  const fn = new Function(...SANDBOXED_GLOBALS, `"use strict"; return (${expr});`) as (
    ...args: unknown[]
  ) => unknown;
  return fn(...SANDBOXED_GLOBALS.map(() => undefined));
}
