import { readFile, writeFile } from "node:fs/promises";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import { TanStackRouterVite } from "@tanstack/router-vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

/**
 * Cloudflare Pages serves public/_headers as is, so the assistant Worker's origin
 * is added to the built copy's connect-src from VITE_ASSISTANT_URL, the variable
 * that turns the assistant on. Unset, the CSP stays as written.
 */
function allowAssistantOrigin(): Plugin {
  let assistantUrl: string | undefined;
  let headersPath = "";
  return {
    name: "allow-assistant-origin",
    apply: "build",
    configResolved(config) {
      assistantUrl = config.env.VITE_ASSISTANT_URL || undefined;
      headersPath = path.resolve(config.root, config.build.outDir, "_headers");
    },
    async closeBundle() {
      if (!assistantUrl) return;
      const origin = new URL(assistantUrl).origin;
      const headers = await readFile(headersPath, "utf8");
      if (headers.includes(`connect-src 'self' ${origin}`)) return;
      if (!headers.includes("connect-src 'self'")) {
        throw new Error("_headers has no connect-src 'self' to add the assistant's origin to.");
      }
      await writeFile(
        headersPath,
        headers.replace("connect-src 'self'", `connect-src 'self' ${origin}`)
      );
    },
  };
}

// Tests that need a DOM. Everything else runs in the faster node environment.
const jsdomTests = [
  "**/*.test.tsx",
  "src/hooks/**/*.test.ts",
  "src/components/**/*.test.ts",
  "**/*.dom.test.ts",
];

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    allowAssistantOrigin(),
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
      // splash/ is intentionally NOT listed either: iOS fetches
      // apple-touch-startup-image at the OS level (outside the service
      // worker), so precaching the ~1.5MB splash set would only bloat SW
      // install. See the matching globIgnores below.
      includeAssets: ["icons/*.png"],
      manifest: {
        name: "Household Hub - Financial Tracker",
        short_name: "HouseholdHub",
        description: "Offline-first household financial tracker",
        theme_color: "#f9f6f2",
        background_color: "#f9f6f2",
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
      },
      // injectManifest configuration (custom SW in src/sw.ts handles caching)
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,woff,woff2}"],
        // Keep the iOS splash set (public/splash/, ~92 PNGs / ~1.5MB) out of
        // the precache manifest: startup images are requested by iOS itself,
        // not through the service worker, so precaching them is pure waste.
        globIgnores: ["splash/**"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB
      },
      devOptions: {
        enabled: true,
        type: "module",
      },
    }),
  ],
  // The statement import worker (src/lib/import/parse.worker.ts) is an ES
  // module chunk, so the PWA's **/*.js precache glob picks it up.
  worker: {
    format: "es",
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
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
    // UI-03). With autoCodeSplitting on, the bundler's default per-route splitting
    // co-locates each dependency with the route that first needs it and
    // hoists genuinely shared modules automatically. Default [name]-[hash]
    // chunk names keep stable long-term caching.

    // Minification settings
    cssMinify: true,

    // Enable tree-shaking
    modulePreload: {
      polyfill: true,
    },
  },
  test: {
    env: {
      VITE_SUPABASE_URL: "https://test.supabase.co",
      VITE_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-anon-key",
    },
    globals: true,
    testTimeout: 15000, // IndexedDB integration tests need more than the 5s default
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/cypress/**",
      "**/.{idea,git,cache,output,temp}/**",
      "**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*",
      "**/tests/e2e/**", // Exclude Playwright E2E tests
      ".claude/**", // Other worktrees' checkouts
    ],
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          setupFiles: "./src/test/setup.node.ts",
          exclude: jsdomTests,
        },
      },
      {
        extends: true,
        test: {
          name: "jsdom",
          environment: "jsdom",
          setupFiles: "./src/test/setup.ts",
          include: jsdomTests,
        },
      },
    ],
  },
});
