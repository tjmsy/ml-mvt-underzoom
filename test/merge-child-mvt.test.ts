import { VectorTile } from "@mapbox/vector-tile";
import Protobuf from "pbf";
import { describe, expect, it } from "vitest";
import { lineTileMvt } from "./helpers/mvt-fixture.js";
import { mergeChildMvtTiles } from "../src/merge-child-mvt.js";

function firstLineCoords(data: Uint8Array): { x: number; y: number }[] {
  const vt = new VectorTile(new Protobuf(data.buffer));
  const layer = vt.layers.test ?? Object.values(vt.layers)[0];
  expect(layer).toBeDefined();
  const feature = layer!.feature(0);
  const rings = feature.loadGeometry();
  return rings[0];
}

describe("mergeChildMvtTiles", () => {
  it("returns empty tile when all child buffers are missing", () => {
    const out = mergeChildMvtTiles(
      [
        { coord: { z: 16, x: 0, y: 0 }, relX: 0, relY: 0, buffer: null },
        { coord: { z: 16, x: 1, y: 0 }, relX: 1, relY: 0, buffer: null },
      ],
      { displayZ: 15, sourceZoom: 16 },
    );
    expect(out.byteLength).toBe(0);
  });

  it("merges one child line into parent tile space (scale /2)", () => {
    const child = lineTileMvt("test", [
      { x: 100, y: 200 },
      { x: 300, y: 400 },
    ]);

    const out = mergeChildMvtTiles(
      [{ coord: { z: 16, x: 0, y: 0 }, relX: 0, relY: 0, buffer: child }],
      { displayZ: 15, sourceZoom: 16, sourceLayers: ["test"] },
    );

    expect(out.byteLength).toBeGreaterThan(0);
    const coords = firstLineCoords(out);
    expect(coords[0]).toEqual({ x: 50, y: 100 });
    expect(coords[1]).toEqual({ x: 150, y: 200 });
  });

  it("offsets child tile by relX/relY in parent space", () => {
    const child = lineTileMvt("test", [{ x: 0, y: 0 }, { x: 10, y: 10 }]);

    const out = mergeChildMvtTiles(
      [{ coord: { z: 16, x: 1, y: 0 }, relX: 1, relY: 0, buffer: child }],
      { displayZ: 15, sourceZoom: 16, sourceLayers: ["test"] },
    );

    const coords = firstLineCoords(out);
    expect(coords[0]).toEqual({ x: 2048, y: 0 });
    expect(coords[1]).toEqual({ x: 2053, y: 5 });
  });

  it("filters layers with sourceLayers", () => {
    const childA = lineTileMvt("keep", [{ x: 0, y: 0 }, { x: 10, y: 10 }]);
    const childB = lineTileMvt("drop", [{ x: 0, y: 0 }, { x: 10, y: 10 }]);

    const out = mergeChildMvtTiles(
      [
        { coord: { z: 16, x: 0, y: 0 }, relX: 0, relY: 0, buffer: childA },
        { coord: { z: 16, x: 1, y: 0 }, relX: 1, relY: 0, buffer: childB },
      ],
      { displayZ: 15, sourceZoom: 16, sourceLayers: ["keep"] },
    );

    const vt = new VectorTile(new Protobuf(out.buffer));
    expect(vt.layers.keep?.length).toBe(1);
    expect(vt.layers.drop).toBeUndefined();
  });

  it("supports multi-step underzoom (sourceZoom - displayZ = 2)", () => {
    const child = lineTileMvt("test", [{ x: 400, y: 800 }, { x: 800, y: 1600 }]);

    const out = mergeChildMvtTiles(
      [{ coord: { z: 16, x: 0, y: 0 }, relX: 0, relY: 0, buffer: child }],
      { displayZ: 14, sourceZoom: 16, sourceLayers: ["test"] },
    );

    const coords = firstLineCoords(out);
    expect(coords[0]).toEqual({ x: 100, y: 200 });
    expect(coords[1]).toEqual({ x: 200, y: 400 });
  });

  it("merges four child tiles into one parent layer", () => {
    const children = [
      { relX: 0, relY: 0, x: 0, y: 0 },
      { relX: 1, relY: 0, x: 1, y: 0 },
      { relX: 0, relY: 1, x: 0, y: 1 },
      { relX: 1, relY: 1, x: 1, y: 1 },
    ];

    const out = mergeChildMvtTiles(
      children.map((c) => ({
        coord: { z: 16, x: c.x, y: c.y },
        relX: c.relX,
        relY: c.relY,
        buffer: lineTileMvt("roads", [{ x: 10, y: 10 }, { x: 20, y: 20 }]),
      })),
      { displayZ: 15, sourceZoom: 16, sourceLayers: ["roads"] },
    );

    const vt = new VectorTile(new Protobuf(out.buffer));
    expect(vt.layers.roads?.length).toBe(4);
  });

  it("preserves feature properties through merge", () => {
    const child = lineTileMvt("roads", [{ x: 100, y: 100 }, { x: 200, y: 200 }]);
    const out = mergeChildMvtTiles(
      [{ coord: { z: 16, x: 0, y: 0 }, relX: 0, relY: 0, buffer: child }],
      { displayZ: 15, sourceZoom: 16 },
    );

    const vt = new VectorTile(new Protobuf(out.buffer));
    expect(vt.layers.roads.feature(0).properties).toMatchObject({
      vt_code: 2201,
    });
  });
});
