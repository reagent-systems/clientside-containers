import { describe, expect, it } from "vitest";

import { OS_IMAGES, getOsImage, isGraphicalOsImage } from "@/lib/os-images";

describe("getOsImage", () => {
  it("returns the image with that id", () => {
    expect(getOsImage("windows101").id).toBe("windows101");
  });

  it("falls back to the first image for an unknown id", () => {
    expect(getOsImage("does-not-exist").id).toBe(OS_IMAGES[0].id);
  });

  it("falls back to the first image when the id is missing", () => {
    expect(getOsImage(undefined).id).toBe(OS_IMAGES[0].id);
  });
});

describe("OS_IMAGES", () => {
  it("gives every image a unique id", () => {
    const ids = OS_IMAGES.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every image exactly one boot medium", () => {
    for (const image of OS_IMAGES) {
      const media = [image.bzimage, image.fda, image.cdrom, image.hda].filter(Boolean);
      expect(media, `${image.id} must declare one boot medium`).toHaveLength(1);
    }
  });

  it("keeps every media path under public/v86/", () => {
    for (const image of OS_IMAGES) {
      const media = [image.bzimage, image.fda, image.cdrom, image.hda].filter(Boolean);
      for (const medium of media) {
        expect(medium!.path.startsWith("/")).toBe(false);
        expect(medium!.path).toMatch(/^images\//);
      }
    }
  });

  it("gives every image usable memory sizes", () => {
    for (const image of OS_IMAGES) {
      expect(image.memoryMb).toBeGreaterThanOrEqual(32);
      expect(image.vgaMemoryMb).toBeGreaterThanOrEqual(8);
    }
  });
});

describe("isGraphicalOsImage", () => {
  it("is true for a windows guest", () => {
    expect(isGraphicalOsImage(getOsImage("windows101"))).toBe(true);
  });

  it("is true for a desktop guest", () => {
    expect(isGraphicalOsImage(getOsImage("ubuntu1004"))).toBe(true);
  });

  it("is false for a serial linux guest", () => {
    expect(isGraphicalOsImage(getOsImage("buildroot"))).toBe(false);
  });
});
