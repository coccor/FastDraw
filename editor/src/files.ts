// Reading and writing diagram files from the browser.
// With the File System Access API (Chrome, Edge) files are saved in place and re-read to
// notice outside changes. Elsewhere the editor works in memory and saving downloads a copy.

export const hasFileAccess = typeof window !== 'undefined' && 'showOpenFilePicker' in window;

export type Handle = FileSystemFileHandle;
export type Folder = { root: FileSystemDirectoryHandle; files: string[] };

const SKIP = new Set(['node_modules', '.git', 'dist', 'bin', 'obj', '.next', 'target']);

async function walk(dir: FileSystemDirectoryHandle, prefix: string, depth: number, out: string[]): Promise<void> {
  if (depth > 6 || out.length > 500) return;
  // @ts-expect-error: entries() is not in the bundled DOM types
  for await (const [name, h] of dir.entries()) {
    if (h.kind === 'directory') { if (!SKIP.has(name) && !name.startsWith('.')) await walk(h, prefix + name + '/', depth + 1, out); }
    else if (name.endsWith('.fdraw')) out.push(prefix + name);
  }
}

export async function scanFolder(root: FileSystemDirectoryHandle): Promise<Folder> {
  const files: string[] = [];
  await walk(root, '', 0, files);
  files.sort();
  return { root, files };
}

export async function pickFolder(): Promise<Folder> {
  // @ts-expect-error: showDirectoryPicker is not in the bundled DOM types
  const root: FileSystemDirectoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
  return scanFolder(root);
}

// Resolve "a/b/../c.look" against a folder. Returns null when it points outside the folder or is missing.
export async function resolveIn(root: FileSystemDirectoryHandle, path: string): Promise<Handle | null> {
  const parts: string[] = [];
  for (const seg of path.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') { if (!parts.length) return null; parts.pop(); } else parts.push(seg);
  }
  try {
    let dir = root;
    for (const seg of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(seg);
    return await dir.getFileHandle(parts[parts.length - 1]);
  } catch { return null; }
}

export const dirOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '');

export async function pickFile(kind: 'diagram' | 'look'): Promise<Handle> {
  const types = kind === 'diagram'
    ? [{ description: 'FastDraw diagram, or an image exported from FastDraw', accept: { 'text/plain': ['.fdraw'], 'image/png': ['.png'], 'image/svg+xml': ['.svg'] } }]
    : [{ description: 'FastDraw look', accept: { 'text/plain': ['.look'] } }];
  // @ts-expect-error: showOpenFilePicker is not in the bundled DOM types
  const [h] = await window.showOpenFilePicker({ types, excludeAcceptAllOption: false });
  return h;
}

export async function ensureWritable(h: Handle): Promise<boolean> {
  try {
    // @ts-expect-error: permission methods are not in the bundled DOM types
    if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
    // @ts-expect-error
    return (await h.requestPermission({ mode: 'readwrite' })) === 'granted';
  } catch { return true; } // origin-private files have no permission prompt
}

// Whether a handle kept from an earlier visit can still be written without asking.
export async function hasAccess(h: FileSystemHandle): Promise<boolean> {
  try {
    // @ts-expect-error: permission methods are not in the bundled DOM types
    return (await h.queryPermission({ mode: 'readwrite' })) === 'granted';
  } catch { return true; } // origin-private files have no permission prompt
}

// Ask again (needs a click). For a folder this covers the diagram, its look and fonts at once.
export async function askAccess(h: FileSystemHandle): Promise<boolean> {
  try {
    // @ts-expect-error: permission methods are not in the bundled DOM types
    return (await h.requestPermission({ mode: 'readwrite' })) === 'granted';
  } catch { return true; }
}

export async function sameFile(a: Handle | undefined, b: Handle): Promise<boolean> {
  try { return !!a && await a.isSameEntry(b); } catch { return false; }
}

export async function readHandle(h: Handle): Promise<{ text: string; modified: number }> {
  const f = await h.getFile();
  return { text: await f.text(), modified: f.lastModified };
}

export async function writeHandle(h: Handle, text: string): Promise<number> {
  const w = await h.createWritable();
  await w.write(text);
  await w.close();
  return (await h.getFile()).lastModified;
}

export function download(name: string, data: string | Blob, type = 'text/plain'): void {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function pickUpload(accept: string, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = accept; input.multiple = multiple;
    input.onchange = () => resolve([...(input.files ?? [])]);
    input.click();
  });
}

// The TTF and OTF files in a folder inside the opened folder, e.g. the look's `fontdir`.
export async function readFontDir(root: FileSystemDirectoryHandle, path: string, ext = /\.(ttf|otf)$/i, maxBytes = Infinity, maxFiles = Infinity): Promise<{ name: string; bytes: Uint8Array }[]> {
  const parts: string[] = [];
  for (const seg of path.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') { if (!parts.length) return []; parts.pop(); } else parts.push(seg);
  }
  const out: { name: string; bytes: Uint8Array }[] = [];
  try {
    let dir = root;
    for (const seg of parts) dir = await dir.getDirectoryHandle(seg);
    // @ts-expect-error: entries() is not in the bundled DOM types
    for await (const [name, h] of dir.entries()) {
      if (h.kind !== 'file' || !ext.test(name) || out.length >= maxFiles) continue;
      const f = await h.getFile();
      if (f.size <= maxBytes) out.push({ name, bytes: new Uint8Array(await f.arrayBuffer()) });
    }
  } catch { /* folder missing */ }
  return out;
}
