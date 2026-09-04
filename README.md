# fency

Phone-first web app for annotating photovoltaic fence lines on aerial imagery.

Deployed as a static SPA (GitHub Pages, Cloudflare Pages, or any static host).

## Stack

- React + TanStack Start (static SPA)
- MapLibre GL + Mapbox Draw
- Client-side Land WMS / Esri / OSM imagery (no tile proxy)
- Supabase RPCs when env is set, otherwise localStorage

## Develop

```sh
npm ci
cp .env.example .env   # fill in values as needed
npm run dev
```

## Build

```sh
# Root host (default)
npm run build

# GitHub Pages project site (repo name as path)
BASE_PATH=/your-repo-name/ npm run build
```

Output: `dist/client/`

## Deploy

GitHub Actions builds and publishes `dist/client` on push to `main`.

Optional repository secrets (for shared annotations):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` — publishable key only, never the secret/`service_role` key  
  (legacy alias `VITE_SUPABASE_ANON_KEY` still works)
- `VITE_BUG_REPORT_URL` — optional; CI sets GitHub Issues automatically


Without Supabase secrets the app still works; saves stay in the browser.
