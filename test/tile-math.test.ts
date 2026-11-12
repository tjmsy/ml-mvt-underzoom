import { describe, expect, it } from "vitest";
import { childTilesForParent, tileToBbox } from "../src/tile-math.js";

describe("childTilesForParent", () => {
  it("returns four children for one zoom step", () => {
    const children = childTilesForParent(15, 29123, 12901, 16);
    expect(children).toHaveLength(4);
    expect(children).toEqual(
      expect.arrayContaining([
        { z: 16, x: 58246, y: 25802 },
        { z: 16, x: 58247, y: 25802 },
        { z: 16, x: 58246, y: 25803 },
        { z: 16, x: 58247, y: 25803 },
      ])
    );
  });
});

describe("tileToBbox", () => {
  it("returns west < east and south < north", () => {
    const [west, south, east, north] = tileToBbox(15, 29123, 12901);
    expect(west).toBeLessThan(east);
    expect(south).toBeLessThan(north);
  });
});
