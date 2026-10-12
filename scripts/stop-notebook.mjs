// Stop the notebook: `node scripts/stop-notebook.mjs [--port 8100]`, which stop-notebook.cmd, .ps1 and .sh call. Only a Tell & Wire
// server is stopped; see editorProcess.mjs.

import { readPort, stopEditor } from './editorProcess.mjs';

try {
  const port = readPort(process.argv.slice(2), 8100);
  console.log(await stopEditor(port, 'notebook') ? 'Notebook stopped.' : `No notebook is running on port ${port}.`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
