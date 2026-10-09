import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// Both dev servers share node_modules; give each its own dep cache so they do not race.
const portArg = process.argv[process.argv.indexOf("--port") + 1] || "default";
export default defineConfig({
  envDir: "..",
  cacheDir: `node_modules/.vite-${portArg}`,
  plugins: [
    react({ babel: { plugins: ["./localize-plugin.cjs"] } }),
    tailwindcss(),
  ],
  server: {
    host: "127.0.0.1",
    strictPort: true,
    // /mnt/* (Windows drives under WSL) does not deliver file-change events.
    watch: { usePolling: true, interval: 300 },
    proxy: {
      "/api": {
        target: process.env.VITE_API_TARGET || "http://127.0.0.1:8000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ["recharts"],
          maps: ["react-leaflet", "leaflet"],
          workflow: ["@xyflow/react"],
        },
      },
    },
  },
});
