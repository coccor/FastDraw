// The fonts the reference look uses, bundled with the editor so the canvas and exports match
// the command-line renderer.
import geist400 from '../../fonts/Geist-Regular.ttf?url';
import geist500 from '../../fonts/Geist-Medium.ttf?url';
import geist600 from '../../fonts/Geist-SemiBold.ttf?url';
import mono400 from '../../fonts/GeistMono-Regular.ttf?url';
import mono500 from '../../fonts/GeistMono-Medium.ttf?url';
import serif from '../../fonts/InstrumentSerif-Regular.ttf?url';
import serifItalic from '../../fonts/InstrumentSerif-Italic.ttf?url';

const FACES: [string, number, string, string][] = [
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

let cached: Promise<string> | undefined;
// The same fonts as data URLs, for SVG and PNG exports that must stand alone.
export function fontCss(): Promise<string> {
  cached ??= Promise.all(FACES.map(async (f) => {
    const buf = new Uint8Array(await (await fetch(f[3])).arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return face(f, `data:font/ttf;base64,${btoa(bin)}`);
  })).then((rules) => rules.join(''));
  return cached;
}
