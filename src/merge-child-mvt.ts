import { VectorTile } from "@mapbox/vector-tile";
import Protobuf from "pbf";
import vtpbf from "vt-pbf";
import { toArrayBuffer, toOwnedUint8Array } from "./buffer.js";
import {
  DEFAULT_MVT_BUFFER,
  DEFAULT_MVT_EXTENT,
} from "./mvt-constants.js";
import type { TileCoord } from "./types.js";

const EMPTY_PROPERTIES = Object.freeze(
  Object.create(null),
) as Record<string, unknown>;

export type ChildMvtTile = {
  coord: TileCoord;
  relX: number;
  relY: number;
  buffer: ArrayBuffer | Uint8Array | null | undefined;
};

export type MergeChildMvtOptions = {
  /** Display tile zoom (parent). */
  displayZ: number;
  /** Source archive zoom (children). */
  sourceZoom: number;
  /** Layers to keep. When omitted, all layers from child tiles are merged. */
  sourceLayers?: string[];
  extent?: number;
  /** Tile-coordinate buffer for clamping (default 64). */
  buffer?: number;
  /** Called when a child tile fails to parse. Other children still merge. */
  onTileError?: (error: unknown, coord: TileCoord) => void;
};

function shouldKeepLayer(
  layerName: string,
  sourceLayers?: string[],
): boolean {
  if (!sourceLayers || sourceLayers.length === 0) return true;
  return sourceLayers.includes(layerName);
}

function loadSelfGeometry(this: { geometry: unknown }) {
  return this.geometry;
}

/**
 * Merge child MVT tiles at `sourceZoom` into parent tile space at `displayZ`.
 * Stays in tile coordinates (loadGeometry) and re-encodes with vt-pbf directly.
 */
export function mergeChildMvtTiles(
  childTiles: ChildMvtTile[],
  options: MergeChildMvtOptions,
): Uint8Array<ArrayBuffer> {
  const {
    displayZ,
    sourceZoom,
    sourceLayers,
    extent = DEFAULT_MVT_EXTENT,
    buffer = DEFAULT_MVT_BUFFER,
    onTileError,
  } = options;

  const zoomDiff = sourceZoom - displayZ;
  if (zoomDiff <= 0) {
    throw new Error(
      `sourceZoom (${sourceZoom}) must be greater than displayZ (${displayZ})`,
    );
  }

  const scale = 2 ** zoomDiff;
  const cellExtent = extent / scale;
  const minCoord = -buffer;
  const maxCoord = extent + buffer;

  const mergedLayers: Record<string, MergedLayer> = {};
  let totalFeatures = 0;

  for (let c = 0; c < childTiles.length; c++) {
    const child = childTiles[c];
    if (!child.buffer || child.buffer.byteLength === 0) continue;

    try {
      const tile = new VectorTile(new Protobuf(toArrayBuffer(child.buffer)));
      const layerNames = Object.keys(tile.layers);

      const offsetX = child.relX * cellExtent;
      const offsetY = child.relY * cellExtent;

      for (let l = 0; l < layerNames.length; l++) {
        const layerName = layerNames[l];
        if (!shouldKeepLayer(layerName, sourceLayers)) continue;

        const layer = tile.layers[layerName];
        let targetLayer = mergedLayers[layerName];
        if (!targetLayer) {
          targetLayer = {
            name: layer.name,
            extent,
            version: layer.version ?? 2,
            length: 0,
            _keys: [],
            _values: [],
            _features: [],
            feature(i: number) {
              return this._features[i];
            },
          } as MergedLayer;
          mergedLayers[layerName] = targetLayer;
        }

        const layerLen = layer.length;
        for (let i = 0; i < layerLen; i++) {
          const feature = layer.feature(i);
          const rawGeometry = feature.loadGeometry();

          const ringsLen = rawGeometry.length;
          const transformedGeometry = new Array(ringsLen);

          for (let r = 0; r < ringsLen; r++) {
            const ring = rawGeometry[r];
            const ptLen = ring.length;
            const newRing = new Array(ptLen);

            for (let p = 0; p < ptLen; p++) {
              const pt = ring[p];

              let x = Math.round(pt.x / scale + offsetX);
              let y = Math.round(pt.y / scale + offsetY);

              if (x < minCoord) x = minCoord;
              else if (x > maxCoord) x = maxCoord;

              if (y < minCoord) y = minCoord;
              else if (y > maxCoord) y = maxCoord;

              newRing[p] = { x, y };
            }
            transformedGeometry[r] = newRing;
          }

          targetLayer._features.push({
            type: feature.type,
            geometry: transformedGeometry,
            properties: feature.properties ?? EMPTY_PROPERTIES,
            loadGeometry: loadSelfGeometry,
          });
          targetLayer.length++;
          totalFeatures++;
        }
      }
    } catch (error) {
      onTileError?.(error, child.coord);
    }
  }

  if (totalFeatures === 0) return new Uint8Array(0);

  const out = vtpbf({ layers: mergedLayers });
  return toOwnedUint8Array(out);
}

type MergedFeature = {
  type: number;
  geometry: { x: number; y: number }[][];
  properties: Record<string, unknown>;
  loadGeometry: typeof loadSelfGeometry;
};

type MergedLayer = {
  name: string;
  extent: number;
  version: number;
  length: number;
  _keys: string[];
  _values: unknown[];
  _features: MergedFeature[];
  feature: (i: number) => MergedFeature;
};
