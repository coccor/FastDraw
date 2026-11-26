// `fastdraw open`: lend one diagram to the browser editor, so a diagram written on this computer opens
// on the web with its look, fonts and icons, and edits there are saved back to the file.
//
// The server listens on 127.0.0.1 only, under a random token, and answers only the editor's own origin.
// It shares only the diagrams it was asked to open and the files each needed at that moment (diagramFiles:
// its look file, that look's dark look, their font and icon files), all inside one folder. The set is fixed
// when a diagram is opened, so nothing written through the server can widen it; a diagram switched to
// another look file on disk loads that look after `fastdraw open` runs again. It lists and reads nothing
// else, and writes only those diagrams and look files. Whole folders are not shared (2026-11-26).
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, realpathSync, existsSync, openSync, closeSync, fstatSync, writeSync, ftruncateSync, constants } from 'node:fs';
import { resolve, sep, extname, dirname, relative } from 'node:path';
import { randomBytes } from 'node:crypto';
import { diagramFiles } from './node.ts';

export const DEFAULT_EDITOR = 'https://fastdraw.dev/edit/';

const MAX_WRITE = 2 * 1024 * 1024;
// O_NOFOLLOW is not defined on Windows; there the realpath checks in inside() are what keep a link out, and a
// file swapped for a link between those checks and the open is not caught. That needs another process already
// writing to the folder during a save, which could do more harm directly.
const NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const WRITABLE = new Set(['.fdraw', '.look']);
const TYPES: Record<string, string> = {
  '.fdraw': 'text/plain; charset=utf-8', '.look': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ttf': 'font/ttf', '.otf': 'font/otf', '.txt': 'text/plain; charset=utf-8',
};

// add: share one more diagram under the same folder (the VS Code extension opens several through one server)
export type Served = { url: string; base: string; port: number; add: (open: string) => void; close: () => Promise<void> };

// Whether `rel` reaches its file under `root` with no link on the way: its real path is the path itself. For a
// file that is not there (deleted since it was opened), its folder's path is checked instead.
// Letter case is compared loosely where the file system ignores it (Windows, macOS). The check runs just before
// the open, not as one step with it: a folder on the way swapped for a link in between is not caught. That needs
// another process already writing to the folder, which could read or change those files directly.
const FOLD = process.platform === 'win32' || process.platform === 'darwin';
const same = (a: string, b: string) => (FOLD ? a.toLowerCase() === b.toLowerCase() : a === b);
function linkFree(root: string, rel: string): boolean {
  const full = resolve(root, ...rel.split('/'));
  try { return same(realpathSync(full), full); }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') return false;
    try { return same(realpathSync(dirname(full)), dirname(full)); } catch { return false; }
  }
}

// The file a request names, or null when it would leave the folder (by "..", a hidden part or a link).
function inside(root: string, rel: string): string | null {
  const parts = rel.split('/').map((p) => { try { return decodeURIComponent(p); } catch { return '\0'; } });
  if (!parts.length || parts.some((p) => !p || p.startsWith('.') || p.includes('\0') || p.includes('\\') || p.includes(sep))) return null;
  const full = resolve(root, ...parts);
  if (!full.startsWith(root + sep)) return null;
  try {
    // the folder it sits in, with every link resolved, must be inside; so must the file itself if it exists
    const parent = realpathSync(dirname(full));
    if (parent !== root && !parent.startsWith(root + sep)) return null;
    if (existsSync(full) && !realpathSync(full).startsWith(root + sep)) return null;
  } catch { return null; }
  return full;
}

// The editor's own files, for `local`: the build of the edit page in dist-local/ (vite.local.config.ts).
const EDITOR_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.png': 'image/png', '.json': 'application/json',
};
// a file of the editor's build by its path under the token, or null; the build holds no links or hidden files
function editorFile(dir: string, rel: string): string | null {
  if (rel === 'edit/' || rel === 'edit') rel = 'edit/index.html';
  if (!/^(edit\/index\.html|assets\/[\w.-]+|favicon\.svg)$/.test(rel)) return null;
  const full = resolve(dir, rel);
  return full.startsWith(resolve(dir) + sep) && existsSync(full) ? full : null;
}

// The port `fastdraw open` asks for first, so the local editor's browser storage (kept per address) is the same
// from one run to the next; when it is taken (another `fastdraw open` running), any free port.
export const LOCAL_PORT = 47821;

