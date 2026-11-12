// The fonts the built-in look and the reference look use, bundled with the editor so the canvas
// and exports match the command-line renderer.
import { fontMeta } from '../../src/fontmeta.ts';
import franklin400 from '../../fonts/LibreFranklin-Regular.ttf?url';
import franklin500 from '../../fonts/LibreFranklin-Medium.ttf?url';
import franklin600 from '../../fonts/LibreFranklin-SemiBold.ttf?url';
import franklin700 from '../../fonts/LibreFranklin-Bold.ttf?url';
import news400 from '../../fonts/Newsreader-Regular.ttf?url';
import news500 from '../../fonts/Newsreader-Medium.ttf?url';
import news600 from '../../fonts/Newsreader-SemiBold.ttf?url';
import newsItalic from '../../fonts/Newsreader-Italic.ttf?url';
import geist400 from '../../fonts/Geist-Regular.ttf?url';
import geist500 from '../../fonts/Geist-Medium.ttf?url';
import geist600 from '../../fonts/Geist-SemiBold.ttf?url';
import mono400 from '../../fonts/GeistMono-Regular.ttf?url';
import mono500 from '../../fonts/GeistMono-Medium.ttf?url';
import serif from '../../fonts/InstrumentSerif-Regular.ttf?url';
import serifItalic from '../../fonts/InstrumentSerif-Italic.ttf?url';

const FACES: [string, number, string, string][] = [
  ['Libre Franklin', 400, 'normal', franklin400], ['Libre Franklin', 500, 'normal', franklin500],
  ['Libre Franklin', 600, 'normal', franklin600], ['Libre Franklin', 700, 'normal', franklin700],
  ['Newsreader', 400, 'normal', news400], ['Newsreader', 500, 'normal', news500], ['Newsreader', 600, 'normal', news600],
  ['Newsreader', 400, 'italic', newsItalic],
  ['Geist', 400, 'normal', geist400], ['Geist', 500, 'normal', geist500], ['Geist', 600, 'normal', geist600],
  ['Geist Mono', 400, 'normal', mono400], ['Geist Mono', 500, 'normal', mono500],
  ['Instrument Serif', 400, 'normal', serif], ['Instrument Serif', 400, 'italic', serifItalic],
];

const face = (f: [string, number, string, string], src: string) =>
  `@font-face{font-family:'${f[0]}';font-weight:${f[1]};font-style:${f[2]};src:url(${src}) format('truetype');}`;

// Make the fonts available to the page.
export function installFonts(): void {
  const el = document.createElement('style');
  el.textContent = FACES.map((f) => face(f, f[3])).join('\n');
  document.head.appendChild(el);
}

// Fonts a look brings itself (its `fontdir` folders), registered with the page for as long as
// that look is in use.
let lookFaces: { face: FontFace; family: string; css: string }[] = [];
export function setLookFonts(files: { bytes: Uint8Array }[]): string[] {
  for (const f of lookFaces) document.fonts.delete(f.face);
  lookFaces = [];
  const families: string[] = [];
  for (const f of files) {
    const m = fontMeta(f.bytes);
    // the family name comes out of an untrusted file and is written into CSS: plain names only
    if (!m || !/^[\w .\-]{1,64}$/.test(m.family)) continue;
    const face = new FontFace(m.family, f.bytes.buffer as ArrayBuffer, { weight: String(m.weight), style: m.italic ? 'italic' : 'normal' });
    document.fonts.add(face);
    face.load().catch(() => undefined);
    let bin = '';
    for (let i = 0; i < f.bytes.length; i += 0x8000) bin += String.fromCharCode(...f.bytes.subarray(i, i + 0x8000));
    lookFaces.push({ face, family: m.family, css: `@font-face{font-family:'${m.family}';font-weight:${m.weight};font-style:${m.italic ? 'italic' : 'normal'};src:url(data:font/ttf;base64,${btoa(bin)}) format('truetype');}` });
    if (!families.includes(m.family)) families.push(m.family);
  }
  return families;
}
export const BUNDLED_FAMILIES = ['Libre Franklin', 'Newsreader', 'Geist', 'Geist Mono', 'Instrument Serif'];

const bundled = new Map<string, Promise<string>>();
// @font-face rules, as data URLs, for the families an SVG actually uses, so exports stand alone
// without carrying every font.
export async function fontCss(svg: string): Promise<string> {
  const used = (family: string) => svg.includes(`'${family}'`);
  const rules = await Promise.all(FACES.filter((f) => used(f[0])).map((f) => {
    if (!bundled.has(f[3])) bundled.set(f[3], (async () => {
      const buf = new Uint8Array(await (await fetch(f[3])).arrayBuffer());
      let bin = '';
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return face(f, `data:font/ttf;base64,${btoa(bin)}`);
    })());
    return bundled.get(f[3])!;
  }));
  return rules.join('') + lookFaces.filter((f) => used(f.family)).map((f) => f.css).join('');
}
