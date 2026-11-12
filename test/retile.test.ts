import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { describe, expect, it } from "vitest";
import { lineTileMvt } from "./helpers/mvt-fixture.js";
import { buildUnderzoomMvt } from "../src/retile.js";
import type { TileReader } from "../src/types.js";

function countLayerFeatures(data: Uint8Array, layerName: string): number {
  const vt = new VectorTile(new PbfReader(data));
  const layer = vt.layers[layerName];
  return layer ? layer.length : 0;
}

function horizontalLineTile(layerName: string): Uint8Array<ArrayBuffer> {
  return lineTileMvt(layerName, [
    { x: 400, y: 2048 },
    { x: 3696, y: 2048 },
  ]);
}

describe("buildUnderzoomMvt", () => {
  it("passes through when display zoom equals source zoom", async () => {
    const z = 16;
    const x = 58246;
    const y = 25802;
    const tile = horizontalLineTile("RdEdg");

    const reader: TileReader = async (cz, cx, cy) => {
      if (cz === z && cx === x && cy === y) return tile;
      return null;
    };

    const out = await buildUnderzoomMvt({
      z,
      x,
      y,
      sourceZoom: 16,
      readTile: reader,
      sourceLayers: ["RdEdg"],
    });

    expect(out.byteLength).toBeGreaterThan(0);
    expect(countLayerFeatures(out, "RdEdg")).toBe(1);
  });

  it("merges four source tiles into one display tile", async () => {
    const z = 15;
    const x = 29123;
    const y = 12901;
    const children = [
      { z: 16, x: 58246, y: 25802 },
      { z: 16, x: 58247, y: 25802 },
      { z: 16, x: 58246, y: 25803 },
      { z: 16, x: 58247, y: 25803 },
    ];

    const tiles = new Map<string, Uint8Array<ArrayBuffer>>();
    for (const child of children) {
      tiles.set(
        `${child.z}/${child.x}/${child.y}`,
        horizontalLineTile("RdEdg")
      );
    }

    const reader: TileReader = async (cz, cx, cy) =>
      tiles.get(`${cz}/${cx}/${cy}`) ?? null;

    const out = await buildUnderzoomMvt({
      z,
      x,
      y,
      sourceZoom: 16,
      readTile: reader,
      sourceLayers: ["RdEdg"],
    });

    expect(out.byteLength).toBeGreaterThan(0);
    expect(countLayerFeatures(out, "RdEdg")).toBeGreaterThan(0);
  });

  it("returns empty tile when all children are missing", async () => {
    const reader: TileReader = async () => null;
    const out = await buildUnderzoomMvt({
      z: 15,
      x: 0,
      y: 0,
      sourceZoom: 16,
      readTile: reader,
      sourceLayers: ["RdEdg"],
    });
    expect(out.byteLength).toBe(0);
  });

  it("throws AbortError when signal is aborted before fetch", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      buildUnderzoomMvt({
        z: 15,
        x: 0,
        y: 0,
        sourceZoom: 16,
        readTile: async () => new Uint8Array([1]),
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
