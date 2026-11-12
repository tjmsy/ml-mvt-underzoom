export type TilePoint = { x: number; y: number };

export type TileClipBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

/**
 * Clip bounds for one child contribution in parent tile space.
 * Buffer applies only on parent exterior edges, not across internal merge seams
 * (MapLibre renders one tile with mask at [0, extent]; buffer is for outer edge only).
 */
export function childClipBounds(
  relX: number,
  relY: number,
  scale: number,
  extent: number,
  buffer: number
): TileClipBounds {
  const cell = extent / scale;
  return {
    minX: relX * cell - (relX === 0 ? buffer : 0),
    minY: relY * cell - (relY === 0 ? buffer : 0),
    maxX: (relX + 1) * cell + (relX === scale - 1 ? buffer : 0),
    maxY: (relY + 1) * cell + (relY === scale - 1 ? buffer : 0),
  };
}

function intersectX(p1: TilePoint, p2: TilePoint, x: number): TilePoint {
  const dx = p2.x - p1.x;
  if (dx === 0) return { x, y: p1.y };
  const t = (x - p1.x) / dx;
  return { x, y: Math.round(p1.y + t * (p2.y - p1.y)) };
}

function intersectY(p1: TilePoint, p2: TilePoint, y: number): TilePoint {
  const dy = p2.y - p1.y;
  if (dy === 0) return { x: p1.x, y };
  const t = (y - p1.y) / dy;
  return { x: Math.round(p1.x + t * (p2.x - p1.x)), y };
}

type Edge = "left" | "right" | "top" | "bottom";

function inside(p: TilePoint, edge: Edge, b: TileClipBounds): boolean {
  switch (edge) {
    case "left":
      return p.x >= b.minX;
    case "right":
      return p.x <= b.maxX;
    case "top":
      return p.y >= b.minY;
    case "bottom":
      return p.y <= b.maxY;
  }
}

function intersect(
  p1: TilePoint,
  p2: TilePoint,
  edge: Edge,
  b: TileClipBounds
): TilePoint {
  switch (edge) {
    case "left":
      return intersectX(p1, p2, b.minX);
    case "right":
      return intersectX(p1, p2, b.maxX);
    case "top":
      return intersectY(p1, p2, b.minY);
    case "bottom":
      return intersectY(p1, p2, b.maxY);
  }
}

/** Sutherland–Hodgman clip of a closed or open ring to an axis-aligned box. */
export function clipRingToBounds(
  ring: TilePoint[],
  bounds: TileClipBounds
): TilePoint[] {
  if (ring.length === 0) return [];

  let output = ring;
  const edges: Edge[] = ["left", "right", "top", "bottom"];

  for (const edge of edges) {
    if (output.length === 0) return [];
    const input = output;
    output = [];

    for (let i = 0; i < input.length; i++) {
      const current = input[i];
      const previous = input[i === 0 ? input.length - 1 : i - 1];
      const currIn = inside(current, edge, bounds);
      const prevIn = inside(previous, edge, bounds);

      if (currIn) {
        if (!prevIn) {
          output.push(intersect(previous, current, edge, bounds));
        }
        output.push(current);
      } else if (prevIn) {
        output.push(intersect(previous, current, edge, bounds));
      }
    }
  }

  return output;
}

function outcode(p: TilePoint, b: TileClipBounds): number {
  let code = 0;
  if (p.x < b.minX) code |= 1;
  else if (p.x > b.maxX) code |= 2;
  if (p.y < b.minY) code |= 4;
  else if (p.y > b.maxY) code |= 8;
  return code;
}

/** Clip one segment to bounds; returns null when fully outside. */
export function clipSegmentToBounds(
  a: TilePoint,
  b: TilePoint,
  bounds: TileClipBounds
): [TilePoint, TilePoint] | null {
  let x0 = a.x;
  let y0 = a.y;
  let x1 = b.x;
  let y1 = b.y;
  let code0 = outcode({ x: x0, y: y0 }, bounds);
  let code1 = outcode({ x: x1, y: y1 }, bounds);

  while (true) {
    if ((code0 | code1) === 0) {
      return [
        { x: Math.round(x0), y: Math.round(y0) },
        { x: Math.round(x1), y: Math.round(y1) },
      ];
    }
    if (code0 & code1) return null;

    const out = code0 !== 0 ? code0 : code1;
    let x: number;
    let y: number;
    if (out & 8) {
      x = x0 + ((x1 - x0) * (bounds.maxY - y0)) / (y1 - y0);
      y = bounds.maxY;
    } else if (out & 4) {
      x = x0 + ((x1 - x0) * (bounds.minY - y0)) / (y1 - y0);
      y = bounds.minY;
    } else if (out & 2) {
      y = y0 + ((y1 - y0) * (bounds.maxX - x0)) / (x1 - x0);
      x = bounds.maxX;
    } else {
      y = y0 + ((y1 - y0) * (bounds.minX - x0)) / (x1 - x0);
      x = bounds.minX;
    }

    if (out === code0) {
      x0 = x;
      y0 = y;
      code0 = outcode({ x: x0, y: y0 }, bounds);
    } else {
      x1 = x;
      y1 = y;
      code1 = outcode({ x: x1, y: y1 }, bounds);
    }
  }
}

/** Clip a line ring (open polyline) to bounds; may return multiple segments. */
export function clipLineToBounds(
  line: TilePoint[],
  bounds: TileClipBounds
): TilePoint[][] {
  if (line.length < 2) return [];

  const segments: TilePoint[][] = [];
  let current: TilePoint[] = [];

  for (let i = 0; i < line.length - 1; i++) {
    const clipped = clipSegmentToBounds(line[i], line[i + 1], bounds);
    if (!clipped) {
      if (current.length >= 2) {
        segments.push(current);
        current = [];
      }
      continue;
    }

    const [start, end] = clipped;
    if (current.length === 0) {
      current.push(start, end);
    } else {
      const last = current[current.length - 1];
      if (last.x === start.x && last.y === start.y) {
        current.push(end);
      } else {
        segments.push(current);
        current = [start, end];
      }
    }
  }

  if (current.length >= 2) segments.push(current);
  return segments;
}

export function pointInBounds(p: TilePoint, bounds: TileClipBounds): boolean {
  return (
    p.x >= bounds.minX &&
    p.x <= bounds.maxX &&
    p.y >= bounds.minY &&
    p.y <= bounds.maxY
  );
}

/** Drop MVT closing duplicate and consecutive repeated vertices. */
export function normalizeRing(ring: TilePoint[]): TilePoint[] {
  if (ring.length <= 1) return ring;

  let open = ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first.x === last.x && first.y === last.y) {
    open = ring.slice(0, -1);
  }

  const out: TilePoint[] = [];
  for (const p of open) {
    const prev = out[out.length - 1];
    if (!prev || prev.x !== p.x || prev.y !== p.y) out.push(p);
  }
  return out;
}

/** Close a ring for MVT encoding (vt-pbf requires an explicit closing vertex). */
export function closeRing(ring: TilePoint[]): TilePoint[] {
  if (ring.length === 0) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first.x === last.x && first.y === last.y) return ring;
  return [...ring, first];
}

export function closePolygonRings(rings: TilePoint[][]): TilePoint[][] {
  return rings.map(closeRing);
}
