import { PMTiles } from "pmtiles";
import type { DataDrivenPropertyValueSpecification } from "maplibre-gl";
import { maplibregl } from "./maplibre.js";
import {
  mvtUnderzoomTilesUrl,
  pmtilesTileReader,
  registerMvtUnderzoomProtocol,
} from "ml-mvt-underzoom";

const SOURCE_ZOOM = 16;
const DISPLAY_MIN_ZOOM = 15;
const protocol = "mvt-underzoom";

const GSI_OPTIMAL_BVMAP_PMTILES =
  "https://cyberjapandata.gsi.go.jp/xyz/optimal_bvmap-v1/optimal_bvmap-v1.pmtiles";
const SOURCE_LAYERS = ["BldA", "RdEdg"] as const;

const BLDA_FILL = "#bcbd22";
const BLDA_OUTLINE = "#7f7f0f";

const RDEDG_COLOR = "#d62728";
const CASING_COLOR = "#ffffff";

const archive = new PMTiles(GSI_OPTIMAL_BVMAP_PMTILES);
registerMvtUnderzoomProtocol(maplibregl, {
  protocol,
  sourceZoom: SOURCE_ZOOM,
  readTile: pmtilesTileReader(archive),
  sourceLayers: [...SOURCE_LAYERS],
  dissolveSeams: true,
  dissolveSeamsLayers: ["BldA"],
});

const lineWidth = (
  thin: number,
  thick: number
): DataDrivenPropertyValueSpecification<number> => [
  "interpolate",
  ["linear"],
  ["zoom"],
  15,
  thin,
  17,
  thick,
];

const map = new maplibregl.Map({
  container: "map",
  center: [139.7695, 35.6835],
  zoom: 15.2,
  maxZoom: 18,
  hash: true,
  style: {
    version: 8,
    sources: {
      "gsi-pale": {
        type: "raster",
        tiles: ["https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png"],
        tileSize: 256,
        maxzoom: 18,
        attribution:
          '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>',
      },
      "bvmap-lines": {
        type: "vector",
        tiles: [mvtUnderzoomTilesUrl(protocol)],
        minzoom: DISPLAY_MIN_ZOOM,
        maxzoom: SOURCE_ZOOM,
        attribution:
          '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院最適化ベクトルタイル</a>',
      },
    },
    layers: [
      {
        id: "gsi-pale",
        type: "raster",
        source: "gsi-pale",
      },
      {
        id: "blda-fill",
        type: "fill",
        source: "bvmap-lines",
        "source-layer": "BldA",
        minzoom: DISPLAY_MIN_ZOOM,
        paint: {
          "fill-color": BLDA_FILL,
          "fill-opacity": 0.35,
        },
      },
      {
        id: "blda-outline",
        type: "line",
        source: "bvmap-lines",
        "source-layer": "BldA",
        minzoom: DISPLAY_MIN_ZOOM,
        paint: {
          "line-color": BLDA_OUTLINE,
          "line-width": lineWidth(1.2, 2),
        },
      },
      {
        id: "rdedg-casing",
        type: "line",
        source: "bvmap-lines",
        "source-layer": "RdEdg",
        minzoom: DISPLAY_MIN_ZOOM,
        paint: {
          "line-color": CASING_COLOR,
          "line-width": lineWidth(3.5, 6),
          "line-opacity": 0.95,
        },
      },
      {
        id: "rdedg",
        type: "line",
        source: "bvmap-lines",
        "source-layer": "RdEdg",
        minzoom: DISPLAY_MIN_ZOOM,
        paint: {
          "line-color": RDEDG_COLOR,
          "line-width": lineWidth(2, 3.5),
        },
      },
    ],
  },
});

map.addControl(new maplibregl.NavigationControl(), "top-right");

map.on("load", () => {
  const status = document.getElementById("status");
  if (status) {
    status.textContent = `protocol=${protocol} sourceZoom=${SOURCE_ZOOM} display>=${DISPLAY_MIN_ZOOM}`;
  }
});

map.on("error", (e) => {
  console.error(e);
  const status = document.getElementById("status");
  if (status) {
    status.textContent = `error: ${e.error?.message ?? String(e.error ?? e)}`;
  }
});
