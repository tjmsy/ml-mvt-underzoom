import { buildUnderzoomMvt } from "../retile.js";
import type { RegisterMvtUnderzoomProtocolOptions } from "../types.js";

export type MaplibreWithProtocol = {
  addProtocol: (
    scheme: string,
    loadFn: (
      params: { url: string },
      abortController?: AbortController,
    ) => Promise<{ data: ArrayBuffer }>,
  ) => void;
};

const registeredProtocols = new Set<string>();

function parseProtocolUrl(
  protocol: string,
  url: string,
): { z: number; x: number; y: number } {
  const re = new RegExp(`^${protocol}:\\/\\/(\\d+)\\/(\\d+)\\/(\\d+)`);
  const match = re.exec(url);
  if (!match) {
    throw new Error(`invalid ${protocol} url: ${url}`);
  }
  return {
    z: Number(match[1]),
    x: Number(match[2]),
    y: Number(match[3]),
  };
}

/**
 * Register a MapLibre custom protocol that serves underzoomed MVT tiles.
 *
 * Source example:
 * `{ "type": "vector", "tiles": ["mvt-underzoom://{z}/{x}/{y}"], "minzoom": 15, "maxzoom": 16 }`
 */
export function registerMvtUnderzoomProtocol(
  maplibregl: MaplibreWithProtocol,
  options: RegisterMvtUnderzoomProtocolOptions,
): string {
  const protocol = options.protocol ?? "mvt-underzoom";
  if (!registeredProtocols.has(protocol)) {
    maplibregl.addProtocol(protocol, async (params, abortController) => {
      if (abortController?.signal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      const { z, x, y } = parseProtocolUrl(protocol, params.url);
      const data = await buildUnderzoomMvt({
        z,
        x,
        y,
        sourceZoom: options.sourceZoom,
        readTile: options.readTile,
        sourceLayers: options.sourceLayers,
        extent: options.extent,
        buffer: options.buffer,
        signal: abortController?.signal,
        onTileError: options.onTileError,
      });
      const bytes =
        data.byteOffset === 0 && data.byteLength === data.buffer.byteLength
          ? data.buffer
          : data.buffer.slice(
              data.byteOffset,
              data.byteOffset + data.byteLength,
            );
      return { data: bytes };
    });
    registeredProtocols.add(protocol);
  }
  return protocol;
}

/** Test helper: clear protocol registration guard. */
export function resetMvtUnderzoomProtocolForTests(): void {
  registeredProtocols.clear();
}

export function mvtUnderzoomTilesUrl(protocol = "mvt-underzoom"): string {
  return `${protocol}://{z}/{x}/{y}`;
}
