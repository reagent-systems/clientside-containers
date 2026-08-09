import { describe, expect, it } from "vitest";

import { CONFIGS, getConfig } from "@/lib/configs";
import { OS_IMAGES } from "@/lib/os-images";

describe("getConfig", () => {
  it("returns the config with that id", () => {
    expect(getConfig("openttd").id).toBe("openttd");
  });

  it("falls back to the first config for an unknown id", () => {
    expect(getConfig("does-not-exist").id).toBe(CONFIGS[0].id);
  });

  it("falls back to the first config when the id is missing", () => {
    expect(getConfig(undefined).id).toBe(CONFIGS[0].id);
  });
});

describe("CONFIGS", () => {
  it("gives every config a unique id", () => {
    const ids = CONFIGS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("points every config at an OS image that exists", () => {
    const imageIds = new Set(OS_IMAGES.map((i) => i.id));
    for (const config of CONFIGS) {
      expect(imageIds.has(config.image), `${config.id} names image ${config.image}`).toBe(true);
    }
  });

  it("keeps the interactive shell config free of preset commands", () => {
    expect(getConfig("shell").commands).toEqual([]);
  });

  it("gives every other config at least one command", () => {
    for (const config of CONFIGS.filter((c) => c.id !== "shell")) {
      expect(config.commands.length).toBeGreaterThan(0);
    }
  });

  it("keeps every command on a single line", () => {
    // Commands are typed into the guest serial console one at a time. A newline
    // inside a command would send two commands and break the sequence.
    for (const config of CONFIGS) {
      for (const command of config.commands) {
        expect(command).not.toContain("\n");
      }
    }
  });
});
