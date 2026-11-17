// Diagrams as SVG images at fastdraw.dev, for places that show images but run no scripts, such as
// README files, issues and pull requests on GitHub:
//
//   /gh/<owner>/<repo>/<ref>/<path>.fdraw   a .fdraw file in a public GitHub repository, read from
//                                           raw.githubusercontent.com (its look file too, when it names one)
//   /s/<data>                               a diagram carried in the address itself, in the editor's share
//                                           format (see editor/src/embed/share.ts), for private repos
//
// ?theme=dark (or ?dark) draws the look's dark version; ?edit answers with a redirect to the editor
// with the diagram open in it. The SVG carries its fonts inside, because an SVG shown as an <img>
// cannot load anything from outside itself.
import { buildScene, lookPath, withLook } from '../src/scene.ts';
import { renderSvg, esc } from '../src/render.ts';
import { parseLook, isBundledLook, isWebLook, bundledLook, defaultLook } from '../src/look.ts';
import { loadExtendedIcons, extendedIconsLoaded } from '../src/extendedIcons.ts';
import { darkCounterpart } from '../editor/src/embed/theme.ts';
import { decodeShared, editorLink, type Shared } from '../editor/src/embed/share.ts';
import { FACES, familiesDrawn } from '../editor/src/embed/faces.ts';
import { subsetFont } from '../src/subset.ts';
import { withIconImages } from '../src/iconfiles.ts';

export type Deps = {
  /** The text at a raw.githubusercontent.com address, or null when there is none (404). */
  fetchText(url: string): Promise<string | null>;
  /** A font file from fonts/ by its name, e.g. Geist-Regular.ttf. */
  font(file: string): Promise<Uint8Array | null>;
  /** The editor's address, e.g. https://fastdraw.dev/edit/ */
  editor: string;
};

const RAW = 'https://raw.githubusercontent.com/';
const MAX_TEXT = 1_000_000;
const NAME = /^[A-Za-z0-9_.-]{1,100}$/;

/** A request the diagram cannot be drawn for; the message is shown in the image. */
class Problem extends Error {
  // answered as an image with status 200, as GitHub's image proxy shows a broken image for anything else
}

// icons: icon files carried in a /s/ address (name -> data URI); a /gh/ diagram brings none
type Source = { name: string; text: string; look: { path: string; text: string } | null; base: string | null; icons?: Record<string, string> };

/** The answer for /gh/… and /s/… addresses, or null for any other path. */
export async function handle(req: Request, deps: Deps): Promise<Response | null> {
  const url = new URL(req.url);
  const route = url.pathname.startsWith('/gh/') ? 'gh' : url.pathname.startsWith('/s/') ? 's' : null;
  if (!route) return null;
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('only GET', { status: 405, headers: { Allow: 'GET, HEAD' } });
  const q = url.searchParams;
  const dark = q.has('dark') || q.get('theme') === 'dark';
  try {
    const src = route === 'gh' ? await fromGitHub(url.pathname.slice(4), deps) : await fromShare(url.pathname.slice(3));
    if (q.has('edit')) {
      const shared: Shared = { name: src.name, text: src.text, ...(src.look ? { look: src.look } : {}), ...(src.icons ? { icons: src.icons } : {}) };
      return new Response(null, { status: 302, headers: { Location: await editorLink(deps.editor, shared), 'Cache-Control': CACHE } });
    }
    return svgResponse(await draw(src, dark, deps));
  } catch (e) {
    // a Problem is the diagram's or the address's; anything else is GitHub not answering, said in the image too
    return svgResponse(errorSvg(e instanceof Problem ? e.message : `the file could not be read: ${(e as Error).message}`), true);
  }
}

const CACHE = 'public, max-age=300, s-maxage=300';
function svgResponse(svg: string, failed = false): Response {
  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      // a failed image is tried again soon, so a fix to the file shows without waiting
      'Cache-Control': failed ? 'public, max-age=30' : CACHE,
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:",
    },
  });
}

