import { describe, expect, it } from "vitest";

import { SANDBOXED_GLOBALS, sandboxedEval } from "@/lib/eval-sandbox";

describe("sandboxedEval", () => {
  it("evaluates a plain expression", () => {
    expect(sandboxedEval("2 + 40")).toBe(42);
  });

  it("evaluates a string expression", () => {
    expect(sandboxedEval('"hi".toUpperCase()')).toBe("HI");
  });

  it.each(SANDBOXED_GLOBALS)("shadows %s as unreachable", (name) => {
    expect(sandboxedEval(`typeof ${name}`)).toBe("undefined");
  });

  it("throws instead of letting the expression call fetch", () => {
    expect(() => sandboxedEval("fetch('https://evil.example')")).toThrow();
  });

  it("throws instead of letting the expression reach the worker's postMessage", () => {
    expect(() => sandboxedEval("postMessage('leak')")).toThrow();
  });

  it("still surfaces a syntax error from a malformed expression", () => {
    expect(() => sandboxedEval("2 + ")).toThrow();
  });
});
