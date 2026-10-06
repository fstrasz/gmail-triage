import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
// Served by Express under /app, so base must match that prefix.
export default defineConfig({
  base: "/app/",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        // Precache the font and icons too, so an installed PWA opens offline
        // with its own type rather than a fallback face.
        globPatterns: ["**/*.{js,css,html,woff2,png,svg,webmanifest}"],
      },
      // Service worker is generated into the dist directory; Express serves it
      // from the /app/ base path, which is correct for the scope below.
      manifest: {
        name: "Gmail Triage",
        short_name: "Triage",
        description: "Inbox triage for Gmail",
        display: "standalone",
        start_url: "/app/",
        scope: "/app/",
        background_color: "#2f2822",
        theme_color: "#2f2822",
        icons: [
          {
            src: "pwa-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "pwa-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
  build: {
    outDir: "dist",
  },
});
