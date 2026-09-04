import { useEffect, useState } from "react";
import { MapModule } from "@/lib/zaun/map";
import { getActiveBasemapLayerId } from "@/lib/zaun/imagery-layers";
import { getImagerySnapshot, subscribeImagery } from "@/lib/zaun/imagery-service";

function serviceLabel(layerId: string | null | undefined, zoom: number): string {
  const id = String(layerId || "");
  if (id.startsWith("wms-")) {
    const snap = getImagerySnapshot();
    const hit = snap.dops.find((d) => d.layerId === id || d.active);
    const name = hit?.label?.split("·")[0]?.trim() || "Land DOP";
    if (hit && zoom > hit.maxzoom + 0.05) return `${name} · overzoom`;
    return name;
  }
  if (id === "maxar" || id === "dop20") return "Esri / Maxar";
  if (id === "osm") return "OSM";
  if (id === "basemap") return "basemap.de";
  if (zoom >= 14) return "Land DOP";
  return "basemap.de";
}

/** Live map zoom + active imagery label for the info pill. */
export function useMapHudInfo() {
  const [zoom, setZoom] = useState(6);
  const [service, setService] = useState("basemap.de");

  useEffect(() => {
    let cancelled = false;
    let attached: ReturnType<typeof MapModule.getMap> | null = null;

    const sync = () => {
      const map = MapModule.getMap?.();
      if (!map || cancelled) return;
      const z = Number(map.getZoom?.() ?? 6);
      setZoom(Math.round(z * 10) / 10);
      setService(serviceLabel(getActiveBasemapLayerId(), z));
    };

    const attach = () => {
      const map = MapModule.getMap?.();
      if (!map || cancelled) return false;
      if (attached === map) {
        sync();
        return true;
      }
      if (attached) {
        attached.off("zoom", sync);
        attached.off("zoomend", sync);
        attached.off("moveend", sync);
      }
      attached = map;
      map.on("zoom", sync);
      map.on("zoomend", sync);
      map.on("moveend", sync);
      sync();
      return true;
    };

    attach();
    const poll = window.setInterval(() => {
      attach();
    }, 200);
    const stop = window.setTimeout(() => window.clearInterval(poll), 8000);

    const unsubImagery = subscribeImagery(() => sync());

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      window.clearTimeout(stop);
      unsubImagery();
      if (attached) {
        attached.off("zoom", sync);
        attached.off("zoomend", sync);
        attached.off("moveend", sync);
      }
    };
  }, []);

  const zoomLabel = Number.isInteger(zoom) ? `z${zoom}` : `z${zoom.toFixed(1)}`;
  return { zoom, zoomLabel, service };
}
