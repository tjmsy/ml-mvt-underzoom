/**
 * MapLibre + Vite: worker must be bundled via `?worker&url`.
 * @see https://maplibre.org/maplibre-gl-js/docs/#vite
 */
import "maplibre-gl/dist/maplibre-gl.css";
import * as maplibregl from "maplibre-gl";
import { setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

setWorkerUrl(workerUrl);

export { maplibregl };
