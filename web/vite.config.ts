import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
let sha = "";
try { sha = execSync("git rev-parse --short HEAD").toString().trim(); } catch { /* not a git checkout */ }
const buildDate = new Date().toISOString().slice(0, 10);

// Static PWA. `npm run dev` proxies /api to the (optional) Go server on :8899;
// in production the whole thing is static — deploy web/dist to any HTTPS host.
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_SHA__: JSON.stringify(sha),
    __BUILD_DATE__: JSON.stringify(buildDate),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "VuruşKoç — AI destekli tenis vuruş koçu",
        short_name: "VuruşKoç",
        description: "Vuruşunu cihazında analiz et. Video yüklenmez.",
        lang: "tr",
        start_url: "/",
        display: "standalone",
        background_color: "#06080d",
        theme_color: "#06080d",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // precache only the app shell; the big files are runtime-cached on first use
        globPatterns: ["**/*.{js,css,html,woff2,woff,svg}"],
        globIgnores: [
          "**/mediapipe/**", "**/models/**", "**/drills/**", "**/webllm/**",
          "**/assets/webllm-*.js", // opt-in only — never ship it in the base install
        ],
        navigateFallback: "/index.html",
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\/(models|mediapipe|drills|webllm)\//.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "vk-engine-assets-2",
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
              rangeRequests: true,
            },
          },
          {
            // opt-in on-device LLM runtime chunk — cache it once fetched so
            // opted-in users keep working offline (the model shards have their
            // own Cache API store managed by web-llm)
            urlPattern: ({ url }) => /\/assets\/webllm-[\w-]+\.js$/.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "vk-webllm-1",
              expiration: { maxEntries: 3, maxAgeSeconds: 60 * 60 * 24 * 180 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  // web-llm is large and only loaded when the user opts into the on-device model;
  // keep it in its own predictably-named chunk so the PWA precache can skip it.
  optimizeDeps: { exclude: ["@mlc-ai/web-llm"] },
  server: { port: 5180, proxy: { "/api": "http://127.0.0.1:8899" } },
  build: {
    outDir: "dist",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("@mlc-ai/web-llm")) return "webllm";
        },
      },
    },
  },
});
