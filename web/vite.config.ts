import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const api = process.env.API_URL ?? 'http://localhost:8080'
// RENDER=1 runs a frozen dev server for scripts/render-media.mjs, so edits elsewhere never reload a render mid-way.
const frozen = !!process.env.RENDER

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    hmr: frozen ? false : undefined,
    watch: frozen ? null : undefined,
    proxy: {
      '/api': api,
      '/socket.io': { target: api, ws: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // three.js is only needed by the 3D sections; keep it in its own chunk.
        manualChunks: (id) => (id.includes('node_modules/three') ? 'three' : undefined),
      },
    },
  },
})
