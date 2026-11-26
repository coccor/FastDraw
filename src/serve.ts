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
// O_NOFOLLOW is not defined on Windows; there the realpath checks in inside() are what keep a link out
const NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const WRITABLE = new Set(['.fdraw', '.look']);
const TYPES: Record<string, string> = {
  '.fdraw': 'text/plain; charset=utf-8', '.look': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ttf': 'font/ttf', '.otf': 'font/otf', '.txt': 'text/plain; charset=utf-8',
};

// add: share one more diagram under the same folder (the VS Code extension opens several through one server)
export type Served = { url: string; base: string; port: number; add: (open: string) => void; close: () => Promise<void> };

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

// folder: where the diagrams are (openRoot); open: the diagram to share and open, by its path in the folder
export function serveDiagrams(folder: string, opts: { editor?: string; open?: string; port?: number } = {}): Promise<Served> {
  const root = realpathSync(resolve(folder));
  // what may be listed, read and written, by the path the editor asks for: fixed as each diagram is opened
  const shared = new Set<string>();
  const add = (open: string) => {
    const full = inside(root, open.split('/').map(encodeURIComponent).join('/'));
    if (!full?.toLowerCase().endsWith('.fdraw') || !existsSync(full)) return;
    for (const f of diagramFiles(full, root)) {
      const rel = relative(root, f).split(sep).join('/');
      // only what a request for it would be given: inside the folder, by no hidden part, through no link out
      if (inside(root, rel.split('/').map(encodeURIComponent).join('/'))) shared.add(rel);
    }
  };
  if (opts.open) add(opts.open);
  const editor = new URL(opts.editor ?? DEFAULT_EDITOR);
  const allowed = editor.origin;
  const token = randomBytes(18).toString('base64url');
  const prefix = `/${token}/`;

  const handle = (req: IncomingMessage, res: ServerResponse) => {
    const origin = req.headers.origin;
    const send = (status: number, body: string | Buffer = '', headers: Record<string, string> = {}) => {
      res.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
      res.end(body);
    };
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
        // not through a link (ELOOP), and only to a plain file, whatever replaced it since the checks above
        let fd: number | undefined;
        try {
          fd = openSync(file, constants.O_WRONLY | constants.O_CREAT | NOFOLLOW | constants.O_NONBLOCK, 0o644);
          if (!fstatSync(fd).isFile()) return send(403, 'not a file');
          const body = Buffer.concat(chunks);
          ftruncateSync(fd, 0);
          writeSync(fd, body, 0, body.length, 0);
          const mtime = Math.floor(fstatSync(fd).mtimeMs);
          send(200, JSON.stringify({ mtime }), { 'Content-Type': 'application/json', 'X-Mtime': String(mtime) });
        } catch (e) {
          const link = (e as NodeJS.ErrnoException).code === 'ELOOP';
          send(link ? 403 : 500, link ? 'not written through a link' : (e as Error).message);
        } finally { if (fd !== undefined) closeSync(fd); }
      });
      return;
    }
    send(405);
  };

  return new Promise((ok, fail) => {
    const server = createServer(handle);
    server.on('error', fail);
    server.listen(opts.port ?? 0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port;
      const base = `http://127.0.0.1:${port}/${token}`;
      // after the #, which the browser never sends to the editor's host: the token and path stay on this computer
      const open = new URL(editor);
      const h = new URLSearchParams({ serve: base });
      if (opts.open) h.set('open', opts.open);
      open.hash = h.toString();
      ok({ url: open.href, base, port, add, close: () => new Promise((done) => { server.closeAllConnections(); server.close(() => done()); }) });
    });
  });
}
