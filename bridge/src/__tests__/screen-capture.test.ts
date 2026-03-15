import { describe, it, expect } from "vitest";
import { packFrame, unpackFrame } from "../screen-capture.js";

describe("packFrame / unpackFrame", () => {
  it("round-trips a frame correctly", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0x00, 0x01, 0x02, 0xff, 0xd9]);
    const packed = packFrame("3e00004", jpeg, 42);
    expect(packed.length).toBe(20 + jpeg.length);
    expect(packed.subarray(0, 4).toString()).toBe("VLSF");
    const unpacked = unpackFrame(packed);
    expect(unpacked).not.toBeNull();
    expect(unpacked!.windowId).toBe("3e00004");
    expect(unpacked!.seq).toBe(42);
    expect(unpacked!.jpeg).toEqual(jpeg);
  });

  it("zero-pads short window IDs in header", () => {
    const packed = packFrame("abc", Buffer.from([0xff]), 1);
    const idBytes = packed.subarray(4, 16).toString("ascii");
    expect(idBytes).toBe("000000000abc");
  });

  it("returns null for too-short buffer", () => {
    expect(unpackFrame(Buffer.alloc(10))).toBeNull();
  });

  it("returns null for wrong magic", () => {
    const bad = Buffer.alloc(24);
    bad.write("NOPE", 0);
    expect(unpackFrame(bad)).toBeNull();
  });
});

describe("listWindows", () => {
  it("returns array of WindowInfo objects", async () => {
    const { listWindows } = await import("../screen-capture.js");
    const windows = listWindows();
    expect(Array.isArray(windows)).toBe(true);
    if (windows.length > 0) {
      const w = windows[0];
      expect(w).toHaveProperty("id");
      expect(w).toHaveProperty("title");
      expect(w).toHaveProperty("width");
      expect(w).toHaveProperty("height");
      expect(typeof w.id).toBe("string");
      expect(w.id).not.toContain("0x");
      expect(w.width).toBeGreaterThan(0);
    }
  });
});
