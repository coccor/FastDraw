// `fastdraw open`: lend one diagram to the browser editor, so a diagram written on this computer opens
// on the web with its look, fonts and icons, and edits there are saved back to the file.
//
// The server listens on 127.0.0.1 only, under a random token, and answers only the editor's own origin.
// It shares only the diagrams it was asked to open and the files each one needs (diagramFiles: its look
// file, that look's dark look, their font and icon files), all inside one folder; it lists and reads
// nothing else, and writes only those diagrams and look files. Whole folders are not shared (2026-11-26).
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, writeFileSync, statSync, lstatSync, realpathSync, existsSync } from 'node:fs';
import { join, resolve, sep, extname, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { diagramFiles } from './node.ts';

export const DEFAULT_EDITOR = 'https://fastdraw.dev/edit/';

const MAX_WRITE = 2 * 1024 * 1024;
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
  const opened = new Set<string>();
  const add = (open: string) => { if (inside(root, open)?.toLowerCase().endsWith('.fdraw')) opened.add(open); };
  if (opts.open) add(opts.open);
  // what may be listed, read and written, worked out again on every request: an edit can change the look
  const shared = (): Set<string> => {
    const out = new Set<string>();
    for (const o of opened) {
      for (const f of diagramFiles(join(root, ...o.split('/')))) {
        let real: string;
        try { real = realpathSync(f); } catch { continue; }
        if (real.startsWith(root + sep)) out.add(real.slice(root.length + 1).split(sep).join('/'));
      }
    }
    return out;
  };
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
      return send(200, JSON.stringify({ files: [...shared()].sort().map((path) => ({ path })) }), { 'Content-Type': 'application/json' });
    }
    if (!rest.startsWith('f/')) return send(404);
    const rel = rest.slice(2);
    const file = inside(root, rel);
    if (!file) return send(403, 'outside the folder');
    let name: string;
    try { name = rel.split('/').map(decodeURIComponent).join('/'); } catch { return send(403, 'not shared'); }
    if (!shared().has(name)) return send(403, 'not shared: only the opened diagram and the files it needs are');

    if (req.method === 'GET') {
      try {
        const s = statSync(file);
        if (!s.isFile()) return send(404);
        return send(200, readFileSync(file), { 'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', 'X-Mtime': String(Math.floor(s.mtimeMs)) });
      } catch { return send(404); }
    }
    if (req.method === 'PUT') {
      if (!WRITABLE.has(extname(file).toLowerCase())) return send(403, 'only .fdraw and .look files are written');
      try { if (lstatSync(file).isSymbolicLink()) return send(403, 'not written through a link'); } catch { /* a new file */ }
      const chunks: Buffer[] = [];
      let size = 0;
      req.on('data', (c: Buffer) => { size += c.length; if (size <= MAX_WRITE) chunks.push(c); });
      req.on('end', () => {
        if (size > MAX_WRITE) return send(413, 'too large');
        try {
          writeFileSync(file, Buffer.concat(chunks));
          const mtime = Math.floor(statSync(file).mtimeMs);
          send(200, JSON.stringify({ mtime }), { 'Content-Type': 'application/json', 'X-Mtime': String(mtime) });
        } catch (e) { send(500, (e as Error).message); }
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
      const open = new URL(editor);
      open.searchParams.set('serve', base);
      if (opts.open) open.searchParams.set('open', opts.open);
      ok({ url: open.href, base, port, add, close: () => new Promise((done) => { server.closeAllConnections(); server.close(() => done()); }) });
    });
  });
}
