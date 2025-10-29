import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { TanStackRouterVite } from "@tanstack/router-vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    TanStackRouterVite(),
    react(),
    VitePWA({
      registerType: "prompt", // Changed from 'autoUpdate' to allow user control
      includeAssets: ["icons/*.png", "splash/*.jpg", "offline.html"],
      manifest: {
        name: "Household Hub - Financial Tracker",
        short_name: "HouseholdHub",
        description: "Offline-first household financial tracker",
        theme_color: "#1e40af",
        background_color: "#ffffff",
        display: "standalone",
        display_override: ["window-controls-overlay", "standalone", "minimal-ui"],
        orientation: "any",
        lang: "en-US",
        dir: "ltr",
        scope: "/",
        start_url: "/?source=pwa",
        categories: ["finance", "productivity"],
        icons: [
          {
            src: "/icons/icon-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        shortcuts: [
          {
            name: "Add Transaction",
            short_name: "Add",
            description: "Quickly add a new transaction",
            url: "/transactions/new",
            icons: [
              {
                src: "/icons/shortcut-add.png",
                sizes: "96x96",
              },
            ],
          },
          {
            name: "View Dashboard",
            short_name: "Dashboard",
            description: "View your financial dashboard",
            url: "/dashboard",
            icons: [
              {
                src: "/icons/shortcut-dashboard.png",
                sizes: "96x96",
              },
            ],
          },
        ],
      },
      workbox: {
        // Cache all static assets
        globPatterns: ["**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,woff,woff2}"],

        // Don't cache these
        globIgnores: ["**/node_modules/**/*"],

        // Increase the maximum file size to cache (default is 2MB)
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB

        // Runtime caching strategies
        runtimeCaching: [
          // Supabase API - Network First
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-api-cache",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 5 * 60, // 5 minutes
              },
              cacheableResponse: {
                statuses: [0, 200],
                // Validate response headers to prevent cache poisoning
                headers: {
                  "content-type": "application/json",
                },
              },
            },
          },

          // Supabase Storage - Cache First
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "supabase-storage-cache",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
              },
            },
          },

          // Authentication endpoints - Network Only (NEVER cache sensitive data)
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/auth\/.*/i,
            handler: "NetworkOnly",
          },

          // Google Fonts - Stale While Revalidate
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "google-fonts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
            },
          },
        ],

        // Navigate fallback for offline
        navigateFallback: "/offline.html",
        navigateFallbackDenylist: [/^\/api\//],

        // Cleanup old caches
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        enabled: true,
        type: "module",
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
  },
  build: {
    target: "esnext",
    sourcemap: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
  },
});
