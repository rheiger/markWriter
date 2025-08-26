import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  
  // Tauri expects a fixed port for development
  server: {
    port: 5173,
    strictPort: true,
    host: '0.0.0.0',
  },

  // Build configuration
  build: {
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          editor: ['@toast-ui/react-editor', '@toast-ui/editor'],
          ui: ['lucide-react', 'clsx'],
        },
      },
    },
  },

  // Path resolution
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/components': path.resolve(__dirname, './src/components'),
      '@/hooks': path.resolve(__dirname, './src/hooks'),
      '@/store': path.resolve(__dirname, './src/store'),
      '@/types': path.resolve(__dirname, './src/types'),
      '@/utils': path.resolve(__dirname, './src/utils'),
    },
  },

  // Dependencies optimization
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'zustand',
      'react-router-dom',
      '@tauri-apps/api',
      '@tauri-apps/plugin-fs',
      '@tauri-apps/plugin-dialog',
      '@tauri-apps/plugin-notification',
    ],
  },

  // Development features
  esbuild: {
    target: 'esnext',
  },

  // CSS configuration
  css: {
    postcss: './postcss.config.js',
  },
})
