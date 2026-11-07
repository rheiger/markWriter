import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  build: {
    target: 'safari15',
    lib: { entry: fileURLToPath(new URL('./src/lib/quickLookRender.ts', import.meta.url)), name: 'MarkWriterQuickLook', formats: ['iife'], fileName: () => 'quicklook-render.js' },
    rollupOptions: { output: { inlineDynamicImports: true } },
    minify: true,
    sourcemap: false,
  },
})
