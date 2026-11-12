/** Copy subarrays/views into a standalone ArrayBuffer for Pbf/VectorTile parsers. */
export function toArrayBuffer(data: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return copy.buffer;
}

/** Return an owned Uint8Array, copying when the source is a subarray/view. */
export function toOwnedUint8Array(
  data: ArrayBuffer | Uint8Array
): Uint8Array<ArrayBuffer> {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (
    data.byteOffset === 0 &&
    data.byteLength === data.buffer.byteLength &&
    data.buffer instanceof ArrayBuffer
  ) {
    return data as Uint8Array<ArrayBuffer>;
  }
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return copy;
}
