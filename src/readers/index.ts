import { toArrayBuffer } from "../buffer.js";
import type {
  PmtilesArchive,
  TileReader,
  XyzTileReaderOptions,
} from "../types.js";

/** Build a TileReader from an XYZ URL template with `{z}` `{x}` `{y}` placeholders. */
export function xyzTileReader(options: XyzTileReaderOptions): TileReader {
  const fetchFn = options.fetch ?? globalThis.fetch;
  if (!fetchFn) {
    throw new Error(
      "xyzTileReader requires fetch (pass options.fetch in Node)"
    );
  }

  return async (z, x, y) => {
    const url = options.urlTemplate
      .replaceAll("{z}", String(z))
      .replaceAll("{x}", String(x))
      .replaceAll("{y}", String(y));
    const response = await fetchFn(url);
    if (!response.ok) return null;
    return toArrayBuffer(await response.arrayBuffer());
  };
}

/** Build a TileReader from a PMTiles archive (`getZxy`). */
export function pmtilesTileReader(archive: PmtilesArchive): TileReader {
  return async (z, x, y) => {
    const response = await archive.getZxy(z, x, y);
    if (!response?.data) return null;
    return toArrayBuffer(response.data);
  };
}

/**
 * Wrap a TileReader with a per-instance in-memory cache keyed by `z/x/y`.
 * Useful when adjacent parent tiles share child source tiles during pan.
 */
export function cachedTileReader(readTile: TileReader): TileReader {
  const cache = new Map<string, ReturnType<TileReader>>();

  return (z, x, y) => {
    const key = `${z}/${x}/${y}`;
    let pending = cache.get(key);
    if (!pending) {
      pending = readTile(z, x, y);
      cache.set(key, pending);
    }
    return pending;
  };
}