// owner/repo/ref/path…/name.fdraw, as raw.githubusercontent.com takes it (a ref with slashes works there too)
async function fromGitHub(rest: string, deps: Deps): Promise<Source> {
  const parts = rest.split('/');
  const [owner, repo] = parts;
  if (parts.length < 4 || !NAME.test(owner) || !NAME.test(repo)) throw new Problem('the address is /gh/<owner>/<repo>/<branch>/<path to the .fdraw file>');
  if (parts.some((p) => p === '' || p === '.' || p === '..')) throw new Problem('the path has an empty, "." or ".." part');
  if (!/\.fdraw$/i.test(rest)) throw new Problem('the path must end in .fdraw');
  const repoRoot = `${RAW}${owner}/${repo}/`;
  const fileUrl = repoRoot + parts.slice(2).map(encodeURIComponent).join('/');
  const text = await readText(fileUrl, deps, `${parts.slice(3).join('/')} was not found in ${owner}/${repo} at ${parts[2]} (only public repositories can be read)`);
  const ref = lookPath(text);
  let look: Source['look'] = null;
  if (ref && !isBundledLook(ref)) {
    const lookUrl = isWebLook(ref) ? onGitHub(ref) : inRepo(ref, fileUrl, repoRoot);
    look = { path: ref, text: await readText(lookUrl, deps, isWebLook(ref) ? `there is no look file at ${ref}` : `the look file ${ref} was not found next to the diagram`) };
  }
  return { name: parts[parts.length - 1], text, look, base: look ? (isWebLook(ref!) ? onGitHub(ref!) : inRepo(ref!, fileUrl, repoRoot)) : fileUrl };
}

/** A look the diagram names by web address, read only from a GitHub repository (directly or through jsDelivr). */
function onGitHub(url: string): string {
  const u = new URL(url);
  if (u.host !== 'raw.githubusercontent.com' && !(u.host === 'cdn.jsdelivr.net' && u.pathname.startsWith('/gh/')) || u.search || u.hash) {
    throw new Problem(`a look named by address is read only from GitHub (raw.githubusercontent.com or cdn.jsdelivr.net/gh/): "${url}"`);
  }
  return u.href;
}

/** A look path from a file at `from`, as an address in the same repository; anything else is refused. */
function inRepo(path: string, from: string, root: string): string {
  if (!/\.look$/i.test(path)) throw new Problem(`the look path must end in .look; "${path}" was not read`);
  let u: URL;
  try { u = new URL(path, from); } catch { throw new Problem(`the look path "${path}" is not a path`); }
  if (!u.href.startsWith(root) || u.search || u.hash) throw new Problem(`the look file must be in the same repository: "${path}"`);
  return u.href;
}

async function readText(url: string, deps: Deps, missing: string): Promise<string> {
  const t = await deps.fetchText(url);
  if (t === null) throw new Problem(missing);
  if (t.length > MAX_TEXT) throw new Problem('the file is larger than 1 MB');
  return t;
}

async function fromShare(data: string): Promise<Source> {
  const s = await decodeShared(data.replace(/\.svg$/i, ''));
  if (!s) throw new Problem('the address does not hold a diagram (cut short, or not made by FastDraw)');
  if (s.text.length > MAX_TEXT) throw new Problem('the diagram is larger than 1 MB');
  return { name: s.name, text: s.text, look: s.look ?? null, base: null, ...(s.icons ? { icons: s.icons } : {}) };
}

