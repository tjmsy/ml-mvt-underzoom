import polygonClipping from "polygon-clipping";
import type { MultiPolygon, Polygon } from "polygon-clipping";
import { normalizeRing, type TilePoint } from "./tile-clip.js";

export type InternalSeams = {
  x: number[];
  y: number[];
};

/** Internal merge seam coordinates in parent tile space (not parent exterior). */
export function internalSeamLines(
  scale: number,
  extent: number
): InternalSeams {
  const x: number[] = [];
  const y: number[] = [];
  if (scale <= 1) return { x, y };

  const cell = extent / scale;
  for (let k = 1; k < scale; k++) {
    const seam = k * cell;
    x.push(seam);
    y.push(seam);
  }
  return { x, y };
}

export type PolygonFeatureLike = {
  geometry: TilePoint[][];
  properties: Record<string, unknown>;
  /** Child quadrant X in parent tile (0 .. scale-1). */
  relX: number;
  /** Child quadrant Y in parent tile (0 .. scale-1). */
  relY: number;
};

type Bbox = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

function ringsToPolygon(rings: TilePoint[][]): Polygon {
  return rings.map((ring) =>
    normalizeRing(ring).map((p): [number, number] => [p.x, p.y])
  );
}

function multiPolygonToFeatures(
  multi: MultiPolygon,
  properties: Record<string, unknown>,
  relX: number,
  relY: number
): PolygonFeatureLike[] {
  const features: PolygonFeatureLike[] = [];
  for (const polygon of multi) {
    const rings = polygon.map((ring) =>
      ring.map((p) => ({ x: Math.round(p[0]), y: Math.round(p[1]) }))
    );
    if (rings.length > 0 && rings[0].length >= 3) {
      features.push({ geometry: rings, properties, relX, relY });
    }
  }
  return features;
}

function polygonBbox(geometry: TilePoint[][]): Bbox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const ring of geometry) {
    for (const p of ring) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }

  return { minX, minY, maxX, maxY };
}

function propKey(properties: Record<string, unknown>): string {
  const keys = Object.keys(properties).sort();
  if (keys.length === 0) return "";
  return keys.map((k) => `${k}\0${String(properties[k])}`).join("\0");
}

function spansOverlap(
  a: { min: number; max: number },
  b: { min: number; max: number }
): boolean {
  return a.min <= b.max && b.min <= a.max;
}

function verticalSeamSpan(
  ring: TilePoint[],
  seamX: number
): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  let found = false;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    if (a.x === seamX && b.x === seamX) {
      found = true;
      min = Math.min(min, a.y, b.y);
      max = Math.max(max, a.y, b.y);
    }
  }
  return found ? { min, max } : null;
}

function horizontalSeamSpan(
  ring: TilePoint[],
  seamY: number
): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  let found = false;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    if (a.y === seamY && b.y === seamY) {
      found = true;
      min = Math.min(min, a.x, b.x);
      max = Math.max(max, a.x, b.x);
    }
  }
  return found ? { min, max } : null;
}

function ringsOverlapOnVerticalSeam(
  geomA: TilePoint[][],
  geomB: TilePoint[][],
  seamX: number
): boolean {
  for (const ringA of geomA) {
    const spanA = verticalSeamSpan(ringA, seamX);
    if (!spanA) continue;
    for (const ringB of geomB) {
      const spanB = verticalSeamSpan(ringB, seamX);
      if (spanB && spansOverlap(spanA, spanB)) return true;
    }
  }
  return false;
}

function ringsOverlapOnHorizontalSeam(
  geomA: TilePoint[][],
  geomB: TilePoint[][],
  seamY: number
): boolean {
  for (const ringA of geomA) {
    const spanA = horizontalSeamSpan(ringA, seamY);
    if (!spanA) continue;
    for (const ringB of geomB) {
      const spanB = horizontalSeamSpan(ringB, seamY);
      if (spanB && spansOverlap(spanA, spanB)) return true;
    }
  }
  return false;
}

class UnionFind {
  parent: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }

  find(i: number): number {
    if (this.parent[i] !== i) {
      this.parent[i] = this.find(this.parent[i]);
    }
    return this.parent[i];
  }

  union(i: number, j: number): void {
    const rootI = this.find(i);
    const rootJ = this.find(j);
    if (rootI !== rootJ) this.parent[rootI] = rootJ;
  }
}

