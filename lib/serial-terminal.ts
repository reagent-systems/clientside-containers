import type { KeyboardEvent } from "react";

// Minimal serial terminal: turn a byte stream into displayable text.
// Handles backspace/DEL and strips ANSI CSI sequences (so backspace doesn't
// leave literal "[J" on screen from \x1b[J).

export interface SerialTerminal {
  text: string;
  pendingEsc: string;
}

export function createSerialTerminal(): SerialTerminal {
  return { text: "", pendingEsc: "" };
}

function deleteLastChar(term: SerialTerminal): void {
  if (term.text.length === 0) return;
  term.text = term.text.slice(0, -1);
}

/** Feed one byte from the guest serial port; updates term.text in place. */
export function feedSerialByte(term: SerialTerminal, byte: number): void {
  if (term.pendingEsc) {
    term.pendingEsc += String.fromCharCode(byte);
    if (term.pendingEsc.startsWith("\x1b[")) {
      // The introducer "\x1b[" is two bytes long; only a byte *after* it can
      // be the sequence's final byte, even though "[" (0x5B) itself falls in
      // the @-~ range a final byte is matched against.
      if (term.pendingEsc.length > 2) {
        const final = term.pendingEsc.slice(-1);
        if (final >= "@" && final <= "~") {
          applyCsi(term, term.pendingEsc);
          term.pendingEsc = "";
        } else if (term.pendingEsc.length > 32) {
          term.pendingEsc = "";
        }
      }
    } else if (term.pendingEsc.length > 8) {
      term.pendingEsc = "";
    }
    return;
  }

  if (byte === 0x1b) {
    term.pendingEsc = "\x1b";
    return;
  }

  if (byte === 0x08 || byte === 0x7f) {
    deleteLastChar(term);
    return;
  }

  if (byte === 0x0d) return;

  if (byte === 0x0a) {
    term.text += "\n";
    return;
  }

  if (byte === 0x09) {
    term.text += "\t";
    return;
  }

  if (byte >= 0x20 && byte <= 0x7e) {
    term.text += String.fromCharCode(byte);
    return;
  }
}

function applyCsi(term: SerialTerminal, seq: string): void {
  const body = seq.slice(2, -1);
  const cmd = seq.slice(-1);
  if (cmd === "J") {
    if (body === "2" || body === "") {
      term.text = "";
    } else if (body === "1") {
      const nl = term.text.lastIndexOf("\n");
      term.text = nl >= 0 ? term.text.slice(0, nl + 1) : "";
    }
    return;
  }
  if (cmd === "K") {
    const nl = term.text.lastIndexOf("\n");
    const head = nl >= 0 ? term.text.slice(0, nl + 1) : "";
    const line = nl >= 0 ? term.text.slice(nl + 1) : term.text;
    const keep = Math.max(0, line.length - 1);
    term.text = head + line.slice(0, keep);
    return;
  }
}

/** Map a keyboard event to bytes to send to the guest serial port. */
export function keyToSerialBytes(e: KeyboardEvent): string | null {
  if (e.key === "Enter") return "\r";
  if (e.key === "Backspace") return "\x08";
  if (e.key === "Tab") return "\t";
  if (e.key === "Escape") return "\x1b";
  if (e.ctrlKey && e.key.length === 1) {
    const code = e.key.toUpperCase().charCodeAt(0) - 64;
    if (code > 0 && code < 27) return String.fromCharCode(code);
    return null;
  }
  if (e.key.length === 1) return e.key;
  return null;
}
