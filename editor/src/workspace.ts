// The open diagrams, kept in the browser (IndexedDB) so a reload or a closed tab loses nothing.
// Each diagram is stored whole on every change: its text, look, undo history and view, plus
// the file handles when it came from disk, so it can be written back there after a reload.

import type { Folder, Handle } from './files.ts';

export type View = { x: number; y: number; k: number };
export type StoredDoc = {
  id: string;
  name: string;
  src: string;
  look: string | null;
  carried: Record<string, string>; // icon images carried inside an opened PNG or SVG
  view: View;
  past: string[];
  future: string[];
  file?: Handle;
  lookFile?: Handle;
  folder?: Folder;
  path?: string;
  written: string; // the text last written to (or read from) the file, to tell later which side changed
  updated: number;
};
type Meta = { id: 'tabs'; order: string[]; active: string | null };

const DB = 'fastdraw', DOCS = 'docs', META = 'meta';
const KEEP_HISTORY = 100;

let opening: Promise<IDBDatabase | null> | null = null;
function db(): Promise<IDBDatabase | null> {
  opening ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(DOCS, { keyPath: 'id' });
        req.result.createObjectStore(META, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); } // storage blocked (private mode in some browsers): work without it
  });
  return opening;
}

function run(store: string, write: (s: IDBObjectStore) => void): Promise<void> {
  return db().then((d) => new Promise<void>((resolve, reject) => {
    if (!d) { reject(new Error('this browser does not allow storing data for this page')); return; }
    const tx = d.transaction(store, 'readwrite');
    write(tx.objectStore(store));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('storage error'));
    tx.onabort = () => reject(tx.error ?? new Error('storage full'));
  }));
}

function all<T>(store: string): Promise<T[]> {
  return db().then((d) => new Promise<T[]>((resolve) => {
    if (!d) { resolve([]); return; }
    const req = d.transaction(store, 'readonly').objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => resolve([]);
  }));
}

export async function loadAll(): Promise<{ docs: StoredDoc[]; active: string | null }> {
  const [docs, metas] = await Promise.all([all<StoredDoc>(DOCS), all<Meta>(META)]);
  const meta = metas.find((m) => m.id === 'tabs');
  const rank = new Map((meta?.order ?? []).map((id, i) => [id, i]));
  docs.sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9) || a.updated - b.updated);
  return { docs, active: meta?.active ?? null };
}

export function putDoc(doc: StoredDoc): Promise<void> {
  const d = { ...doc, past: doc.past.slice(-KEEP_HISTORY), future: doc.future.slice(-KEEP_HISTORY), updated: Date.now() };
  return run(DOCS, (s) => s.put(d)).catch((e) => {
    // a handle that cannot be stored should not cost the text: keep the diagram without it
    if ((e as Error).name !== 'DataCloneError') throw e;
    return run(DOCS, (s) => s.put({ ...d, file: undefined, lookFile: undefined, folder: undefined }));
  });
}

export const removeDoc = (id: string) => run(DOCS, (s) => s.delete(id)).catch(() => {});
export const putTabs = (order: string[], active: string | null) => run(META, (s) => s.put({ id: 'tabs', order, active } satisfies Meta)).catch(() => {});
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
