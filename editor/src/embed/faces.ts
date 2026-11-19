// The fonts that ship with FastDraw, by the file names they have in fonts/ next to embed.js.
export const FACES: [string, string, string, string][] = [
  ['Geist', '400', 'normal', 'Geist-Regular.ttf'], ['Geist', '500', 'normal', 'Geist-Medium.ttf'], ['Geist', '600', 'normal', 'Geist-SemiBold.ttf'], ['Geist', '700', 'normal', 'Geist-Bold.ttf'],
  ['Geist Mono', '400', 'normal', 'GeistMono-Regular.ttf'], ['Geist Mono', '500', 'normal', 'GeistMono-Medium.ttf'],
  ['Newsreader', '400', 'normal', 'Newsreader-Regular.ttf'], ['Newsreader', '500', 'normal', 'Newsreader-Medium.ttf'],
  ['Newsreader', '600', 'normal', 'Newsreader-SemiBold.ttf'], ['Newsreader', '400', 'italic', 'Newsreader-Italic.ttf'],
  ['Libre Franklin', '400', 'normal', 'LibreFranklin-Regular.ttf'], ['Libre Franklin', '500', 'normal', 'LibreFranklin-Medium.ttf'],
  ['Libre Franklin', '600', 'normal', 'LibreFranklin-SemiBold.ttf'], ['Libre Franklin', '700', 'normal', 'LibreFranklin-Bold.ttf'],
  ['Instrument Serif', '400', 'normal', 'InstrumentSerif-Regular.ttf'], ['Instrument Serif', '400', 'italic', 'InstrumentSerif-Italic.ttf'],
  ['Libre Caslon Display', '400', 'normal', 'LibreCaslonDisplay-Regular.ttf'],
  ['Sketch Hand', '400', 'normal', 'SketchHand-Regular.ttf'],
];
export const FONT_FILES = FACES.map((f) => f[3]);

/** The family each font-family list in an SVG is drawn in: the first one in the list that `have` says is there. */
export function familiesDrawn(svg: string, have: (family: string) => boolean): Set<string> {
  const out = new Set<string>();
  for (const [, list] of svg.matchAll(/font-family="([^"]*)"/g)) {
    const fam = list!.split(',').map((f) => f.trim().replace(/^'|'$/g, '')).find(have);
    if (fam) out.add(fam);
  }
  return out;
}
