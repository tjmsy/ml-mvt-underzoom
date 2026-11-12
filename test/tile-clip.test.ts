import { describe, expect, it } from "vitest";
import {
  childClipBounds,
  clipRingToBounds,
  clipSegmentToBounds,
  closeRing,
  normalizeRing,
} from "../src/tile-clip.js";

describe("childClipBounds", () => {
  it("extends buffer only on parent exterior edges (2x2 merge)", () => {
    expect(childClipBounds(0, 0, 2, 4096, 64)).toEqual({
      minX: -64,
      minY: -64,
      maxX: 2048,
      maxY: 2048,
    });
    expect(childClipBounds(1, 0, 2, 4096, 64)).toEqual({
      minX: 2048,
      minY: -64,
      maxX: 4160,
      maxY: 2048,
    });
  });
});

describe("clipSegmentToBounds", () => {
  it("clips a segment crossing an internal seam to the boundary", () => {
    const bounds = childClipBounds(0, 0, 2, 4096, 64);
    const clipped = clipSegmentToBounds(
      { x: 1900, y: 1000 },
      { x: 2200, y: 1000 },
      bounds
    );
    expect(clipped).toEqual([
      { x: 1900, y: 1000 },
      { x: 2048, y: 1000 },
    ]);
  });
});

describe("clipRingToBounds", () => {
  it("removes geometry past an internal seam (no buffer overlap)", () => {
    const bounds = childClipBounds(0, 0, 2, 4096, 64);
    const ring = clipRingToBounds(
      [
        { x: 1800, y: 900 },
        { x: 2100, y: 900 },
        { x: 2100, y: 1100 },
        { x: 1800, y: 1100 },
      ],
      bounds
    );
    const xs = ring.map((p) => p.x);
    expect(Math.max(...xs)).toBeLessThanOrEqual(2048);
    expect(xs).toContain(2048);
  });
});

describe("normalizeRing", () => {
  it("removes MVT closing duplicate before clip", () => {
    const ring = normalizeRing([
      { x: 1800, y: 900 },
      { x: 2048, y: 900 },
      { x: 2048, y: 1100 },
      { x: 1800, y: 1100 },
      { x: 1800, y: 900 },
    ]);
    expect(ring).toEqual([
      { x: 1800, y: 900 },
      { x: 2048, y: 900 },
      { x: 2048, y: 1100 },
      { x: 1800, y: 1100 },
    ]);
  });
});

describe("closeRing", () => {
  it("appends the first vertex for vt-pbf polygon encoding", () => {
    expect(
      closeRing([
        { x: 1800, y: 900 },
        { x: 2048, y: 900 },
        { x: 2048, y: 1100 },
        { x: 1800, y: 1100 },
      ])
    ).toEqual([
      { x: 1800, y: 900 },
      { x: 2048, y: 900 },
      { x: 2048, y: 1100 },
      { x: 1800, y: 1100 },
      { x: 1800, y: 900 },
    ]);
  });
});
