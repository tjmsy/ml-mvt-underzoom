import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import vtpbf from "vt-pbf";
import { describe, expect, it, vi } from "vitest";

let vectorTileCalls = 0;

vi.mock("@mapbox/vector-tile", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@mapbox/vector-tile")>();
  const Orig = mod.VectorTile;
  class MockVectorTile extends Orig {
    constructor(...args: ConstructorParameters<typeof Orig>) {
      vectorTileCalls++;
      if (vectorTileCalls === 2) {
        throw new Error("corrupt child tile");
      }
      super(...args);
    }
  }
  return { ...mod, VectorTile: MockVectorTile };
});

import { mergeChildMvtTiles } from "../src/merge-child-mvt.js";

function loadSelfGeometry(this: { geometry: unknown }) {
  return this.geometry;
}

function lineTileMvt(layerName: string): Uint8Array {
  const layer = {
    name: layerName,
    extent: 4096,
    version: 2,
    length: 1,
    _keys: [] as string[],
    _values: [] as unknown[],
    _features: [
      {
        type: 2,
        geometry: [[{ x: 0, y: 0 }, { x: 10, y: 10 }]],
        properties: {},
        loadGeometry: loadSelfGeometry,
      },
    ],
    feature(i: number) {
      return this._features[i];
    },
  };
  return vtpbf({ layers: { [layerName]: layer } });
}

describe("mergeChildMvtTiles onTileError", () => {
  it("calls onTileError for malformed child tiles and merges valid children", () => {
    vectorTileCalls = 0;
    const valid = lineTileMvt("roads");
    const errors: unknown[] = [];

    const out = mergeChildMvtTiles(
      [
        { coord: { z: 16, x: 0, y: 0 }, relX: 0, relY: 0, buffer: valid },
        { coord: { z: 16, x: 1, y: 0 }, relX: 1, relY: 0, buffer: valid },
      ],
      {
        displayZ: 15,
        sourceZoom: 16,
        onTileError: (error) => errors.push(error),
      },
    );

    expect(errors.length).toBe(1);
    const vt = new VectorTile(new PbfReader(out));
    expect(vt.layers.roads?.length).toBe(1);
  });
});
