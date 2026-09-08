/**
 * Pin MapLibre's module worker to a stable public URL.
 *
 * MapLibre v6 ships `maplibre-gl-worker.mjs` which imports `./maplibre-gl-shared.mjs`.
 * Vite's default worker URL lands under hashed `/assets/…` (404 on Pages), so we
 * host both files under `public/` and point MapLibre at the public worker URL.
 * Must use the same `maplibre-gl` module instance as `map.ts` (namespace import).
 */
import * as maplibregl from "maplibre-gl";

let ready = false;

function workerPublicUrl(): string {
  const base = import.meta.env.BASE_URL || "/";
  return new URL("maplibre-gl-worker.mjs", window.location.origin + base).href;
}

export function ensureMapLibreWorker(): void {
  if (ready || typeof window === "undefined") return;
  ready = true;
  const url = workerPublicUrl();
  try {
    maplibregl.setWorkerUrl(url);
  } catch (err) {
    console.warn("[maplibre] setWorkerUrl failed", err);
  }
  // Also poke config in case a build renames the helper.
  try {
    if (maplibregl.config) maplibregl.config.WORKER_URL = url;
  } catch (_) {}
}

if (typeof window !== "undefined") {
  ensureMapLibreWorker();
}
