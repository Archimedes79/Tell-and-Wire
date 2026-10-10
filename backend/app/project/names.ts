// What an id is called on disk.
//
// Its own file so that whatever *describes* a project folder (`flow.ts`) and
// whatever reads and writes one (`folder.ts`) name a node's folder the same way,
// without the one importing the other.

/** Names Windows keeps for devices, with or without an extension: `con` and `con.txt` are no folders. */
const DEVICE_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;

/**
 * A folder name from an id: ids come from the file format and may hold anything.
 * Two ids may still make one name (`x.` and `x_`), which a save refuses (`unsavableIds`).
 */
export function folderName(id: string): string {
  const name = id.replace(/[^\p{L}\p{N}_.-]/gu, '_').replace(/^\.+/, '_').replace(/\.+$/, (dots) => '_'.repeat(dots.length)) || '_';
  return DEVICE_NAME.test(name) ? `_${name}` : name;
}
