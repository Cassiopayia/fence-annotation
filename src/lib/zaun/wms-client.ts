/** Client-side WMS GetMap tile URLs. This host never proxies or caches tiles. */

export type DopCatalogEntry = {
  id: string;
  label: string;
  url: string;
  layer: string;
  minzoom?: number;
  maxzoom?: number;
  bounds?: number[];
  format?: string;
  tile_size?: number;
  attribution?: string;
  product?: string;
};

export function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL || './';
  const trimmed = String(path || '').replace(/^\//, '');
  if (base.endsWith('/')) return `${base}${trimmed}`;
  return `${base}/${trimmed}`;
}

function joinWmsUrl(baseUrl: string, params: Record<string, string>): string {
  const raw = String(baseUrl || "").trim();
  const isAbsolute = /^https?:\/\//i.test(raw);
  const url = new URL(raw, "https://placeholder.invalid");
  const templateParams: Array<[string, string]> = [];

  for (const [key, value] of Object.entries(params)) {
    // MapLibre substitutes `{bbox-epsg-3857}` literally. URLSearchParams encodes
    // braces to %7B/%7D, which breaks substitution and yields WMS 400s.
    if (value.includes("{") && value.includes("}")) {
      templateParams.push([key, value]);
      continue;
    }
    url.searchParams.set(key, value);
  }

  let out = isAbsolute
    ? url.toString()
    : `${raw}${raw.includes("?") ? "&" : "?"}${url.searchParams.toString()}`;

  for (const [key, value] of templateParams) {
    out = `${out}${out.includes("?") ? "&" : "?"}${key}=${value}`;
  }
  return out;
}

/** MapLibre raster template — browser fetches official GetMap directly. */
export function wmsGetMapTileUrl(entry: {
  url: string;
  layer: string;
  format?: string;
  tile_size?: number;
}): string {
  const tileSize = Number(entry.tile_size) === 512 ? 512 : 256;
  const format = entry.format || 'image/png';
  return joinWmsUrl(entry.url, {
    SERVICE: 'WMS',
    VERSION: '1.3.0',
    REQUEST: 'GetMap',
    LAYERS: entry.layer,
    STYLES: '',
    CRS: 'EPSG:3857',
    BBOX: '{bbox-epsg-3857}',
    WIDTH: String(tileSize),
    HEIGHT: String(tileSize),
    FORMAT: format,
    TRANSPARENT: 'TRUE',
  });
}

export function catalogToProvider(entry: DopCatalogEntry) {
  return {
    id: `dop-${entry.id}`,
    catalog_id: entry.id,
    name: entry.label,
    url: entry.url,
    layer: entry.layer,
    minzoom: entry.minzoom ?? 14,
    maxzoom: entry.maxzoom ?? 20,
    bounds: entry.bounds,
    format: entry.format,
    tile_size: entry.tile_size,
    attribution: entry.attribution || entry.label,
  };
}

export async function loadDopCatalog(): Promise<DopCatalogEntry[]> {
  const res = await fetch(assetUrl('data/dop_wms_catalog.json'));
  if (!res.ok) throw new Error(`DOP catalog HTTP ${res.status}`);
  const body = await res.json();
  return Array.isArray(body) ? body : [];
}
