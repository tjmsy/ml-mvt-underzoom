import { toOwnedUint8Array } from "./buffer.js";
import {
  DEFAULT_MVT_BUFFER,
  DEFAULT_MVT_EXTENT,
} from "./mvt-constants.js";
import { mergeChildMvtTiles } from "./merge-child-mvt.js";
import { childTilesForParent } from "./tile-math.js";
import type { BuildUnderzoomMvtOptions } from "./types.js";

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
}

/**
 * Build an MVT for display zoom `z` by merging source tiles at `sourceZoom`.
 * When `z >= sourceZoom`, returns the source tile unchanged (pass-through).
 */
export async function buildUnderzoomMvt(
  options: BuildUnderzoomMvtOptions,
): Promise<Uint8Array<ArrayBuffer>> {
  const {
    z,
    x,
    y,
    sourceZoom,
    readTile,
    sourceLayers,
    extent = DEFAULT_MVT_EXTENT,
    buffer = DEFAULT_MVT_BUFFER,
    dissolveSeams,
    dissolveSeamsLayers,
    signal,
    onTileError,
  } = options;

  throwIfAborted(signal);

  if (z > sourceZoom) {
    throw new Error(
      `display zoom ${z} is above sourceZoom ${sourceZoom}; overzoom is handled by MapLibre`,
    );
  }

  if (z === sourceZoom) {
    const passthrough = await readTile(z, x, y);
    throwIfAborted(signal);
    if (passthrough == null) return new Uint8Array(0);
    return toOwnedUint8Array(passthrough);
  }

  const children = childTilesForParent(z, x, y, sourceZoom);
  const scale = 2 ** (sourceZoom - z);

  const childTiles = await Promise.all(
    children.map(async (child) => {
      throwIfAborted(signal);
      const raw = await readTile(child.z, child.x, child.y);
      throwIfAborted(signal);
      return {
        coord: child,
        relX: child.x - x * scale,
        relY: child.y - y * scale,
        buffer: raw,
      };
    }),
  );

  return mergeChildMvtTiles(childTiles, {
    displayZ: z,
    sourceZoom,
    sourceLayers,
    extent,
    buffer,
    dissolveSeams,
    dissolveSeamsLayers,
    onTileError,
  });
}
