// The fastdraw.dev Worker. The site itself is static files (dist-editor/); wrangler.jsonc sends only
// /gh/* and /s/* here first, which answer with a diagram drawn as an SVG image (see svg.ts).
import { handle } from './svg.ts';

type Env = { ASSETS: { fetch(req: Request | string): Promise<Response> } };
type Ctx = { waitUntil(p: Promise<unknown>): void };
// Cloudflare's cache for this data centre (not in the DOM's CacheStorage type)
const edge = () => (globalThis as unknown as { caches: { default: Cache } }).caches.default;

export default {
  async fetch(req: Request, env: Env, ctx: Ctx): Promise<Response> {
    const cache = req.method === 'GET' ? edge() : null;
    const hit = await cache?.match(req);
    if (hit) return hit;
    const res = await handle(req, {
      editor: new URL('/edit/', req.url).href,
      async fetchText(url) {
        const r = await fetch(url, { cf: { cacheTtl: 60 } } as RequestInit);
        if (r.status === 404) return null;
        if (!r.ok) throw new Error(`${url}: ${r.status}`);
        return r.text();
      },
      async font(file) {
        const r = await env.ASSETS.fetch(new URL(`/fonts/${file}`, req.url).href);
        return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
      },
    });
    if (!res) return env.ASSETS.fetch(req);
    if (cache && res.status === 200) ctx.waitUntil(cache.put(req, res.clone()));
    return res;
  },
};