async function draw(s: Source, dark: boolean, deps: Deps): Promise<string> {
  let text = s.text, lookText = s.look?.text ?? null;
  if (dark) {
    const ref = lookPath(text);
    const own = !ref ? defaultLook() : isBundledLook(ref) ? bundledLook(ref) : lookText !== null ? parseLook(lookText) : null;
    const d = darkCounterpart(ref, own);
    if (d && isBundledLook(d)) { text = withLook(text, d); lookText = null; }
    else if (d) {
      if (!s.base) throw new Problem(`the dark look ${d} is a file, which a diagram in the address cannot bring; use a look that ships with FastDraw`);
      const root = s.base.split('/').slice(0, 5).join('/') + '/';
      lookText = await readText(inRepo(d, s.base, root), deps, `the dark look ${d} was not found`);
      text = withLook(text, d);
    }
  }
  const build = () => buildScene(text, lookText !== null ? withIconImages(parseLook(lookText), [], s.icons ?? {}) : null);
  let sc = build();
  if (!extendedIconsLoaded() && sc.issues.some((i) => i.msg.startsWith('there is no icon called'))) {
    await loadExtendedIcons();
    sc = build();
  }
  const errors = sc.issues.filter((i) => i.level === 'error');
  if (errors.length) throw new Problem(`${s.name} has errors:\n${errors.slice(0, 6).map((i) => `line ${i.line}: ${i.msg}`).join('\n')}`);
  const plain = renderSvg(sc);
  return renderSvg(sc, await fontCss(plain, deps));
}

/** @font-face rules, with the font files inside, for the faces the SVG's text uses. */
export async function fontCss(svg: string, deps: Pick<Deps, 'font'>): Promise<string> {
  const want = new Set<string>();
  for (const [tag] of svg.matchAll(/<(?:text|tspan)\b[^>]*>/g)) {
    // the first family in the list that ships with FastDraw: a look's own font is not here, its stand-in is
    const fam = [...familiesDrawn(tag, (f) => FACES.some((x) => x[0] === f))][0];
    if (!fam) continue;
    const faces = FACES.filter((f) => f[0] === fam);
    if (!faces.length) continue;
    const weight = +(/font-weight="(\d+)"/.exec(tag)?.[1] ?? 400);
    const style = /font-style="italic"/.test(tag) ? 'italic' : 'normal';
    const same = faces.filter((f) => f[2] === style);
    const pool = same.length ? same : faces;
    const best = pool.reduce((a, b) => (Math.abs(+b[1] - weight) < Math.abs(+a[1] - weight) ? b : a));
    want.add(best[3]);
  }
  // each font cut down to the characters the diagram's text uses (the whole file when it cannot be cut)
  const text = svgText(svg);
  const rules = await Promise.all(FACES.filter((f) => want.has(f[3])).map(async ([family, weight, style, file]) => {
    const bytes = await deps.font(file);
    if (!bytes) return '';
    const font = subsetFont(bytes, text) ?? bytes;
    return `@font-face{font-family:'${family}';font-weight:${weight};font-style:${style};src:url(data:font/ttf;base64,${base64(font)}) format('truetype')}`;
  }));
  return rules.filter(Boolean).join('\n');
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
/** Every character between the SVG's tags, entities decoded: what its text can draw (a little more is harmless). */
export function svgText(svg: string): string {
  return svg.replace(/<[^>]*>/g, '').replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] !== '#') return ENTITIES[e] ?? m;
    const c = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1);
    return c > 0 && c <= 0x10ffff ? String.fromCodePoint(c) : '';
  });
}

function base64(b: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** A small image that says what went wrong, in place of the diagram. */
export function errorSvg(msg: string): string {
  const lines = msg.split('\n').flatMap((l) => wrap(l, 86)).slice(0, 10);
  const h = 56 + lines.length * 20;
  const body = lines.map((l, i) => `<text x="24" y="${66 + i * 20}" font-size="13" fill="#3f3f46">${esc(l)}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="${h}" viewBox="0 0 640 ${h}" font-family="ui-sans-serif, system-ui, sans-serif">`
    + `<rect x="0.5" y="0.5" width="639" height="${h - 1}" rx="8" fill="#fff7ed" stroke="#fdba74"/>`
    + `<text x="24" y="34" font-size="14" font-weight="600" fill="#9a3412">FastDraw could not draw this diagram</text>${body}</svg>`;
}

function wrap(line: string, n: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const w of line.split(' ')) {
    if (cur && (cur + ' ' + w).length > n) { out.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w;
  }
  out.push(cur);
  return out;
}
