#!/usr/bin/env node
/**
 * Quick bench: GSI optimal_bvmap z15 underzoom feature counts and timing.
 * Usage: npm run bench
 */
import { PMTiles } from "pmtiles";
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { buildUnderzoomMvt } from "../dist/retile.js";
import { pmtilesTileReader } from "../dist/readers/index.js";
import { childTilesForParent } from "../dist/tile-math.js";

const URL =
  "https://cyberjapandata.gsi.go.jp/xyz/optimal_bvmap-v1/optimal_bvmap-v1.pmtiles";
const TILES = [
  [15, 29123, 12901],
  [15, 29122, 12901],
  [15, 29124, 12900],
];

const archive = new PMTiles(URL);
const readTile = pmtilesTileReader(archive);

for (const [z, x, y] of TILES) {
  const children = childTilesForParent(z, x, y, 16);
  let childTotal = 0;
  for (const c of children) {
    const raw = await readTile(c.z, c.x, c.y);
    if (!raw) continue;
    const vt = new VectorTile(new PbfReader(raw));
    childTotal += vt.layers.RdEdg?.length ?? 0;
    childTotal += vt.layers.RdCompt?.length ?? 0;
  }

  const t0 = performance.now();
  const out = await buildUnderzoomMvt({
    z,
    x,
    y,
    sourceZoom: 16,
    readTile,
    sourceLayers: ["RdEdg", "RdCompt"],
  });
  const ms = performance.now() - t0;

  const merged = new VectorTile(new PbfReader(out));
  const mergedTotal =
    (merged.layers.RdEdg?.length ?? 0) + (merged.layers.RdCompt?.length ?? 0);

  console.log(
    JSON.stringify({
      z,
      x,
      y,
      childTotal,
      mergedTotal,
      delta: mergedTotal - childTotal,
      ms: Math.round(ms),
    })
  );
}
