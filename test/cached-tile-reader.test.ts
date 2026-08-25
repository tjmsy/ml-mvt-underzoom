import { describe, expect, it, vi } from "vitest";
import { cachedTileReader } from "../src/readers/index.js";
import type { TileReader } from "../src/types.js";

describe("cachedTileReader", () => {
  it("reuses the same promise for repeated z/x/y requests", async () => {
    const readTile = vi.fn<TileReader>(async () => new Uint8Array([1, 2, 3]));
    const cached = cachedTileReader(readTile);

    const [a, b] = await Promise.all([cached(16, 1, 2), cached(16, 1, 2)]);

    expect(readTile).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });
});
