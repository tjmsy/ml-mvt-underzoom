export type TileCoord = {
  z: number;
  x: number;
  y: number;
};

/** WGS84 bbox [west, south, east, north]. */
export type Bbox = [number, number, number, number];

export type TileReader = (
  z: number,
  x: number,
  y: number
) => Promise<ArrayBuffer | Uint8Array | null | undefined>;

export type BuildUnderzoomMvtOptions = {
  /** Display tile zoom / x / y. */
  z: number;
  x: number;
  y: number;
  /** Zoom level stored in the source archive (e.g. 16 for GSI optimal_bvmap). */
  sourceZoom: number;
  /** Fetch raw MVT bytes. Return null/undefined when the tile is missing. */
  readTile: TileReader;
  /**
   * Source layers to merge. When omitted, all layers found in child tiles are kept.
   */
  sourceLayers?: string[];
  /** MVT extent for merge output (default 4096). */
  extent?: number;
  /** Tile-coordinate buffer on parent exterior edges only (default 64). */
  buffer?: number;
  /** Union polygon halves on internal merge seams (default false). */
  dissolveSeams?: boolean;
  /** Layers to dissolve at internal seams (e.g. ["BldA"]). Required when dissolveSeams is true. */
  dissolveSeamsLayers?: string[];
  /** Abort in-flight tile reads and merge when aborted. */
  signal?: AbortSignal;
  /** Called when a child MVT tile fails to parse during merge. */
  onTileError?: (error: unknown, coord: TileCoord) => void;
};

export type RegisterMvtUnderzoomProtocolOptions = {
  /** Protocol scheme without "://", e.g. "mvt-underzoom". */
  protocol?: string;
  sourceZoom: number;
  readTile: TileReader;
  sourceLayers?: string[];
  extent?: number;
  buffer?: number;
  dissolveSeams?: boolean;
  dissolveSeamsLayers?: string[];
  onTileError?: (error: unknown, coord: TileCoord) => void;
};

export type XyzTileReaderOptions = {
  urlTemplate: string;
  fetch?: typeof fetch;
};

export type PmtilesArchive = {
  getZxy: (
    z: number,
    x: number,
    y: number
  ) => Promise<{ data: ArrayBuffer | Uint8Array } | null | undefined>;
};
