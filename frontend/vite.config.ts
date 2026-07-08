import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Assets are served from the Rust binary at the site root; relative base keeps
// them working regardless of the mount path.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    // `pnpm dev` proxies the API to a locally running gitreant backend.
    proxy: {
      "/api": "http://127.0.0.1:4000",
    },
  },
});
