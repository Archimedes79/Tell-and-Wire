import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import os from 'os'
import { licenses } from './vite.licenses'

// The notebook's page, built on its own: `frontend/notebook/dist`, which `backend/notebook/main.ts` serves. The editor's is
// `vite.config.ts`. Two products, two builds: neither knows the other is there.
export default defineConfig({
  root: path.resolve(__dirname, 'notebook'),
  plugins: [react(), licenses()],
  // Outside node_modules for the same reason as the editor's: a synced folder locks files mid-write.
  cacheDir: path.join(os.tmpdir(), 'tell-and-wire-notebook-vite-cache'),
  build: {
    outDir: path.resolve(__dirname, 'notebook', 'dist'),
    emptyOutDir: true,
  },
  server: {
    // IPv4 explicitly, as the editor's: see `vite.config.ts`.
    fs: { allow: [path.resolve(__dirname, '..')] },
    host: '127.0.0.1',
    port: 3100,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8100',
        changeOrigin: true,
        // The backend answers only its own origin (backend/deployment/host/http.ts `foreignRequest`).
        headers: { origin: 'http://127.0.0.1:8100' },
      },
    },
  },
})
