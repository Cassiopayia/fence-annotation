// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// TanStack Start prerender does: concurrency ?? os.cpus().length
// Some sandboxes/CI images report 0 CPUs → Concurrency: 0 → queue never drains → hang.
const realCpus = os.cpus.bind(os);
os.cpus = () => {
  const list = realCpus();
  if (list.length > 0) return list;
  return [
    {
      model: "virtual",
      speed: 0,
      times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 },
    },
  ];
};

// Default `/` for local/root hosts. CI sets BASE_PATH=/<repo>/ for GitHub Pages project sites.
const rawBase = process.env.BASE_PATH ?? "/";
const base = rawBase === "./" ? "./" : rawBase.endsWith("/") ? rawBase : `${rawBase}/`;
const basepath =
  base === "./" || base === "/"
    ? "/"
    : base.replace(/\/$/, "");

export default defineConfig({
  // Static SPA for GitHub Pages / Cloudflare Pages — no Nitro server bundle
  nitro: false,
  tanstackStart: {
    spa: {
      enabled: true,
    },
    prerender: {
      enabled: true,
      crawlLinks: false,
      concurrency: Math.max(os.cpus().length, 1),
    },
    router: {
      basepath: basepath === "/" ? undefined : basepath,
    },
  },
  vite: {
    base,
    // Expose TURNSTILE_* / EMAIL as well as VITE_* (public client config).
    envPrefix: ["VITE_", "TURNSTILE_", "EMAIL"],
    // Native tsconfig paths (vite-tsconfig-paths is still injected by Lovable — harmless duplicate)
    resolve: {
      tsconfigPaths: true,
    },
    optimizeDeps: {
      // Worker URL is pinned in maplibre-setup.ts for Pages base paths.
      exclude: ["maplibre-gl"],
    },
    worker: {
      format: "es",
    },
    plugins: [
      {
        name: "copy-maplibre-worker",
        buildStart() {
          // MapLibre v6 worker is an ES module that imports ./maplibre-gl-shared.mjs
          // relative to itself — both files must sit next to each other on the host.
          // Strip sourceMappingURL so Safari doesn't 404 on missing .map files.
          const dist = path.resolve("node_modules/maplibre-gl/dist");
          const files = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];
          const destDirs = [
            path.resolve("public"),
            path.resolve("public/assets"),
          ];
          for (const file of files) {
            const src = path.join(dist, file);
            if (!fs.existsSync(src)) continue;
            const body = fs
              .readFileSync(src, "utf8")
              .replace(/\n?\/\/[#@]\s*sourceMappingURL=.*$/gm, "\n");
            for (const dir of destDirs) {
              fs.mkdirSync(dir, { recursive: true });
              fs.writeFileSync(path.join(dir, file), body);
            }
          }
        },
      },
    ],
  },
});
