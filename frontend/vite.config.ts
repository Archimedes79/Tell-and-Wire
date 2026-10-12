import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
import path from 'path'
import os from 'os'
import { licenses } from './vite.licenses'

export default defineConfig({
  plugins: [react(), licenses()],
  // The version the packages say, for the editor's About.
  define: { __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')).version) },
  // Dropbox syncs this workspace and locks files mid-write, causing EBUSY
  // errors when Vite's dep cache lives under node_modules/.vite. Keep it outside.
  cacheDir: path.join(os.tmpdir(), 'tell-and-wire-editor-vite-cache'),
  build: {
    rollupOptions: {
      // Two entry points, one bundle of shared chunks (the notebook is built by `vite.notebook.config.ts`, a page of its own): index.html is the
      // editor, gui.html is what a deployed graph serves (see
      // deployment/gui/GuiApp.tsx). They share every widget component, which
      // is the point -- a deployed tool renders through the same code the
      // designer previewed.
      input: {
        index: path.resolve(__dirname, 'index.html'),
        gui: path.resolve(__dirname, 'gui.html'),
      },
    },
  },
  server: {
    // Bind IPv4 explicitly. Node 17+ stopped reordering DNS results, so Vite's
    // default `localhost` resolves to ::1 and binds IPv6 ONLY -- which leaves
    // http://127.0.0.1:3000 dead while http://localhost:3000 works, and that is
    // a miserable thing to debug.
    // The graph and the backend are outside the page's root, so the dev
    // server has to be told it may read them.
    fs: { allow: [path.resolve(__dirname, '..')] },
    host: '127.0.0.1',
    port: 3000,
    proxy: {
      '/api': {
        // The address the backend binds (`serve.ts`), not `localhost`: where that
        // resolves to ::1 first, the page would load and its API calls would not.
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        // The backend answers only its own origin (backend/deployment/host/http.ts `foreignRequest`);
        // the dev page on :3000 is the editor all the same.
        headers: { origin: 'http://127.0.0.1:8000' },
      },
    },
  },
})
