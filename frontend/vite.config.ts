import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Baked into the bundle for the info dialog: the SPA's own version and the
// commit it was built from. Comparing the SPA commit against /api/about
// reveals a browser tab running stale assets.
const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
);
let commit = "unknown";
try {
  commit = execSync("git rev-parse --short=12 HEAD").toString().trim();
} catch {
  // A source tree without git still builds.
}

/** The gitreant backend `pnpm dev` proxies the API to. */
const BACKEND = "http://127.0.0.1:4000";

// Assets are served from the Rust binary at the site root; relative base keeps
// them working regardless of the mount path.
export default defineConfig({
  base: "./",
  plugins: [react()],
  define: {
    __SPA_VERSION__: JSON.stringify(pkg.version),
    __SPA_COMMIT__: JSON.stringify(commit),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    // `pnpm dev` proxies the API to a locally running gitreant backend.
    // The backend changes state only for its own origin (ADR 0038), so a
    // request from this dev page is passed on as if gitreant served it;
    // any other origin goes through unchanged and is refused there.
    proxy: {
      "/api": {
        target: BACKEND,
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq, req) => {
            const { origin, host } = req.headers;
            if (origin !== undefined && origin === `http://${host}`) {
              proxyReq.setHeader("origin", BACKEND);
            }
          });
        },
      },
    },
  },
});
