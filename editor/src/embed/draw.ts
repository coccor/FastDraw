// The heavy half of <fastdraw-diagram>, loaded on first use: the renderer the editor uses, the bundled looks
// and the built-in icons. The rest of the icons load only for a diagram that uses one of them.
import { buildScene, lookPath } from '../../../src/scene.ts';
import { renderSvg } from '../../../src/render.ts';
import { parseLook, color, isBundledLook, bundledLook, bundledLookSource, defaultLook } from '../../../src/look.ts';
import { loadExtendedIcons, extendedIconsLoaded } from '../../../src/extendedIcons.ts';
import { darkCounterpart, withLook } from './theme.ts';
import { FACES } from './faces.ts';

/** A diagram as fetched: its text and, when it names a look file, that file. */
export type Source = { url: string; text: string; look: { url: string; path: string; text: string } | null };
export type Drawn = { svg: string; paper: string; x: number; y: number; w: number; h: number };

async function fetchText(url: string): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status} ${r.statusText}`);
  const text = await r.text();
  // a site answering a missing file with its own HTML page
  if (/^\s*</.test(text)) throw new Error(`${url}: not a FastDraw file (it starts with "<")`);
  return text;
}

export async function fetchSource(url: string): Promise<Source> {
  const text = await fetchText(url);
  const ref = lookPath(text);
  if (!ref || isBundledLook(ref)) return { url, text, look: null };
  const lookUrl = new URL(ref, url).href;
  return { url, text, look: { url: lookUrl, path: ref, text: await fetchText(lookUrl) } };
}

/** Draws the diagram, in its dark counterpart when `dark` and it has one; the fonts it uses are loaded first. */
export async function draw(s: Source, dark: boolean, fontBase: string): Promise<Drawn> {
  let text = s.text, lookText = s.look?.text ?? null;
  if (dark) {
    const ref = lookPath(text);
    const own = !ref ? defaultLook() : isBundledLook(ref) ? bundledLook(ref) : lookText !== null ? parseLook(lookText) : null;
    const d = darkCounterpart(ref, own, ref && isBundledLook(ref) ? bundledLookSource(ref) : lookText);
    if (d && isBundledLook(d)) { text = withLook(text, d); lookText = null; }
    else if (d) {
      try { lookText = await fetchText(new URL(d, s.look?.url ?? s.url).href); text = withLook(text, d); }
      catch (e) { console.warn('fastdraw-diagram: the dark look could not be read, so the diagram keeps its own', e); }
    }
  }
  const build = () => buildScene(text, lookText !== null ? parseLook(lookText) : null);
  let sc = build();
  if (!extendedIconsLoaded() && sc.issues.some((i) => i.msg.startsWith('there is no icon called'))) {
    await loadExtendedIcons();
    sc = build();
  }
  const errors = sc.issues.filter((i) => i.level === 'error');
  if (errors.length) throw new Error(`${s.url} has errors:\n${errors.map((i) => `  line ${i.line}: ${i.msg}`).join('\n')}`);
  const svg = renderSvg(sc);
  await loadFonts(svg, fontBase);
  return { svg, paper: color(sc.look, sc.look.canvas.paper ?? 'paper'), x: sc.x, y: sc.y, w: sc.w, h: sc.h };
}


const loaded = new Map<string, Promise<unknown>>();
// Adds the faces of every family the SVG names to the page (document.fonts reaches into shadow roots) and
// waits for them. A font that cannot be fetched is reported and the diagram is drawn in the fallback.
async function loadFonts(svg: string, base: string): Promise<void> {
  const want = FACES.filter((f) => svg.includes(`'${f[0]}'`));
  await Promise.all(want.map((f) => {
    const url = new URL(f[3], base).href;
    if (!loaded.has(url)) {
      const face = new FontFace(f[0], `url(${JSON.stringify(url)})`, { weight: f[1], style: f[2] });
      document.fonts.add(face);
      loaded.set(url, face.load().catch((e) => console.warn(`fastdraw-diagram: font ${url} did not load`, e)));
    }
    return loaded.get(url);
  }));
}
