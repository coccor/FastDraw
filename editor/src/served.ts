// A folder lent by `fastdraw open` on this computer. It has the same shape as a folder picked from disk
// (directory and file handles), but reads and writes go over HTTP to that command, so the editor's
// folder code (the look, its fonts and icons, saving, following outside changes) works unchanged.

export type ServedLink = { base: string; open: string };

// `?serve=http://127.0.0.1:PORT/TOKEN&open=a.fdraw`. Only this computer is accepted as the source.
export function servedLink(search: string): ServedLink | null {
  const p = new URLSearchParams(search);
  const s = p.get('serve');
  if (!s) return null;
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)) return null;
  return { base: u.href.replace(/\/+$/, ''), open: p.get('open') ?? '' };
}

const notFound = (name: string) => new DOMException(`${name} is not in the folder`, 'NotFoundError');

class ServedFile {
  readonly kind = 'file';
  constructor(readonly name: string, private readonly url: string) {}
  async getFile(): Promise<File> {
    const r = await fetch(this.url, { cache: 'no-store' });
    if (!r.ok) throw notFound(this.name);
    const m = Number(r.headers.get('X-Mtime')) || Date.now();
    return new File([await r.blob()], this.name, { lastModified: m });
  }
  async createWritable() {
    const parts: BlobPart[] = [];
    const url = this.url;
    return {
      write: async (d: BlobPart) => { parts.push(d); },
      close: async () => {
        const r = await fetch(url, { method: 'PUT', body: new Blob(parts), headers: { 'Content-Type': 'text/plain' } });
        if (!r.ok) throw new Error(r.status === 0 ? '`fastdraw open` has stopped' : `${r.status} ${await r.text()}`);
      },
    };
  }
  async queryPermission() { return 'granted'; }
  async requestPermission() { return 'granted'; }
  async isSameEntry(o: unknown) { return o instanceof ServedFile && o.url === this.url; }
}

class ServedDir {
  readonly kind = 'directory';
  readonly dirs = new Map<string, ServedDir>();
  readonly files = new Map<string, ServedFile>();
  constructor(readonly name: string) {}
  async getDirectoryHandle(n: string) { const d = this.dirs.get(n); if (!d) throw notFound(n); return d; }
  async getFileHandle(n: string) { const f = this.files.get(n); if (!f) throw notFound(n); return f; }
  async *entries(): AsyncGenerator<[string, ServedDir | ServedFile]> {
    yield* this.dirs.entries();
    yield* this.files.entries();
  }
  async queryPermission() { return 'granted'; }
  async requestPermission() { return 'granted'; }
  async isSameEntry(o: unknown) { return o === this; }
}

// The folder as it is now. Files added to it later are not seen until it is opened again.
export async function openServed(base: string): Promise<FileSystemDirectoryHandle> {
  const r = await fetch(base + '/list', { cache: 'no-store' });
  if (!r.ok) throw new Error(`${r.status}`);
  const { files } = (await r.json()) as { files: { path: string }[] };
  const root = new ServedDir(base.slice(base.lastIndexOf('/') + 1));
  for (const { path } of files) {
    const parts = path.split('/');
    let dir = root;
    for (const p of parts.slice(0, -1)) {
      if (!dir.dirs.has(p)) dir.dirs.set(p, new ServedDir(p));
      dir = dir.dirs.get(p)!;
    }
    const name = parts[parts.length - 1];
    dir.files.set(name, new ServedFile(name, base + '/f/' + parts.map(encodeURIComponent).join('/')));
  }
  return root as unknown as FileSystemDirectoryHandle;
}
