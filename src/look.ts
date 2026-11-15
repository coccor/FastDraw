import { parseStatements } from './parse.ts';
import { DEFAULT_LOOK } from './defaultLook.ts';
import { ICONS } from './icons.ts';
import { BUNDLED_LOOKS } from './bundledLooks.ts';

export type Kind = 'shape' | 'line' | 'text';
export type Props = Record<string, string>;
export type Style = { name: string; kind: Kind; props: Props };
export type Issue = { line: number; level: 'error' | 'warn' | 'hint'; msg: string; file?: string };
export type Look = {
  colors: Map<string, string>;
  fonts: Map<string, string>;
  fontDirs: string[]; // folders of TTF/OTF files, relative to the look file
  canvas: Props;
  styles: Map<string, Style>;
  icons: Map<string, string[]>; // name -> SVG path data, drawn as outlines in a 24x24 box
  iconDirs: string[]; // folders of SVG icon files, relative to the look file
  images: Map<string, string>; // name -> data URI of an icon file, filled in by whoever can read the folders
  guidance: string[];
  dark?: string; // the look that draws the same diagrams on a dark page: a bundled look's name, or a .look path relative to this look's file
  issues: Issue[];
};

const BUILTIN: Style[] = [
  { name: 'rect', kind: 'shape', props: { shape: 'rect', fill: 'none', stroke: 'ink', sw: '1' } },
  { name: 'ellipse', kind: 'shape', props: { shape: 'ellipse', fill: 'none', stroke: 'ink', sw: '1' } },
  { name: 'diamond', kind: 'shape', props: { shape: 'diamond', fill: 'none', stroke: 'ink', sw: '1' } },
  { name: 'polygon', kind: 'shape', props: { shape: 'polygon', fill: 'none', stroke: 'ink', sw: '1', size: 'automatic', use: 'any outline from exact corners: polygon at x,y points=60,0;120,100;0,100 (measured from at). open=1 leaves it unclosed, smooth=1 rounds it' } },
  { name: 'freehand', kind: 'shape', props: { shape: 'polygon', open: '1', smooth: '1', fill: 'none', stroke: 'ink', sw: '2', cap: 'round', overlap: 'ok', mask: '0', size: 'automatic', use: 'a stroke drawn by hand in the editor: freehand at x,y points=0,12;18,2;40,9 (measured from at), a smooth open line through the points. Not for diagrams written as text: use lines, arrows and polygons there' } },
  { name: 'arc', kind: 'shape', props: { shape: 'arc', fill: 'none', stroke: 'ink', sw: '1', use: 'a slice of a circle: arc at x,y WxH from=0 to=90 (degrees clockwise from the top). inner=0.6 makes it a ring segment, open=1 draws only the curved edge' } },
  { name: 'icon', kind: 'shape', props: { shape: 'icon', mask: '0', size: '24x24', use: 'an icon on its own, with no box: icon at x,y icon=database. fill=, stroke= and sw= style the icon itself; its text is a caption underneath (give WxH for another size)' } },
  { name: 'text', kind: 'text', props: { font: 'sans', size: '12', color: 'ink' } },
  { name: 'arrow', kind: 'line', props: { stroke: 'muted', sw: '1.2', head: 'arrow', route: 'ortho', radius: '8' } },
  { name: 'line', kind: 'line', props: { stroke: 'muted', sw: '1', head: 'none', route: 'straight' } },
  { name: 'relation', kind: 'line', props: { stroke: 'ink', sw: '1.2', head: 'none', route: 'ortho', radius: '6', use: 'a relationship between two tables or classes; write it with -- and choose the ends with head= and tail=' } },
  {
    name: 'table', kind: 'shape',
    props: {
      shape: 'table', fill: 'paper', stroke: 'ink', sw: '1', size: 'automatic',
      use: 'a box with a header and rows; add a line per row: | id "cell" "cell". An arrow can end on a row: other -> table.id',
    },
  },
  {
    name: 'chart', kind: 'shape',
    props: {
      shape: 'chart', fill: 'none', stroke: 'ink/0.5', sw: '1', mask: '0',
      use: 'axes with your numbers drawn for you: chart at x,y WxH x="Q1,Q2,Q3" y=0..100, then a line per series: | bars "Revenue" 42 61 75',
    },
  },
  {
    name: 'legend', kind: 'shape',
    props: {
      shape: 'legend', fill: 'none', stroke: 'none', mask: '0', rule: 'ink/0.12', title: 'Legend', size: 'automatic',
      use: 'a whole legend in one statement: legend at x,y focal="what it means" primary="what it means" ...',
      'title.font': 'mono', 'title.size': '8', 'title.color': 'muted', 'title.spacing': '0.18', 'title.caps': '1',
      'item.font': 'sans', 'item.size': '8.5', 'item.color': 'muted',
    },
  },
];

