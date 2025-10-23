import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
// import { TanStackRouterVite } from "@tanstack/router-vite-plugin"; // TODO: Enable in chunk 003
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), /* TanStackRouterVite(), */ react()], // Router plugin disabled until chunk 003
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
});
