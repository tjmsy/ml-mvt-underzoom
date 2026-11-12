import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { describe, expect, it } from "vitest";
import { polygonTileMvt } from "./helpers/mvt-fixture.js";
import {
  childClipBounds,
  clipRingToBounds,
  normalizeRing,
  type TilePoint,
} from "../src/tile-clip.js";
import { internalSeamLines, dissolvePolygonsAtSeams } from "../src/seam-dissolve.js";

describe("internalSeamLines", () => {
  it("returns seam at 2048 for 2x2 merge into extent 4096", () => {
    expect(internalSeamLines(2, 4096)).toEqual({ x: [2048], y: [2048] });
  });
});

describe("dissolvePolygonsAtSeams", () => {
  it("preserves properties from vt-pbf fixture tiles for dissolve matching", () => {
    const tile = polygonTileMvt(
      "bld",
      [
        { x: 3600, y: 1800 },
        { x: 4096, y: 1800 },
        { x: 4096, y: 2200 },
        { x: 3600, y: 2200 },
      ],
      { id: 1 },
    );
    const vt = new VectorTile(new PbfReader(tile));
    expect(vt.layers.bld.feature(0).properties).toEqual({ id: 1 });
    const ring = vt.layers.bld.feature(0).loadGeometry()[0].map((p) => ({
      x: p.x,
      y: p.y,
    }));
    expect(ring.slice(0, 4)).toEqual([
      { x: 3600, y: 1800 },
      { x: 4096, y: 1800 },
      { x: 4096, y: 2200 },
      { x: 3600, y: 2200 },
    ]);
  });

  it("unions polygon halves that share a vertical internal seam", () => {
    const left = {
      geometry: [
        [
          { x: 1800, y: 900 },
          { x: 2048, y: 900 },
          { x: 2048, y: 1100 },
          { x: 1800, y: 1100 },
        ],
      ],
      properties: { id: 1 },
      relX: 0,
      relY: 0,
    };
    const right = {
      geometry: [
        [
          { x: 2048, y: 900 },
          { x: 2298, y: 900 },
          { x: 2298, y: 1100 },
          { x: 2048, y: 1100 },
        ],
      ],
      properties: { id: 1 },
      relX: 1,
      relY: 0,
    };

    const out = dissolvePolygonsAtSeams([left, right], 2, 4096);
    expect(out).toHaveLength(1);

    const ring = out[0].geometry[0];
    const xs = ring.map((p) => p.x);
    expect(Math.min(...xs)).toBeLessThanOrEqual(1800);
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(2298);

    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % n];
      expect(!(a.x === 2048 && b.x === 2048)).toBe(true);
    }
  });

  it("does not union polygons with different properties", () => {
    const left = {
      geometry: [
        [
          { x: 1800, y: 900 },
          { x: 2048, y: 900 },
          { x: 2048, y: 1100 },
          { x: 1800, y: 1100 },
        ],
      ],
      properties: { id: 1 },
      relX: 0,
      relY: 0,
    };
    const right = {
      geometry: [
        [
          { x: 2048, y: 900 },
          { x: 2298, y: 900 },
          { x: 2298, y: 1100 },
          { x: 2048, y: 1100 },
        ],
      ],
      properties: { id: 2 },
      relX: 1,
      relY: 0,
    };

    expect(dissolvePolygonsAtSeams([left, right], 2, 4096)).toHaveLength(2);
  });

  it("dissolves geometry produced by merge transform and quadrant clip", () => {
    const scale = 2;
    const extent = 4096;
    const buffer = 64;

    function clipChildRing(
      ring: { x: number; y: number }[],
      relX: number,
      relY: number,
    ) {
      const cell = extent / scale;
      const offsetX = relX * cell;
      const offsetY = relY * cell;
      const bounds = childClipBounds(relX, relY, scale, extent, buffer);
      const transformed = ring.map((p) => ({
        x: Math.round(p.x / scale + offsetX),
        y: Math.round(p.y / scale + offsetY),
      }));
      return [clipRingToBounds(transformed, bounds)];
    }

    const left = {
      geometry: clipChildRing(
        [
          { x: 3600, y: 1800 },
          { x: 4096, y: 1800 },
          { x: 4096, y: 2200 },
          { x: 3600, y: 2200 },
        ],
        0,
        0,
      ),
      properties: { id: 1 },
      relX: 0,
      relY: 0,
    };
    const right = {
      geometry: clipChildRing(
        [
          { x: 0, y: 1800 },
          { x: 500, y: 1800 },
          { x: 500, y: 2200 },
          { x: 0, y: 2200 },
        ],
        1,
        0,
      ),
      properties: { id: 1 },
      relX: 1,
      relY: 0,
    };

    expect(dissolvePolygonsAtSeams([left, right], scale, extent)).toHaveLength(1);
  });

  it("dissolves child MVT features after the same transform and clip as merge", () => {
    const leftTile = polygonTileMvt(
      "bld",
      [
        { x: 3600, y: 1800 },
        { x: 4096, y: 1800 },
        { x: 4096, y: 2200 },
        { x: 3600, y: 2200 },
      ],
      { id: 1 },
    );
    const rightTile = polygonTileMvt(
      "bld",
      [
        { x: 0, y: 1800 },
        { x: 500, y: 1800 },
        { x: 500, y: 2200 },
        { x: 0, y: 2200 },
      ],
      { id: 1 },
    );

    const scale = 2;
    const extent = 4096;
    const buffer = 64;
    const cell = extent / scale;

    function mergeChildPolygon(
      tileBytes: Uint8Array<ArrayBuffer>,
      relX: number,
      relY: number,
    ) {
      const tile = new VectorTile(new PbfReader(tileBytes));
      const feature = tile.layers.bld.feature(0);
      const rawGeometry = feature.loadGeometry();
      const offsetX = relX * cell;
      const offsetY = relY * cell;
      const clipBounds = childClipBounds(relX, relY, scale, extent, buffer);
      const transformed: TilePoint[][] = rawGeometry.map((ring) =>
        ring.map((pt) => ({
          x: Math.round(pt.x / scale + offsetX),
          y: Math.round(pt.y / scale + offsetY),
        })),
      );
      const clipped: TilePoint[][] = [];
      for (const ring of transformed) {
        const part = clipRingToBounds(normalizeRing(ring), clipBounds);
        if (part.length >= 3) clipped.push(part);
      }
      return {
        geometry: clipped,
        properties: feature.properties,
        relX,
        relY,
      };
    }

    const halves = [
      mergeChildPolygon(leftTile, 0, 0),
      mergeChildPolygon(rightTile, 1, 0),
    ];

    expect(halves[0].geometry[0]?.length).toBeGreaterThan(0);
    const leftBbox = halves[0].geometry[0].reduce(
      (acc, p) => ({
        minX: Math.min(acc.minX, p.x),
        maxX: Math.max(acc.maxX, p.x),
        minY: Math.min(acc.minY, p.y),
        maxY: Math.max(acc.maxY, p.y),
      }),
      { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
    );
    const rightBbox = halves[1].geometry[0].reduce(
      (acc, p) => ({
        minX: Math.min(acc.minX, p.x),
        maxX: Math.max(acc.maxX, p.x),
        minY: Math.min(acc.minY, p.y),
        maxY: Math.max(acc.maxY, p.y),
      }),
      { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
    );
    expect(leftBbox).toEqual({ minX: 1800, maxX: 2048, minY: 900, maxY: 1100 });
    expect(rightBbox).toEqual({ minX: 2048, maxX: 2298, minY: 900, maxY: 1100 });
    expect(halves[0].properties).toEqual(halves[1].properties);
    expect(dissolvePolygonsAtSeams(halves, scale, extent)).toHaveLength(1);
  });

  it("skips dissolve work when no polygon touches an internal seam", () => {
    const interior = Array.from({ length: 200 }, (_, i) => ({
      geometry: [
        [
          { x: 100 + i, y: 100 },
          { x: 200 + i, y: 100 },
          { x: 200 + i, y: 200 },
          { x: 100 + i, y: 200 },
        ],
      ],
      properties: { id: i },
      relX: 0,
      relY: 0,
    }));
    const out = dissolvePolygonsAtSeams(interior, 2, 4096);
    expect(out).toBe(interior);
  });
});
