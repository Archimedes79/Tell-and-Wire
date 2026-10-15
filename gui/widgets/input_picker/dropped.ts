// A file dropped onto a file picker: where it is on the machine the tool runs on.
//
// A browser hands a page a dropped file's name, size and content, never where it is. The path comes from the drop where it names one (a `file:` URI,
// which some browsers give), and otherwise from the host, which is asked for the one file of that name and size under the folder the tool runs
// in (`findFile`, `backend/deployment/host/api.ts`). Neutral, as the pickers it is for are: the notebook's and a delivered tool's each draw their
// own drop target and call this to say what was dropped.

/** What a drop says of the file dropped. */
export interface DroppedFile {
  name: string;
  size: number;
  /** Where it is, when the drop said: a `file:` URI. */
  uri?: string;
}

/** What is needed of a browser's `DataTransfer`: not its type, so that this file needs no DOM. */
interface Transfer {
  files?: ArrayLike<{ name: string; size: number }> | null;
  types?: ArrayLike<string> | null;
  getData(format: string): string;
}

/** A drag that carries files: one to take on. */
export const carriesFiles = (transfer: { types?: ArrayLike<string> | null } | null): boolean => !!transfer?.types && Array.from(transfer.types).includes('Files');

/** The first file a drop brings, or none. Read while the drop lasts: afterwards the browser has taken the transfer back. */
export function droppedFile(transfer: Transfer | null): DroppedFile | undefined {
  const file = transfer?.files?.[0];
  if (!transfer || !file) return undefined;
  const uri = transfer.getData('text/uri-list').split(/\r?\n/).find((line) => line.startsWith('file:'));
  return { name: file.name, size: file.size, ...(uri ? { uri } : {}) };
}

/**
 * The path a `file:` URI names: `file:///D:/data/a.csv` is `D:/data/a.csv`, `file:///home/a.csv` is `/home/a.csv` -- and a share on another
 * machine, `file://server/share/a.csv`, is `//server/share/a.csv`, which Windows opens as `\server\share\a.csv`.
 */
export function uriPath(uri: string): string {
  const url = new URL(uri);
  const path = decodeURIComponent(url.pathname);
  if (url.host) return `//${url.host}${path}`;
  return /^\/[A-Za-z]:\//.test(path) ? path.slice(1) : path;
}

/** How a dropped file is looked for (`findFile`): the files found, and where it looked, in words. */
export type FindFile = (name: string, size: number) => Promise<{ paths: string[]; searched: string }>;

/**
 * Where *file* is: the path its drop named, else the one file of its name and size that *find* finds. None, or several, is said -- none with
 * where it looked -- with the way that always works.
 */
export async function droppedPath(file: DroppedFile, find: FindFile): Promise<string> {
  if (file.uri) return uriPath(file.uri);
  const { paths, searched } = await find(file.name, file.size);
  if (paths.length === 1) return paths[0];
  throw new Error(paths.length
    ? `${paths.length} files called “${file.name}” are that size: choose the one you mean with Browse….`
    : `A browser does not say where a dropped file is, and no “${file.name}” of that size is in ${searched}: choose it with Browse….`);
}
