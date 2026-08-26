import { describe, expect, it } from "vitest";

import {
  countHermesTools,
  formatSkillLine,
  formatToolLine,
  HERMES_DEFAULT_MODEL,
  HERMES_SKILLSETS,
  HERMES_TOOLSETS,
  newHermesSessionId,
} from "@/lib/hermes";

describe("hermes catalog", () => {
  it("lists toolsets and skills for the splash panel", () => {
    expect(HERMES_TOOLSETS.length).toBeGreaterThan(0);
    expect(HERMES_SKILLSETS.length).toBeGreaterThan(0);
    expect(countHermesTools()).toBeGreaterThan(0);
    expect(formatToolLine(HERMES_TOOLSETS[0])).toContain(HERMES_TOOLSETS[0].name);
    expect(formatSkillLine(HERMES_SKILLSETS[0])).toContain(HERMES_SKILLSETS[0].name);
  });

  it("builds a session id shaped like the Hermes CLI", () => {
    const id = newHermesSessionId(new Date("2026-04-17T12:46:23.417Z"));
    expect(id).toMatch(/^\d{8}_\d{6}_\d{6}$/);
  });

  it("defaults the prompt model", () => {
    expect(HERMES_DEFAULT_MODEL).toContain("kimi");
  });
});
