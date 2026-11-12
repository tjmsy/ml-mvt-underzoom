import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import vtpbf from "vt-pbf";
import { toArrayBuffer, toOwnedUint8Array } from "./buffer.js";
import { DEFAULT_MVT_BUFFER, DEFAULT_MVT_EXTENT } from "./mvt-constants.js";
import {
  childClipBounds,
  clipLineToBounds,
  clipRingToBounds,
  closePolygonRings,
  normalizeRing,
  pointInBounds,
  type TilePoint,
} from "./tile-clip.js";
import { dissolvePolygonsAtSeams } from "./seam-dissolve.js";
import type { TileCoord } from "./types.js";

const EMPTY_PROPERTIES = Object.freeze(Object.create(null)) as Record<
  string,
  unknown
>;

/** MVT feature type constants. */
const MVT_POINT = 1;
const MVT_LINE = 2;
const MVT_POLYGON = 3;

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
  /** Buffer on parent exterior edges only (default 64). */
  buffer?: number;
  /** Union polygon halves on internal merge seams (default false; opt-in, use dissolveSeamsLayers). */
  dissolveSeams?: boolean;
  /** Layers to run seam dissolve on. Required when dissolveSeams is true. */
  dissolveSeamsLayers?: string[];
  /** Called when a child tile fails to parse. Other children still merge. */
  onTileError?: (error: unknown, coord: TileCoord) => void;
};

function shouldKeepLayer(layerName: string, sourceLayers?: string[]): boolean {
  if (!sourceLayers || sourceLayers.length === 0) return true;
  return sourceLayers.includes(layerName);
}

function shouldDissolveLayer(
  layerName: string,
  dissolveSeamsLayers?: string[]
): boolean {
  if (!dissolveSeamsLayers || dissolveSeamsLayers.length === 0) return false;
  return dissolveSeamsLayers.includes(layerName);
}

function loadSelfGeometry(this: { geometry: unknown }) {
  return this.geometry;
}

function transformRing(
  ring: TilePoint[],
  scale: number,
  offsetX: number,
  offsetY: number
): TilePoint[] {
  const out = new Array(ring.length);
  for (let p = 0; p < ring.length; p++) {
    const pt = ring[p];
    out[p] = {
      x: Math.round(pt.x / scale + offsetX),
      y: Math.round(pt.y / scale + offsetY),
    };
  }
  return out;
}

function clipGeometryToChildBounds(
  type: number,
  rings: TilePoint[][],
  bounds: ReturnType<typeof childClipBounds>
): TilePoint[][] {
  if (type === MVT_POINT) {
    const pt = rings[0]?.[0];
    if (!pt || !pointInBounds(pt, bounds)) return [];
    return [[pt]];
  }

  if (type === MVT_LINE) {
    const clipped: TilePoint[][] = [];
    for (const ring of rings) {
      for (const segment of clipLineToBounds(ring, bounds)) {
        if (segment.length >= 2) clipped.push(segment);
      }
    }
    return clipped;
  }

  if (type === MVT_POLYGON) {
    const out: TilePoint[][] = [];
    for (const ring of rings) {
      const part = clipRingToBounds(normalizeRing(ring), bounds);
      if (part.length >= 3) out.push(part);
    }
    return out;
  }

  // Unknown geometry type: clip rings like polygons.
  const out: TilePoint[][] = [];
  for (const ring of rings) {
    const part = clipRingToBounds(normalizeRing(ring), bounds);
    if (part.length >= 2) out.push(part);
  }
  return out;
}

/**
 * Merge child MVT tiles at `sourceZoom` into parent tile space at `displayZ`.
 * Stays in tile coordinates (loadGeometry) and re-encodes with vt-pbf directly.
 */
