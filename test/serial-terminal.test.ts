import { describe, expect, it } from "vitest";

import { createSerialTerminal, feedSerialByte } from "@/lib/serial-terminal";

function feedString(term: ReturnType<typeof createSerialTerminal>, s: string): void {
  for (let i = 0; i < s.length; i++) feedSerialByte(term, s.charCodeAt(i));
}

describe("feedSerialByte", () => {
  it("prints plain printable characters", () => {
    const term = createSerialTerminal();
    feedString(term, "hello");
    expect(term.text).toBe("hello");
  });

  it("backspace/DEL removes the last character", () => {
    const term = createSerialTerminal();
    feedString(term, "ab");
    feedSerialByte(term, 0x08);
    expect(term.text).toBe("a");
    feedSerialByte(term, 0x7f);
    expect(term.text).toBe("");
  });

  it("consumes a full clear-screen CSI sequence (\\x1b[2J) and leaves no residue", () => {
    const term = createSerialTerminal();
    feedString(term, "some boot output");
    feedString(term, "\x1b[2J");
    expect(term.text).toBe("");
  });

  it("does not leak the CSI parameter/final bytes as literal text", () => {
    const term = createSerialTerminal();
    feedString(term, "prompt$ ");
    feedString(term, "\x1b[2J");
    feedString(term, "next");
    expect(term.text).toBe("next");
  });

  it("consumes an erase-to-end-of-line CSI sequence (\\x1b[K)", () => {
    const term = createSerialTerminal();
    feedString(term, "line one\nline two");
    feedString(term, "\x1b[K");
    expect(term.text).toBe("line one\nline tw");
  });

  it("consumes a CSI sequence with an intermediate byte before the final byte", () => {
    // e.g. \x1b[?25h (show cursor) — a real-world sequence with no J/K handler,
    // it must still be fully swallowed, not partially printed.
    const term = createSerialTerminal();
    feedString(term, "\x1b[?25h");
    feedString(term, "x");
    expect(term.text).toBe("x");
  });
});
