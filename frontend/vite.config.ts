import { defineConfig, searchForWorkspaceRoot } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const localWorkerCsp = "default-src 'none'; script-src 'self'; connect-src 'none'; img-src 'none'; style-src 'none'; font-src 'none'; worker-src 'none'; object-src 'none'"
const isLocalWorker = (url: string) =>
  /^\/src\/lib\/(?:regexSearch\.worker|mathWorker|dbmlWorker)\.ts\?/.test(url) ||
  /^\/assets\/(?:regexSearch\.worker|mathWorker|dbmlWorker)-[^/]+\.js$/.test(url)

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), {
    name: 'dot-worker-response-policy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/src/lib/dotWorker.ts?')) res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'none'; worker-src 'none'")
        if (isLocalWorker(req.url ?? '')) res.setHeader('Content-Security-Policy', localWorkerCsp)
        next()
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        if (/^\/assets\/dotWorker-[^/]+\.js$/.test(req.url ?? '')) res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'none'; worker-src 'none'")
        if (isLocalWorker(req.url ?? '')) res.setHeader('Content-Security-Policy', localWorkerCsp)
        next()
      })
    },
  }],

  // Path resolution for TypeScript imports
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    // Dynamic raw license imports need explicit access outside the frontend root.
    // https://vite.dev/config/server-options.html#server-fs-allow
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), fileURLToPath(new URL('../notices', import.meta.url))] },
    port: 5173,
    strictPort: true,
    host: "127.0.0.1", // Keep development-only endpoints local
  },
  
  // 3. to make use of `TAURI_DEBUG` and other env variables
  // https://tauri.app/v1/api/config#buildconfig.beforedevcommand
  envPrefix: ["VITE_", "TAURI_"],
  
  // 4. Build configuration
  build: {
    // Keep app fonts self-hosted under the existing font-src policy. Export's
    // explicit ?inline imports remain embedded independently.
    assetsInlineLimit: 0,
    // Tauri supports es2021
    target: process.env.TAURI_PLATFORM == "windows" ? "chrome105" : "safari13",
    // don't minify for debug builds
    minify: !process.env.TAURI_DEBUG,
    // produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_DEBUG,
  },
}));
