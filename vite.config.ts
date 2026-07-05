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
    // autoCodeSplitting: each route's component graph becomes its own chunk,
    // so heavy per-route dependencies (recharts, analytics dashboards, CSV
    // machinery) stop shipping in the entry bundle (review UI-03)
    TanStackRouterVite({ autoCodeSplitting: true }),
    react(),
    VitePWA({
      strategies: "injectManifest", // Custom SW with push handlers (chunk 043)
      srcDir: "src",
      filename: "sw.ts",
      registerType: "prompt", // Changed from 'autoUpdate' to allow user control
      // offline.html is intentionally NOT listed here: the injectManifest
      // "**/*.html" glob already precaches it, and listing it twice created
      // duplicate precache entries.
      includeAssets: ["icons/*.png", "splash/*.jpg"],
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
      // injectManifest configuration (custom SW in src/sw.ts handles caching)
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,woff,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB
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
    // "hidden": maps are generated for upload to error tooling but not
    // referenced from the bundles - shipping public maps exposed the full
    // source of a privacy-focused finance app (review UI-03)
    sourcemap: "hidden",

    // Emit .vite/manifest.json so scripts/check-bundle-size.mjs can walk the
    // static import graph and enforce the entry-bundle budget (review UI-03)
    manifest: true,

    // Chunk size warnings
    chunkSizeWarningLimit: 500, // Warn if chunk > 500KB

    // No manualChunks: the hand-rolled vendor grouping forced heavy packages
    // (all of lucide-react, several radix packages) into a single eagerly
    // loaded ~186KB chunk and produced an empty vendor-react chunk (review
    // UI-03). With autoCodeSplitting on, Rollup's default per-route splitting
    // co-locates each dependency with the route that first needs it and
    // hoists genuinely shared modules automatically. Default [name]-[hash]
    // chunk names keep stable long-term caching.

    // Minification settings
    minify: "esbuild", // Faster than terser, good compression
    cssMinify: true,

    // Enable tree-shaking
    modulePreload: {
      polyfill: true,
    },
  },
  test: {
    environment: "jsdom",
    env: {
      VITE_SUPABASE_URL: "https://test.supabase.co",
      VITE_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-anon-key",
    },
    globals: true,
    testTimeout: 15000, // IndexedDB integration tests need more than the 5s default
    setupFiles: "./src/test/setup.ts",
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/cypress/**",
      "**/.{idea,git,cache,output,temp}/**",
      "**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*",
      "**/tests/e2e/**", // Exclude Playwright E2E tests
    ],
  },
});
