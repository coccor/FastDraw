import { parseStatements } from './parse.ts';
import { DEFAULT_LOOK } from './defaultLook.ts';

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
  guidance: string[];
  issues: Issue[];
};

const BUILTIN: Style[] = [
  { name: 'rect', kind: 'shape', props: { shape: 'rect', fill: 'none', stroke: 'ink', sw: '1' } },
  { name: 'ellipse', kind: 'shape', props: { shape: 'ellipse', fill: 'none', stroke: 'ink', sw: '1' } },
  { name: 'diamond', kind: 'shape', props: { shape: 'diamond', fill: 'none', stroke: 'ink', sw: '1' } },
  { name: 'text', kind: 'text', props: { font: 'sans', size: '12', color: 'ink' } },
  { name: 'arrow', kind: 'line', props: { stroke: 'muted', sw: '1.2', head: 'arrow', route: 'ortho', radius: '8' } },
  { name: 'line', kind: 'line', props: { stroke: 'muted', sw: '1', head: 'none', route: 'straight' } },
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
    colors: new Map([['ink', '#222222'], ['muted', '#666666'], ['paper', '#ffffff']]),
    fonts: new Map([['sans', 'Helvetica'], ['mono', 'monospace'], ['serif', 'serif']]),
    fontDirs: [],
    canvas: {},
    styles: new Map(),
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
    if (head.t !== 'word') { err('a look statement must start with canvas, color, font, fontdir, style or guidance'); continue; }
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
export function defaultLook(): Look {
  cachedDefault ??= parseLook(DEFAULT_LOOK, 'default look');
  return cachedDefault;
}