// folder: where the diagrams are (openRoot); open: the diagram to share and open, by its path in the folder.
// local: the folder of the editor's own build; the server then serves the editor too, on its own address, and
// nothing is asked of another site. port: the port to try first, falling back to any free one.
export function serveDiagrams(folder: string, opts: { editor?: string; open?: string; port?: number; local?: string } = {}): Promise<Served> {
  const root = realpathSync(resolve(folder));
  // what may be listed, read and written, by the path the editor asks for: fixed as each diagram is opened
  const shared = new Set<string>();
  const add = (open: string) => {
    const full = inside(root, open.split('/').map(encodeURIComponent).join('/'));
    if (!full?.toLowerCase().endsWith('.fdraw') || !existsSync(full)) return;
    for (const f of diagramFiles(full, root)) {
      const rel = relative(root, f).split(sep).join('/');
      // only what a request for it would be given: inside the folder, by no hidden part, and through no link
      // anywhere on its path (a linked folder could lead to a hidden one, and reads refuse a linked file)
      if (inside(root, rel.split('/').map(encodeURIComponent).join('/')) && linkFree(root, rel)) shared.add(rel);
    }
  };
  if (opts.open) add(opts.open);
  // the editor's address; for a local one it is known once the port is
  let editor = new URL(opts.editor ?? DEFAULT_EDITOR);
  let allowed = editor.origin;
  let hosts: string[] = [];
  const token = randomBytes(18).toString('base64url');
  const prefix = `/${token}/`;

  const handle = (req: IncomingMessage, res: ServerResponse) => {
    const origin = req.headers.origin;
    const send = (status: number, body: string | Buffer = '', headers: Record<string, string> = {}) => {
      res.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
      res.end(body);
    };
    // asked for by this computer's own name only: a web page whose name was pointed at 127.0.0.1 gets nothing
    if (!hosts.includes(req.headers.host ?? '')) return send(403, 'not this host');
    // only the editor may read through this; other pages get nothing they can use
    if (origin !== undefined && origin !== allowed) return send(403, 'not this origin');
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Expose-Headers', 'X-Mtime');
    }
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (!url.pathname.startsWith(prefix)) return send(404);
    const rest = url.pathname.slice(prefix.length);

    if (req.method === 'OPTIONS') {
      return send(204, '', {
        'Access-Control-Allow-Methods': 'GET, PUT',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Private-Network': 'true',
        'Access-Control-Max-Age': '600',
      });
    }
    if (opts.local && req.method === 'GET') {
      const f = editorFile(opts.local, rest);
      if (f) return send(200, readFileSync(f), { 'Content-Type': EDITOR_TYPES[extname(f).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    }
    if (rest === 'list' && req.method === 'GET') {
      return send(200, JSON.stringify({ files: [...shared].sort().map((path) => ({ path })) }), { 'Content-Type': 'application/json' });
    }
    if (!rest.startsWith('f/')) return send(404);
    const rel = rest.slice(2);
    const file = inside(root, rel);
    if (!file) return send(403, 'outside the folder');
    let name: string;
    try { name = rel.split('/').map(decodeURIComponent).join('/'); } catch { return send(403, 'not shared'); }
    if (!shared.has(name)) return send(403, 'not shared: only the opened diagram and the files it needs are');
    // checked again now: a folder on the way may have been swapped for a link since the diagram was opened
    if (!linkFree(root, name)) return send(403, 'not through a link');

    if (req.method === 'GET') {
      // opened without following a link, so a file swapped for one after the checks above is refused
      let fd: number | undefined;
      try {
        fd = openSync(file, constants.O_RDONLY | NOFOLLOW | constants.O_NONBLOCK);
        const s = fstatSync(fd);
        if (!s.isFile()) return send(404);
        return send(200, readFileSync(fd), { 'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', 'X-Mtime': String(Math.floor(s.mtimeMs)) });
      } catch { return send(404); }
      finally { if (fd !== undefined) closeSync(fd); }
    }
    if (req.method === 'PUT') {
      if (!WRITABLE.has(extname(file).toLowerCase())) return send(403, 'only .fdraw and .look files are written');
      const chunks: Buffer[] = [];
      let size = 0;
      req.on('data', (c: Buffer) => { size += c.length; if (size <= MAX_WRITE) chunks.push(c); });
      req.on('end', () => {
        if (size > MAX_WRITE) return send(413, 'too large');
        // not through a link (ELOOP), only to a plain file, whatever replaced it since the checks above, and only
        // one that is still there: a shared file deleted since it was opened is not made again
        let fd: number | undefined;
        try {
          fd = openSync(file, constants.O_WRONLY | NOFOLLOW | constants.O_NONBLOCK);
          if (!fstatSync(fd).isFile()) return send(403, 'not a file');
          const body = Buffer.concat(chunks);
          ftruncateSync(fd, 0);
          writeSync(fd, body, 0, body.length, 0);
          const mtime = Math.floor(fstatSync(fd).mtimeMs);
          send(200, JSON.stringify({ mtime }), { 'Content-Type': 'application/json', 'X-Mtime': String(mtime) });
        } catch (e) {
          const code = (e as NodeJS.ErrnoException).code;
          if (code === 'ELOOP') send(403, 'not written through a link');
          else if (code === 'ENOENT') send(404, 'the file was deleted after `fastdraw open` started; run it again');
          else send(500, (e as Error).message);
        } finally { if (fd !== undefined) closeSync(fd); }
      });
      return;
    }
    send(405);
  };

  return new Promise((ok, fail) => {
    const server = createServer(handle);
    let tried = false;
    server.on('error', (e: NodeJS.ErrnoException) => {
      // the preferred port is taken: any free one
      if (e.code === 'EADDRINUSE' && opts.port && !tried) { tried = true; server.listen(0, '127.0.0.1'); }
      else fail(e);
    });
    server.listen(opts.port ?? 0, '127.0.0.1');
    server.on('listening', () => {
      const port = (server.address() as { port: number }).port;
      hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
      const base = `http://127.0.0.1:${port}/${token}`;
      if (opts.local) { editor = new URL(base + '/edit/'); allowed = editor.origin; }
      // after the #, which the browser never sends to the editor's host: the token and path stay on this computer
      const open = new URL(editor);
      const h = new URLSearchParams({ serve: base });
      if (opts.open) h.set('open', opts.open);
      open.hash = h.toString();
      ok({ url: open.href, base, port, add, close: () => new Promise((done) => { server.closeAllConnections(); server.close(() => done()); }) });
    });
  });
}
