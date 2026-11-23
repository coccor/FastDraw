// What the preview and the Problems panel need from a diagram, drawn by the same code as `fastdraw render`:
// the SVG, the checker's problems, and where each element sits so a click can find its line.
// Nothing here talks to VS Code, so it can be tested with plain Node.
import { readFileSync } from 'node:fs';
import { loadScene, lookOfDiagram, darkLookOf, lookRefText, fetchWebAssets } from '../../src/node.ts';
import { withLook, type Scene } from '../../src/scene.ts';
import { renderSvg } from '../../src/render.ts';
import { check } from '../../src/check.ts';
import { fontMeta } from '../../src/fontmeta.ts';
import type { Issue } from '../../src/look.ts';

// An element's box on the canvas and the line it is written on; conns are hit along their points.
export type Hit = { line: number; x: number; y: number; w: number; h: number; pts?: [number, number][] };

export type Drawn = {
  svg: string;
  hits: Hit[];
  fontFiles: string[]; // font files the look brings, beyond the bundled ones
  dark: boolean; // drawn with the look's dark version
  note?: string; // why the dark version was not used, when it was asked for
};

// The checker's problems for the diagram as written (the light look: the file's own).
export function problems(file: string, text: string): Issue[] {
  return check(loadScene(file, text));
}

// Icons and fonts the diagram's look names by https address, fetched once into the shared cache that
// `fastdraw render` uses. Returns a note for each host that could not be reached.
export const fetchAssets = (file: string): Promise<string[]> => fetchWebAssets([file]);

export function draw(file: string, text: string, opts: { dark?: boolean } = {}): Drawn {
  let src = text, dark = false, note: string | undefined;
  if (opts.dark) {
    const d = darkLookOf(lookOfDiagram(file, text));
    // withLook blanks the old look line rather than removing it, so line numbers stay those of the file
    if (typeof d === 'string') note = d;
    else { src = withLook(text, lookRefText(d, file)); dark = true; }
  }
  const sc = loadScene(file, src);
  return { svg: renderSvg(sc), hits: hitsOf(sc), fontFiles: sc.fontFiles ?? [], dark, note };
}

// Front to back, as the renderer stacks them: shapes, then lines, then free text on top.
export function hitsOf(sc: Scene): Hit[] {
  const box = (e: { line: number; x: number; y: number; w: number; h: number }): Hit => ({ line: e.line, x: e.x, y: e.y, w: e.w, h: e.h });
  return [
    ...sc.shapes.map(box),
    ...sc.conns.map((c) => ({ line: c.line, x: 0, y: 0, w: 0, h: 0, pts: c.pts.map((p) => [p.x, p.y] as [number, number]) })),
    ...sc.texts.map(box),
  ];
}

// @font-face rules for font files, named by what is inside them (family, weight, italic), not by file name.
// `url` turns a file path into an address the preview can load.
export function fontFaces(files: string[], url: (file: string) => string): string {
  const out: string[] = [];
  for (const f of files) {
    if (!/\.(ttf|otf)$/i.test(f)) continue;
    let m;
    try { m = fontMeta(new Uint8Array(readFileSync(f))); } catch { continue; }
    // the family name comes out of a file and is written into CSS: plain names only
    if (!m || !/^[\w .\-]{1,64}$/.test(m.family)) continue;
    out.push(`@font-face{font-family:'${m.family}';font-weight:${m.weight};font-style:${m.italic ? 'italic' : 'normal'};src:url(${url(f)}) format('${/\.otf$/i.test(f) ? 'opentype' : 'truetype'}');}`);
  }
  return out.join('\n');
}