export function mergeChildMvtTiles(
  childTiles: ChildMvtTile[],
  options: MergeChildMvtOptions
): Uint8Array<ArrayBuffer> {
  const {
    displayZ,
    sourceZoom,
    sourceLayers,
    extent = DEFAULT_MVT_EXTENT,
    buffer = DEFAULT_MVT_BUFFER,
    dissolveSeams = false,
    dissolveSeamsLayers,
    onTileError,
  } = options;

  const zoomDiff = sourceZoom - displayZ;
  if (zoomDiff <= 0) {
    throw new Error(
      `sourceZoom (${sourceZoom}) must be greater than displayZ (${displayZ})`
    );
  }

  const scale = 2 ** zoomDiff;
  const cellExtent = extent / scale;

  const mergedLayers: Record<string, MergedLayer> = {};
  let totalFeatures = 0;

  for (let c = 0; c < childTiles.length; c++) {
    const child = childTiles[c];
    if (!child.buffer || child.buffer.byteLength === 0) continue;

    try {
      const tile = new VectorTile(new PbfReader(toArrayBuffer(child.buffer)));
      const layerNames = Object.keys(tile.layers);

      const offsetX = child.relX * cellExtent;
      const offsetY = child.relY * cellExtent;
      const clipBounds = childClipBounds(
        child.relX,
        child.relY,
        scale,
        extent,
        buffer
      );

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

          const transformed: TilePoint[][] = new Array(rawGeometry.length);
          for (let r = 0; r < rawGeometry.length; r++) {
            transformed[r] = transformRing(
              rawGeometry[r],
              scale,
              offsetX,
              offsetY
            );
          }

          const clipped = clipGeometryToChildBounds(
            feature.type,
            transformed,
            clipBounds
          );
          if (clipped.length === 0) continue;

          if (feature.type === MVT_LINE) {
            for (const segment of clipped) {
              targetLayer._features.push({
                type: MVT_LINE,
                geometry: [segment],
                properties: feature.properties ?? EMPTY_PROPERTIES,
                loadGeometry: loadSelfGeometry,
              });
              targetLayer.length++;
              totalFeatures++;
            }
            continue;
          }

          targetLayer._features.push({
            type: feature.type,
            geometry: clipped,
            properties: feature.properties ?? EMPTY_PROPERTIES,
            loadGeometry: loadSelfGeometry,
            relX: child.relX,
            relY: child.relY,
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

  if (dissolveSeams && scale > 1) {
    for (const layerName of Object.keys(mergedLayers)) {
      if (!shouldDissolveLayer(layerName, dissolveSeamsLayers)) continue;

      const layer = mergedLayers[layerName];
      const polygons: MergedFeature[] = [];
      const other: MergedFeature[] = [];

      for (const feature of layer._features) {
        if (feature.type === MVT_POLYGON) polygons.push(feature);
        else other.push(feature);
      }

      if (polygons.length <= 1) continue;

      const dissolved = dissolvePolygonsAtSeams(
        polygons.map((feature) => ({
          geometry: feature.geometry,
          properties: feature.properties,
          relX: feature.relX ?? 0,
          relY: feature.relY ?? 0,
        })),
        scale,
        extent
      );

      const dissolvedFeatures: MergedFeature[] = dissolved.map((feature) => ({
        type: MVT_POLYGON,
        geometry: feature.geometry,
        properties: feature.properties,
        loadGeometry: loadSelfGeometry,
      }));

      layer._features = [...other, ...dissolvedFeatures];
      layer.length = layer._features.length;
    }

    totalFeatures = 0;
    for (const layerName of Object.keys(mergedLayers)) {
      totalFeatures += mergedLayers[layerName]._features.length;
    }
    if (totalFeatures === 0) return new Uint8Array(0);
  }

  for (const layerName of Object.keys(mergedLayers)) {
    const layer = mergedLayers[layerName];
    for (const feature of layer._features) {
      if (feature.type === MVT_POLYGON) {
        feature.geometry = closePolygonRings(feature.geometry);
      }
    }
  }

  const out = vtpbf({ layers: mergedLayers });
  return toOwnedUint8Array(out);
}

type MergedFeature = {
  type: number;
  geometry: TilePoint[][];
  properties: Record<string, unknown>;
  loadGeometry: typeof loadSelfGeometry;
  relX?: number;
  relY?: number;
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