function hasSeamCandidates(bboxes: Bbox[], seams: InternalSeams): boolean {
  for (let i = 0; i < bboxes.length; i++) {
    const b = bboxes[i];
    for (const seamX of seams.x) {
      if (b.maxX === seamX || b.minX === seamX) return true;
    }
    for (const seamY of seams.y) {
      if (b.maxY === seamY || b.minY === seamY) return true;
    }
  }
  return false;
}

function pushBucket(
  buckets: Map<string, number[]>,
  key: string,
  index: number
): void {
  const bucket = buckets.get(key);
  if (bucket) bucket.push(index);
  else buckets.set(key, [index]);
}

/**
 * Union polygon halves that meet on an internal merge seam (same properties).
 * Only compares polygons on opposite sides of each seam — not O(n^2) over the layer.
 */
export function dissolvePolygonsAtSeams(
  features: PolygonFeatureLike[],
  scale: number,
  extent: number
): PolygonFeatureLike[] {
  if (features.length <= 1 || scale <= 1) return features;

  const seams = internalSeamLines(scale, extent);
  if (seams.x.length === 0 && seams.y.length === 0) return features;

  const bboxes = features.map((feature) => polygonBbox(feature.geometry));
  if (!hasSeamCandidates(bboxes, seams)) return features;

  const uf = new UnionFind(features.length);
  const cell = extent / scale;

  for (let k = 1; k < scale; k++) {
    const seamX = k * cell;
    const leftBuckets = new Map<string, number[]>();
    const rightBuckets = new Map<string, number[]>();

    for (let i = 0; i < features.length; i++) {
      const b = bboxes[i];
      const key = propKey(features[i].properties);
      if (features[i].relX === k - 1 && b.maxX === seamX) {
        pushBucket(leftBuckets, key, i);
      }
      if (features[i].relX === k && b.minX === seamX) {
        pushBucket(rightBuckets, key, i);
      }
    }

    for (const [key, leftIdxs] of leftBuckets) {
      const rightIdxs = rightBuckets.get(key);
      if (!rightIdxs) continue;
      for (const li of leftIdxs) {
        for (const ri of rightIdxs) {
          if (
            ringsOverlapOnVerticalSeam(
              features[li].geometry,
              features[ri].geometry,
              seamX
            )
          ) {
            uf.union(li, ri);
          }
        }
      }
    }
  }

  for (let k = 1; k < scale; k++) {
    const seamY = k * cell;
    const topBuckets = new Map<string, number[]>();
    const bottomBuckets = new Map<string, number[]>();

    for (let i = 0; i < features.length; i++) {
      const b = bboxes[i];
      const key = propKey(features[i].properties);
      if (features[i].relY === k - 1 && b.maxY === seamY) {
        pushBucket(topBuckets, key, i);
      }
      if (features[i].relY === k && b.minY === seamY) {
        pushBucket(bottomBuckets, key, i);
      }
    }

    for (const [key, topIdxs] of topBuckets) {
      const bottomIdxs = bottomBuckets.get(key);
      if (!bottomIdxs) continue;
      for (const ti of topIdxs) {
        for (const bi of bottomIdxs) {
          if (
            ringsOverlapOnHorizontalSeam(
              features[ti].geometry,
              features[bi].geometry,
              seamY
            )
          ) {
            uf.union(ti, bi);
          }
        }
      }
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < features.length; i++) {
    const root = uf.find(i);
    let group = groups.get(root);
    if (!group) {
      group = [];
      groups.set(root, group);
    }
    group.push(i);
  }

  const out: PolygonFeatureLike[] = [];
  for (const indices of groups.values()) {
    if (indices.length === 1) {
      out.push(features[indices[0]]);
      continue;
    }

    let merged: MultiPolygon = [ringsToPolygon(features[indices[0]].geometry)];
    const relX = features[indices[0]].relX;
    const relY = features[indices[0]].relY;
    for (let k = 1; k < indices.length; k++) {
      merged = polygonClipping.union(
        merged,
        ringsToPolygon(features[indices[k]].geometry)
      );
    }
    out.push(
      ...multiPolygonToFeatures(
        merged,
        features[indices[0]].properties,
        relX,
        relY
      )
    );
  }

  return out;
}
