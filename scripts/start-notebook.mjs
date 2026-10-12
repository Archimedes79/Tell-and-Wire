// Start the notebook: `node scripts/start-notebook.mjs [--port 8100]`, which start-notebook.cmd, .ps1 and .sh call.
//
// Its own page (`frontend/notebook/dist`), its own server file (`backend/notebook/main.ts`), its own port, so that it and the editor
// can both be open. What every product does is in launch.mjs.

import { launch } from './launch.mjs';

await launch({
  name: 'notebook',
  port: 8100,
  page: 'frontend/notebook/dist/index.html',
  buildInputs: [
    'package.json', 'package-lock.json', 'frontend/package.json', 'frontend/notebook/index.html',
    'frontend/tsconfig.json', 'frontend/tsconfig.node.json', 'frontend/vite.notebook.config.ts', 'frontend/vite.licenses.ts', 'frontend/tailwind.config.js', 'frontend/postcss.config.js',
  ],
  sources: ['frontend/notebook', 'frontend/gui-notebook', 'frontend/graph-notebook', 'graph', 'gui', 'backend'],
  buildScript: 'build:notebook',
  server: ['backend/notebook/main.ts'],
}, process.argv.slice(2));
