import type { Bbox, TileCoord } from "./types.js";

function tileYToLat(yFraction: number): number {
  const n = Math.PI - 2 * Math.PI * yFraction;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/** XYZ tile to WGS84 bbox [west, south, east, north]. */
export function tileToBbox(z: number, x: number, y: number): Bbox {
  const n = 2 ** z;
  const west = (x / n) * 360 - 180;
  const east = ((x + 1) / n) * 360 - 180;
  const north = tileYToLat(y / n);
  const south = tileYToLat((y + 1) / n);
  return [west, south, east, north];
}

/** Child tiles at `childZ` that cover parent tile `(parentZ, parentX, parentY)`. */
export function childTilesForParent(
  parentZ: number,
  parentX: number,
  parentY: number,
  childZ: number,
): TileCoord[] {
  if (childZ < parentZ) {
    throw new Error(`childZ (${childZ}) must be >= parentZ (${parentZ})`);
  }
  const delta = childZ - parentZ;
  const scale = 2 ** delta;
  const minX = parentX * scale;
  const minY = parentY * scale;
  const tiles: TileCoord[] = [];
  for (let dx = 0; dx < scale; dx++) {
    for (let dy = 0; dy < scale; dy++) {
      tiles.push({ z: childZ, x: minX + dx, y: minY + dy });
    }
  }
  return tiles;
}

export function tileKey(tile: TileCoord): string {
  return `${tile.z}/${tile.x}/${tile.y}`;
}
