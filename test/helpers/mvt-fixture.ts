import { toOwnedUint8Array } from "../../src/buffer.js";
import vtpbf from "vt-pbf";

function loadSelfGeometry(this: { geometry: unknown }) {
  return this.geometry;
}

/** Build a minimal line MVT tile for tests (tile coordinate space). */
export function lineTileMvt(
  layerName: string,
  points: { x: number; y: number }[],
  properties: Record<string, unknown> = { vt_code: 2201 }
): Uint8Array<ArrayBuffer> {
  const layer = {
    name: layerName,
    extent: 4096,
    version: 2,
    length: 1,
    _keys: [] as string[],
    _values: [] as unknown[],
    _features: [
      {
        type: 2,
        geometry: [points],
        properties,
        loadGeometry: loadSelfGeometry,
      },
    ],
    feature(i: number) {
      return this._features[i];
    },
  };

  return toOwnedUint8Array(vtpbf({ layers: { [layerName]: layer } }));
}

/** Build a minimal polygon MVT tile for tests (tile coordinate space). */
export function polygonTileMvt(
  layerName: string,
  ring: { x: number; y: number }[],
  properties: Record<string, unknown> = { vt_code: 3101 }
): Uint8Array<ArrayBuffer> {
  const first = ring[0];
  const last = ring[ring.length - 1];
  const closedRing =
    first.x === last.x && first.y === last.y ? ring : [...ring, first];

  const layer = {
    name: layerName,
    extent: 4096,
    version: 2,
    length: 1,
    _keys: [] as string[],
    _values: [] as unknown[],
    _features: [
      {
        type: 3,
        geometry: [closedRing],
        properties,
        loadGeometry: loadSelfGeometry,
      },
    ],
    feature(i: number) {
      return this._features[i];
    },
  };

  return toOwnedUint8Array(vtpbf({ layers: { [layerName]: layer } }));
}
