# ml-mvt-underzoom

MapLibre helper for **using third-party MVT tiles at a lower map zoom** than the provider stores.

A PMTiles or XYZ endpoint you link to may only serve geometry from z16 upward, while your map style needs lines at z15. MapLibre can **overzoom** (show a z16 tile when the map is at z17+), but it cannot **underzoom** — it will not merge finer tiles into a coarser one. This library fetches those source tiles at request time, merges geometry in tile coordinate space, and returns MVT bytes for the display zoom.

## How it works

```
MapLibre requests mvt-underzoom://15/x/y
  → buildUnderzoomMvt({ z: 15, sourceZoom: 16, readTile, … })
  → readTile fetches all source tiles that cover that parent (4 tiles for −1 step, 16 for −2, …)
  → loadGeometry on each child → scale/offset to parent tile space → vt-pbf
  → return MVT bytes for z15
```

When display `z === sourceZoom`, the source tile bytes are returned unchanged (pass-through). When display `z > sourceZoom`, use MapLibre overzoom instead — this library throws if asked to upzoom.

## Install

```bash
npm install ml-mvt-underzoom maplibre-gl pmtiles
```

| Package            | Role                                                                |
| ------------------ | ------------------------------------------------------------------- |
| `ml-mvt-underzoom` | Core retile logic + optional MapLibre protocol helper               |
| `maplibre-gl`      | **Peer** — only needed for `registerMvtUnderzoomProtocol`           |
| `pmtiles`          | **Peer** — only needed when reading PMTiles via `pmtilesTileReader` |

This package does **not** implement the PMTiles format. It takes a `TileReader` callback and ships adapters for the `[pmtiles](https://github.com/protomaps/PMTiles)` npm package and HTTP `{z}/{x}/{y}` URLs.

## Example: MapLibre + PMTiles

Illustrative only — replace URLs, layer names, and zoom levels for your data.

```ts
import maplibregl from "maplibre-gl";
import { PMTiles } from "pmtiles";
import {
  mvtUnderzoomTilesUrl,
  pmtilesTileReader,
  registerMvtUnderzoomProtocol,
} from "ml-mvt-underzoom";

// --- set for the third-party tile source you use ---
const SOURCE_ZOOM = 16; // highest zoom the provider stores
const DISPLAY_MIN_ZOOM = 15; // lowest zoom your style needs
const archive = new PMTiles("https://example.com/tiles/my-lines.pmtiles"); // provider URL
const SOURCE_LAYERS = ["roads"]; // source-layer names to keep; omit to keep all

registerMvtUnderzoomProtocol(maplibregl, {
  sourceZoom: SOURCE_ZOOM,
  readTile: pmtilesTileReader(archive),
  sourceLayers: SOURCE_LAYERS,
});

const map = new maplibregl.Map({
  container: "map", // your DOM element id
  style: {
    version: 8,
    sources: {
      lines: {
        type: "vector",
        tiles: [mvtUnderzoomTilesUrl()], // fixed — custom protocol URL
        minzoom: DISPLAY_MIN_ZOOM,
        maxzoom: SOURCE_ZOOM,
      },
    },
    layers: [
      {
        id: "roads",
        type: "line",
        source: "lines",
        "source-layer": "roads", // must match a name in SOURCE_LAYERS (or your source)
        minzoom: DISPLAY_MIN_ZOOM,
        paint: { "line-color": "#000", "line-width": 1 },
      },
    ],
  },
  center: [0, 0], // your map center
  zoom: DISPLAY_MIN_ZOOM,
});
```

Below `sourceZoom`, tiles are synthesized from child source tiles. At `sourceZoom`, tiles are read directly from the archive.

## API

### `buildUnderzoomMvt` (without MapLibre)

For Node, Deno, or a custom tile server — same logic as the MapLibre protocol, without `addProtocol`:

```ts
import { buildUnderzoomMvt, pmtilesTileReader } from "ml-mvt-underzoom";
import { PMTiles } from "pmtiles";

const archive = new PMTiles("https://example.com/tiles/my-lines.pmtiles");
const readTile = pmtilesTileReader(archive);

const mvtBytes = await buildUnderzoomMvt({
  z: 15, // display tile — set per request
  x: 12345,
  y: 6789,
  sourceZoom: 16, // must match the provider's highest zoom
  readTile,
  sourceLayers: ["roads"], // optional
});
// empty Uint8Array when all covering source tiles are missing
```

### Tile readers

```ts
import { pmtilesTileReader, xyzTileReader } from "ml-mvt-underzoom";

const fromPmtiles = pmtilesTileReader(archive); // PMTiles instance (peer dependency)

const fromXyz = xyzTileReader({
  urlTemplate: "https://example.com/tiles/{z}/{x}/{y}.pbf", // your URL template
});
```

Both return a `TileReader`: `(z, x, y) => Promise<ArrayBuffer | null>`.

### MapLibre protocol

```ts
import {
  mvtUnderzoomTilesUrl,
  registerMvtUnderzoomProtocol,
} from "ml-mvt-underzoom";

const scheme = registerMvtUnderzoomProtocol(maplibregl, {
  sourceZoom: 16,
  readTile,
  sourceLayers: ["roads"],
  protocol: "mvt-underzoom", // optional; default shown
});

// vector source tiles: [mvtUnderzoomTilesUrl(scheme)]
```

### Other exports

| Export                                     | Description                                                    |
| ------------------------------------------ | -------------------------------------------------------------- |
| `buildUnderzoomMvt`                        | Synthesize MVT for display `(z, x, y)` from `sourceZoom` tiles |
| `mergeChildMvtTiles`                       | Low-level MVT-native child tile merge                          |
| `pmtilesTileReader`                        | `TileReader` from a PMTiles `getZxy` instance                  |
| `xyzTileReader`                            | `TileReader` from an HTTP `{z}/{x}/{y}` template               |
| `cachedTileReader`                         | In-memory `TileReader` cache wrapper                           |
| `registerMvtUnderzoomProtocol`             | Register a MapLibre custom tile protocol                       |
| `mvtUnderzoomTilesUrl`                     | URL template for vector source `tiles` array                   |
| `childTilesForParent`, `tileToBbox`        | Tile math helpers                                              |
| `DEFAULT_MVT_EXTENT`, `DEFAULT_MVT_BUFFER` | MVT extent/buffer defaults                                     |

## Display zoom vs source zoom

| Request            | Behavior                                                            |
| ------------------ | ------------------------------------------------------------------- |
| `z === sourceZoom` | Pass-through: return raw source tile                                |
| `z < sourceZoom`   | Merge all source tiles covering the parent, re-encode in tile space |
| `z > sourceZoom`   | Error — use MapLibre overzoom on `sourceZoom` tiles                 |

Any `z` below `sourceZoom` is supported (one step, two steps, etc.). Each parent tile reads `4^(sourceZoom − z)` source tiles. Wider gaps cost more I/O per request.

## License

MIT
