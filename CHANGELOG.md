# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-08-29

### Added

- Clip child geometry at internal merge seams so quadrant halves do not overlap (`tile-clip`).
- Optional `dissolveSeams` and `dissolveSeamsLayers` on `buildUnderzoomMvt`, `mergeChildMvtTiles`, and `registerMvtUnderzoomProtocol` — union polygon halves on internal seams for cleaner building outlines.
- Runtime dependency on [`polygon-clipping`](https://www.npmjs.com/package/polygon-clipping) (used only when seam dissolve is enabled).

### Fixed

- Close polygon rings before vt-pbf encode — open rings after clip/dissolve caused SW corners to collapse into triangles.
- ESM default import for `polygon-clipping` (Vite / browser demos).

### Changed

- `dissolveSeams` defaults to `false` — opt in per layer via `dissolveSeamsLayers` (e.g. `["BldA"]`) to keep pan/zoom responsive.
- Seam dissolve matches pairs by child tile position (`relX`/`relY` buckets) instead of scanning all polygons per tile.

### Notes

- Line-only underzoom (roads, etc.) is largely unchanged from 0.1.0.
- Polygon output differs from 0.1.0 even without dissolve (seam clipping + closed rings). Re-test polygon fill/outline styles after upgrading.

## [0.1.0] - 2026-08-29

### Added

- `buildUnderzoomMvt` — synthesize MVT at a display zoom below `sourceZoom`.
- `mergeChildMvtTiles` — low-level MVT-native merge of child tiles into parent tile space.
- Tile readers: `pmtilesTileReader`, `xyzTileReader`, `cachedTileReader`.
- MapLibre helpers: `registerMvtUnderzoomProtocol`, `mvtUnderzoomTilesUrl`.
- Tile math helpers: `childTilesForParent`, `tileKey`, `tileToBbox`.
- Pass-through when `z === sourceZoom`; parallel child tile fetch.
- `onTileError` callback and `AbortSignal` support on merge / protocol paths.
- `sideEffects: false` for bundler tree-shaking.

[0.2.0]: https://github.com/tjmsy/ml-mvt-underzoom/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/tjmsy/ml-mvt-underzoom/releases/tag/v0.1.0
