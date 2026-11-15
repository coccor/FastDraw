// A diagram carried in a link to the editor: `https://fastdraw.dev/edit/#fdraw=<data>`. The data is the
// file's name, its text and, when it uses a look file of its own, that file's path and text, as JSON,
// compressed (deflate-raw) and base64url encoded. It sits after the # so it never reaches a server.

export type Shared = { name: string; text: string; look?: { path: string; text: string } };

// a link is untrusted: a few compressed bytes must not unpack into something huge
const MAX_BYTES = 4_000_000;

function b64url(b: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(s: string): Uint8Array {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(t + '='.repeat((4 - (t.length % 4)) % 4)), (c) => c.charCodeAt(0));
}

async function through(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(stream).getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) { await reader.cancel(); throw new Error('too large'); }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

export async function encodeShared(d: Shared): Promise<string> {
  const json = JSON.stringify(d.look ? { name: d.name, text: d.text, look: d.look } : { name: d.name, text: d.text });
  return b64url(await through(new TextEncoder().encode(json), new CompressionStream('deflate-raw')));
}

/** The diagram in `data`, or null when it is not one (cut short, tampered with, or not FastDraw's). */
export async function decodeShared(data: string): Promise<Shared | null> {
  try {
    const o = JSON.parse(new TextDecoder().decode(await through(unb64url(data), new DecompressionStream('deflate-raw'))));
    if (!o || typeof o.text !== 'string') return null;
    const name = typeof o.name === 'string' && o.name ? o.name.slice(0, 200) : 'diagram.fdraw';
    const look = o.look && typeof o.look.path === 'string' && typeof o.look.text === 'string' ? { path: o.look.path, text: o.look.text } : undefined;
    return look ? { name, text: o.text, look } : { name, text: o.text };
  } catch {
    return null;
  }
}

/** The `fdraw=` value in a location hash, or null. */
export function sharedInHash(hash: string): string | null {
  return new URLSearchParams(hash.replace(/^#/, '')).get('fdraw');
}

/** A link that opens the diagram in the editor at `editor` (the editor's address, e.g. https://fastdraw.dev/edit/). */
export async function editorLink(editor: string, d: Shared): Promise<string> {
  const u = new URL(editor);
  u.hash = 'fdraw=' + (await encodeShared(d));
  return u.href;
}
