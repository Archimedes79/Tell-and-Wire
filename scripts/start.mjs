// Start the editor: `node scripts/start.mjs [--port 8000]`, which start.cmd, start.ps1 and start.sh call.
//
// What is the editor's own is here; what every product does is in launch.mjs. The notebook has a start file of its own
// (`start-notebook.mjs`), and neither names the other.

import { launch } from './launch.mjs';

await launch({
  name: 'editor',
  port: 8000,
  page: 'frontend/dist/index.html',
  buildInputs: [
    'package.json', 'package-lock.json', 'frontend/package.json', 'frontend/index.html', 'frontend/gui.html',
    'frontend/tsconfig.json', 'frontend/tsconfig.node.json', 'frontend/vite.config.ts', 'frontend/vite.licenses.ts', 'frontend/tailwind.config.js', 'frontend/postcss.config.js',
  ],
  sources: ['frontend/editor', 'frontend/deployment', 'graph', 'gui', 'backend'],
  buildScript: 'build',
  server: ['backend/cli/main.ts', '--editor', 'frontend/dist'],
}, process.argv.slice(2));
