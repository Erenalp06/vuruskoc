import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Static PWA. `npm run dev` proxies /api to the (optional) Go server on :8899;
// in production the whole thing is static — deploy web/dist to any HTTPS host.
export default defineConfig({
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
        globIgnores: ["**/mediapipe/**", "**/models/**", "**/drills/**"],
        navigateFallback: "/index.html",
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\/(models|mediapipe|drills)\//.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "vk-engine-assets-2",
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
              rangeRequests: true,
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { port: 5180, proxy: { "/api": "http://127.0.0.1:8899" } },
  build: { outDir: "dist" },
});