export function emptyLook(): Look {
  const look: Look = {
    colors: new Map([['ink', '#222222'], ['muted', '#666666'], ['paper', '#ffffff'], ['card', '#ffffff']]),
    fonts: new Map([['sans', 'Helvetica'], ['mono', 'monospace'], ['serif', 'serif']]),
    fontDirs: [],
    canvas: {},
    styles: new Map(),
    icons: new Map(Object.entries(ICONS)),
    iconDirs: [],
    images: new Map(),
    guidance: [],
    issues: [],
  };
  for (const s of BUILTIN) look.styles.set(s.name, { ...s, props: { ...s.props } });
  return look;
}

export function parseLook(src: string, path = 'look'): Look {
  const look = emptyLook();
  for (const st of parseStatements(src)) {
    const [head, ...rest] = st.toks;
    const err = (msg: string) => look.issues.push({ line: st.line, level: 'error', msg, file: path });
    if (head.t !== 'word') { err('a look statement must start with canvas, color, font, fontdir, style, icon, icondir, guidance or dark'); continue; }
    if (head.v === 'dark') {
      // dark night | dark "./team-night.look": the look `fastdraw render --dark` uses for the dark image
      const v = rest[0]?.v;
      if (!v || rest.length > 1 || !(Object.hasOwn(BUNDLED_LOOKS, v) || /\.look$/i.test(v))) err(`dark needs one look: the name of a look that ships with FastDraw or a path to a .look file, e.g. dark night or dark "./team-night.look" (named looks: ${Object.keys(BUNDLED_LOOKS).join(', ')})`);
      else look.dark = v;
      continue;
    }
    if (head.v === 'icondir') {
      if (!rest[0]) err('icondir needs a folder of SVG files, e.g. icondir "./icons"'); else look.iconDirs.push(rest[0].v);
      continue;
    }
    if (head.v === 'icon') {
      // icon name "path data" ["more path data" ...]: outlines in a 24x24 box
      const name = rest[0]?.t === 'word' ? rest[0].v : undefined, paths = rest.slice(1).filter((t) => t.t === 'str').map((t) => t.v);
      if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) err('icon needs a name in small letters, e.g. icon queue "M4 6h16 M4 12h16 M4 18h16"');
      else if (!paths.length || paths.some((d) => !/^[MmLlHhVvCcSsQqTtAaZz0-9eE\s,.+-]+$/.test(d) || d.length > 4000) || paths.length > 12) err(`icon ${name} needs its outline as SVG path data in quotes, drawn in a 24x24 box, e.g. "M4 6h16 M4 12h16"`);
      else look.icons.set(name, paths);
      continue;
    }
    if (head.v === 'fontdir') {
      if (!rest[0]) err('fontdir needs a folder, e.g. fontdir "./fonts"'); else look.fontDirs.push(rest[0].v);
      continue;
    }
    if (head.v === 'canvas') {
      for (const t of rest) if (t.t === 'prop') look.canvas[t.k!] = t.v;
    } else if (head.v === 'color' || head.v === 'font') {
      if (rest.length < 2) { err(`${head.v} needs a name and a value`); continue; }
      (head.v === 'color' ? look.colors : look.fonts).set(rest[0].v, rest[1].v);
    } else if (head.v === 'guidance') {
      for (const t of rest) if (t.t === 'str') look.guidance.push(t.v);
    } else if (head.v === 'style') {
      const name = rest[0]?.v;
      if (!name) { err('style needs a name'); continue; }
      let kind: Kind | undefined;
      let props: Props = {};
      for (let i = 1; i < rest.length; i++) {
        const t = rest[i];
        if (t.t === 'prop') { props[t.k!] = t.v; continue; }
        if (t.v === 'extends') {
          const base = look.styles.get(rest[++i]?.v);
          if (!base) { err(`style "${name}" extends an unknown style "${rest[i]?.v}" (define the base first)`); continue; }
          kind = kind ?? base.kind;
          props = { ...base.props, ...props };
        } else if (t.v === 'line' || t.v === 'text' || t.v === 'shape') kind = t.v;
        else err(`unexpected word "${t.v}" in style "${name}"`);
      }
      look.styles.set(name, { name, kind: kind ?? 'shape', props });
    } else err(`unknown look statement "${head.v}"`);
  }
  return look;
}

function hexToRgb(hex: string): [number, number, number] | null {
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// Accepts: none, #hex, a colour name from the look, and any of those followed by /alpha.
export function color(look: Look, v: string | undefined): string {
  if (!v || v === 'none' || v === 'transparent') return 'none';
  let alpha: number | undefined;
  const m = /^(.*)\/([0-9.]+)$/.exec(v);
  if (m && !v.startsWith('rgb')) { v = m[1]; alpha = parseFloat(m[2]); }
  let base = look.colors.get(v) ?? v;
  base = look.colors.get(base) ?? base;
  if (alpha === undefined) return base;
  const rgb = base.startsWith('#') ? hexToRgb(base) : null;
  if (!rgb) return base;
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

export function isColor(look: Look, v: string): boolean {
  if (v === 'none' || v === 'transparent' || v.startsWith('rgb')) return true;
  const base = v.replace(/\/[0-9.]+$/, '');
  if (look.colors.has(base)) return true;
  return base.startsWith('#') && hexToRgb(base) !== null;
}

export function fontFamily(look: Look, v: string | undefined): string {
  const name = v ?? 'sans';
  const fam = look.fonts.get(name) ?? name;
  const generic = name === 'mono' ? 'monospace' : name === 'serif' ? 'serif' : 'sans-serif';
  return `'${fam}', ${generic}`;
}

let cachedDefault: Look | undefined;
// The built-in look, used when a diagram names no look of its own.
// The looks that ship inside FastDraw, by the name a diagram gives them: `look sketch`. A name is a
// bare word; anything with a slash or ending in .look is a file path.
export const BUNDLED_LOOK_NAMES = Object.keys(BUNDLED_LOOKS);
export const isBundledLook = (p: string | undefined): p is string => !!p && Object.hasOwn(BUNDLED_LOOKS, p);
const bundledCache = new Map<string, Look>();
export function bundledLook(name: string): Look | null {
  if (!isBundledLook(name)) return null;
  let l = bundledCache.get(name);
  if (!l) bundledCache.set(name, (l = parseLook(BUNDLED_LOOKS[name]!, `${name} look`)));
  return l;
}
export const bundledLookSource = (name: string): string | null => (isBundledLook(name) ? BUNDLED_LOOKS[name]! : null);

export function defaultLook(): Look {
  cachedDefault ??= parseLook(DEFAULT_LOOK, 'default look');
  return cachedDefault;
}

// The looks above are parsed once and kept, with the icons that existed then; after more icons are
// registered (extendedIcons.ts) they are parsed again so they offer them too.
export function resetLookCaches(): void {
  cachedDefault = undefined;
  bundledCache.clear();
}
