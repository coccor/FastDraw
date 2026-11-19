import React from 'react';
import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignStartHorizontal, AlignStartVertical,
  ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpToLine, Copy, Trash2, TextAlignStart, TextAlignCenter, TextAlignEnd,
  ChevronDown, ChevronRight, RotateCcw, RotateCw,
} from 'lucide-react';
import { color, fontFamily } from '../../src/look.ts';
import { MARKERS, turnOf } from '../../src/scene.ts';
import type { Scene, Row } from '../../src/scene.ts';
import type { RowSpec } from '../../src/edit.ts';
import { splitCells } from '../../src/edit.ts';
import { find } from './ops.ts';
import { IconField } from './IconPicker.tsx';
import { ColorPicker } from './ColorPicker.tsx';
import { TilePopover } from './TilePopover.tsx';
import type { TileChoice } from './TilePopover.tsx';
import { markerPreview } from '../../src/render.ts';
import { Thumb, BUILTIN } from './Gallery.tsx';
import type { Style } from '../../src/look.ts';
import type { AlignMode, Layering } from './ops.ts';

export type PanelActions = {
  setProp: (k: string, v: string | null) => void;
  // shows a value on the canvas without writing it (an opacity slider being dragged); setProp writes it
  previewProp: (k: string, v: string | null) => void;
  setTextAlign: (align: 'left' | 'center' | 'right') => void;
  setText: (text: string) => void;
  setProps: (kv: Record<string, string | null>) => void;
  setStyle: (name: string) => void;
  reorder: (where: Layering) => void;
  align: (mode: AlignMode) => void;
  remove: () => void;
  duplicate: () => void;
  setCanvas: (bg?: Record<string, string | null>) => void;
  resetRoute: () => void;
  setRows: (rows: RowSpec[]) => void;
  setRoute: (route: string) => void;
  // turns the selected shapes and texts to an angle, each about its own middle
  rotate: (deg: number) => void;
};

// One row, as Excalidraw does it: a few quick picks (`top`, else the first five of `values`), a divider, then a
// swatch showing the current colour that opens the whole palette (`values`), the diagram's custom colours, shades and a hex field.
// `custom` is that swatch's label; it is marked when the current colour is not one of the quick picks.
export function Swatches({ sc, values, current, onPick, custom, label, top }: { sc: Scene; values: string[]; current: string | undefined; onPick: (v: string) => void; custom: string; label?: string; top?: string[] }) {
  const picks = top ?? values.slice(0, 5);
  // the diagram's own hex colours that the palette does not already offer
  const recent = React.useMemo(() => {
    const has = new Set(values.map((v) => color(sc.look, v).toLowerCase()));
    return customColours(sc).filter((h) => !has.has(h));
  }, [sc, values.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const hex = current ? color(sc.look, current) : null;
  const own = !!current && !picks.includes(current);
  const swatch = (v: string) => {
    const c = color(sc.look, v);
    return (
      <button key={v} title={v === 'none' ? 'None' : v} aria-label={v} className={'swatch' + (current === v ? ' on' : '') + (c === 'none' ? ' none' : '')}
        onClick={() => onPick(v)} style={{ background: c === 'none' ? undefined : c }} />
    );
  };
  return (
    <div className="swatches" role={label ? 'group' : undefined} aria-label={label}>
      {picks.map(swatch)}
      <span className="divider" />
      <ColorPicker className={'custom' + (own ? ' on' : '') + (hex === 'none' ? ' none' : hex ? ' set' : '')} style={hex && hex !== 'none' ? { background: hex } : undefined}
        label={custom} title={current ? `${current === 'none' ? 'None' : current} (more colours)` : 'More colours'}
        value={current} palette={values} recent={recent} resolve={(v) => color(sc.look, v)} onPick={onPick} />
    </div>
  );
}

// The hex colours written in the diagram, most used first: the "custom colours" of the popover.
function customColours(sc: Scene): string[] {
  const n = new Map<string, number>();
  for (const el of [...sc.shapes, ...sc.texts, ...sc.conns]) {
    for (const v of Object.values(el.p)) {
      const h = typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null;
      if (h) n.set(h, (n.get(h) ?? 0) + 1);
    }
  }
  return [...n].sort((a, b) => b[1] - a[1]).map(([h]) => h);
}

// The look's colours that are not ink, greys, near-blacks or white: the ones worth a quick pick.
function vivid(sc: Scene, names: string[]): string[] {
  return names.filter((n) => {
    const c = color(sc.look, n);
    if (n === 'ink' || !/^#[0-9a-f]{6}$/i.test(c)) return false;
    const v = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    const max = Math.max(...v);
    return max > 96 && (max - Math.min(...v)) / max > 0.35;
  });
}

// A text input that commits when it loses focus or Enter is pressed. `multiline` gives a box that grows to
// its lines, where Shift+Enter starts a new line.
// `bare` leaves out its label (the row names it), keeping the name for screen readers.
export function TextField({ label, value, onCommit, multiline, bare, placeholder }: { label: string; value: string; onCommit: (v: string) => void; multiline?: boolean; bare?: boolean; placeholder?: string }) {
  const [v, setV] = React.useState(value);
  React.useEffect(() => setV(value), [value]);
  const done = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !(multiline && e.shiftKey)) { e.preventDefault(); (e.target as HTMLElement).blur(); } };
  const named = bare ? { 'aria-label': label, placeholder } : { placeholder };
  const input = multiline
    ? <textarea value={v} rows={Math.min(4, v.split('\n').length)} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onCommit(v)} onKeyDown={done} {...named} />
    : <input value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onCommit(v)} onKeyDown={done} {...named} />;
  if (bare) return input;
  return (
    <label className="field">
      <span>{label}</span>
      {input}
    </label>
  );
}

// Every line end, in groups for the popover, each with what it usually means.
const END_GROUPS: { title: string; choices: TileChoice[] }[] = [
  { title: 'Arrows', choices: [
    { key: 'none', label: 'Nothing', about: 'No mark: the line just stops.' },
    { key: 'arrow', label: 'Arrow', about: 'A filled arrowhead, the usual head.' },
    { key: 'open', label: 'Open arrow', about: 'Two strokes, not filled: a dependency, an asynchronous message.' },
    { key: 'stealth', label: 'Swept arrow', about: 'A filled head swept back to a notch: a sharper arrow.' },
    { key: 'double', label: 'Double arrow', about: 'Two heads in a row: a fast or repeated flow.' },
    { key: 'half', label: 'Half arrow', about: 'One barb, a harpoon: an asynchronous message, one half of a two-way pair.' },
  ] },
  { title: 'Shapes', choices: [
    { key: 'triangle', label: 'Hollow triangle', about: 'Inherits from or implements; it points at the parent.' },
    { key: 'diamond', label: 'Hollow diamond', about: 'Aggregation; it sits on the owner.' },
    { key: 'diamond-solid', label: 'Filled diamond', about: 'Composition; it sits on the owner.' },
    { key: 'square', label: 'Hollow square', about: 'A port, or a stub end.' },
    { key: 'square-solid', label: 'Filled square', about: 'A port, or a stub end, filled.' },
    { key: 'dot', label: 'Dot', about: 'A filled circle: a start point.' },
    { key: 'circle', label: 'Circle', about: 'A hollow circle: a provided interface, an end point.' },
  ] },
  { title: 'Marks', choices: [
    { key: 'bar', label: 'Bar', about: 'A bar across the end: blocks, inhibits, a hard stop.' },
    { key: 'cross', label: 'Cross', about: 'An X on the end: rejected, cancelled, destroyed.' },
    { key: 'stop', label: 'Ring (stop)', about: 'A ring the line runs into, like a station on a route map.' },
  ] },
  { title: 'Relationships', choices: [
    { key: 'one', label: 'One', about: 'One bar: one.' },
    { key: 'only-one', label: 'Exactly one', about: 'Two bars: exactly one.' },
    { key: 'many', label: 'Many', about: "A crow's foot: many." },
    { key: 'one-many', label: 'One or more', about: "A crow's foot and a bar: one or more." },
    { key: 'zero-one', label: 'Zero or one', about: 'A circle and a bar: optional, at most one.' },
    { key: 'zero-many', label: 'Zero or more', about: "A circle and a crow's foot: optional, any number." },
  ] },
];
// a marker the groups do not name yet still shows, under its own name
const LISTED = new Set(END_GROUPS.flatMap((g) => g.choices.map((c) => c.key)));
const UNLISTED = MARKERS.filter((m) => !LISTED.has(m)).map((m) => ({ key: m, label: m, about: '' }));
const ALL_ENDS = UNLISTED.length ? [...END_GROUPS, { title: 'Other', choices: UNLISTED }] : END_GROUPS;
const END_NAME = Object.fromEntries(ALL_ENDS.flatMap((g) => g.choices.map((c) => [c.key, c.label])));

// A line end drawn by the renderer as the diagram draws it, on the left for the start of a line, in the panel's own
// colours: the marks in the text colour, a hollow end filled with the tile's background (the svg's fill, set in CSS).
function MarkerTile({ kind, start, w, h }: { kind: string; start: boolean; w: number; h: number }) {
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <g dangerouslySetInnerHTML={{ __html: markerPreview(kind, w, h, 'currentColor', 'inherit', start) }} />
    </svg>
  );
}

// One end of the selected lines, drawn as it is: the start on the left of the Ends row, the end on the right, so the
// two read as the line. Each opens every end, in groups with what each means, in a popover beside the panel.
// Choosing Nothing at both ends makes a plain line; an arrowhead at either end, an arrow.
function EndButton({ start, current, onPick }: { start: boolean; current: string; onPick: (v: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const btn = React.useRef<HTMLButtonElement>(null);
  const which = start ? 'Start' : 'End', name = END_NAME[current] ?? current;
  return (
    <>
      <button ref={btn} type="button" className={'endbtn' + (start ? ' tail' : ' head')} aria-label={`${which} of the line: ${name}`} title={`${which}: ${name}`}
        aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
        {start && <ChevronDown size={12} aria-hidden="true" />}
        <MarkerTile kind={current} start={start} w={50} h={20} />
        {!start && <ChevronDown size={12} aria-hidden="true" />}
      </button>
      {open && btn.current && <TilePopover anchor={btn.current} label={start ? 'Line starts' : 'Line ends'} groups={ALL_ENDS} current={current}
        className="marker" tile={(k) => <MarkerTile kind={k} start={start} w={36} h={36} />} onPick={onPick} onClose={() => setOpen(false)} />}
    </>
  );
}

// The selection's style, drawn as the look draws it, with its name; it opens every style of the kind, drawn the same
// way, in a popover beside the panel. The drawings sit on the diagram's page colour.
function StylePicker({ sc, styles, current, onPick }: { sc: Scene; styles: Style[]; current: string; onPick: (v: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const btn = React.useRef<HTMLButtonElement>(null);
  const paper = color(sc.look, sc.look.canvas.paper ?? 'paper');
  const byName = new Map(styles.map((s) => [s.name, s]));
  const cur = byName.get(current);
  const drawn = (s: Style | undefined) => <span className="sthumb" style={{ background: paper }}>{s && <Thumb look={sc.look} style={s} />}</span>;
  return (
    <>
      <button ref={btn} type="button" className="stylebtn" aria-label={`Style: ${current}`} title={`Style: ${current}`}
        aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
        {drawn(cur)}
        <span className="sname"><b>{current}</b></span>
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      {open && btn.current && <TilePopover anchor={btn.current} label="Styles" cards info={false} className="stylecard" current={current}
        groups={[
          // the look's own styles first, then the plain ones every look has
          { title: 'This look', choices: styles.filter((s) => !BUILTIN.has(s.name)) },
          { title: 'Built in', choices: styles.filter((s) => BUILTIN.has(s.name)) },
        ].filter((g) => g.choices.length).map((g) => ({ title: g.title, choices: g.choices.map((s) => ({ key: s.name, label: s.name, about: '' })) }))}
        tile={(k) => <>{drawn(byName.get(k))}<span className="tname">{k}</span></>} onPick={onPick} onClose={() => setOpen(false)} />}
    </>
  );
}

// A heading over a few rows of the panel.
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="pgroup" aria-label={title}><h4>{title}</h4>{children}</section>;
}

// One option: its name on the left, its controls on the right. `top` lines the name up with the first of several lines.
function Row({ label, top, children }: { label: string; top?: boolean; children: React.ReactNode }) {
  return <div className={'prow' + (top ? ' top' : '')}><span className="plabel">{label}</span><div className="pctl">{children}</div></div>;
}

// Rotation, opacity and layers: folded shut under a line that says their values, until opened. Whether it is open is
// remembered on this computer.
const ARRANGE_KEY = 'fastdraw.panel.arrange';
function Arrange({ summary, children }: { summary: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(() => { try { return localStorage.getItem(ARRANGE_KEY) === 'open'; } catch { return false; } });
  const flip = () => { setOpen(!open); try { localStorage.setItem(ARRANGE_KEY, open ? 'closed' : 'open'); } catch { /* not kept */ } };
  return (
    <section className="pgroup" aria-label="Arrange">
      <button type="button" className="ghead" aria-expanded={open} onClick={flip}>
        <span>Arrange</span>
        {!open && <span className="gsum">{summary}</span>}
        {open ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronRight size={13} aria-hidden="true" />}
      </button>
      {open && children}
    </section>
  );
}

// A colour that is set less often (a text's, an icon's): the colour and its name on one button that opens the palette.
function ColorChip({ sc, values, current, shown, onPick, label, text }: {
  sc: Scene; values: string[]; current: string | undefined; shown: string; onPick: (v: string) => void; label: string; text?: string;
}) {
  const recent = React.useMemo(() => {
    const has = new Set(values.map((v) => color(sc.look, v).toLowerCase()));
    return customColours(sc).filter((h) => !has.has(h));
  }, [sc, values.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const c = color(sc.look, shown);
  return (
    <ColorPicker className="chip" label={label} title={`${label}: ${shown}`} value={current} palette={values} recent={recent}
      resolve={(v) => color(sc.look, v)} onPick={onPick}>
      <span className={'dot' + (c === 'none' ? ' none' : '')} style={c === 'none' ? undefined : { background: c }} />
      <span className="name">{text ?? shown}</span>
    </ColorPicker>
  );
}

// The rows of a table, one input each. Cells are separated by "|"; "---" is a dividing line; an empty row is removed.
function RowsEditor({ rows, chart, onChange }: { rows: Row[]; chart: boolean; onChange: (rows: RowSpec[]) => void }) {
  const specs: RowSpec[] = rows.map((r) => ({ id: r.id, kind: r.kind, cells: r.cells, vals: r.vals, p: r.p }));
  // a chart row is a series: its name, then its numbers
  const show = (r: RowSpec) => (r.kind === 'rule' ? '---' : chart ? [r.cells[0] ?? '', ...(r.vals ?? [])].join(' | ') : r.cells.join(' | '));
  const nextId = () => { for (let i = 1; ; i++) if (!specs.some((r) => r.id === `r${i}`)) return `r${i}`; };
  const commit = (i: number, v: string) => {
    const text = v.trim();
    if (!text) return onChange(specs.filter((_, k) => k !== i));
    const parts = text.split('|').map((c) => c.trim());
    if (chart) return onChange(specs.map((r, k) => (k === i ? { ...r, cells: [parts[0]], vals: parts.slice(1).filter((v) => /^([+-]?\d*\.?\d+(,[+-]?\d*\.?\d+)?|_)$/.test(v)) } : r)));
    const next: RowSpec = text === '---' ? { kind: 'rule', cells: [] } : { ...specs[i], kind: specs[i].kind === 'rule' ? 'row' : specs[i].kind, cells: splitCells(v) };
    onChange(specs.map((r, k) => (k === i ? next : r)));
  };
  return (
    <section>
      <h4>{chart ? 'Series' : 'Rows'}</h4>
      {specs.map((r, i) => <RowInput key={i + show(r)} value={show(r)} label={`Row ${i + 1}`} onCommit={(v) => commit(i, v)} />)}
      {chart && (
        <div className="seg">
          {(['bars', 'line', 'area', 'dots'] as const).map((k) => (
            <button key={k} title={`Add a series drawn as ${k}`} onClick={() => onChange([...specs, { id: k, kind: 'row', cells: ['Series'], vals: (specs[0]?.vals ?? ['30', '50', '40']).map(() => '50') }])}>+ {k}</button>
          ))}
        </div>
      )}
      {!chart && <div className="seg">
        <button title="Add a row at the bottom" onClick={() => onChange([...specs, { id: nextId(), kind: 'row', cells: ['name', 'value'] }])}>Add row</button>
        <button title="Add a dividing line at the bottom" onClick={() => onChange([...specs, { kind: 'rule', cells: [] }])}>Add divider</button>
      </div>}
      <p className="muted small">{chart ? 'Name, then the numbers, separated by |. Clear a series to remove it.' : 'Separate columns with |. Clear a row to remove it.'}</p>
    </section>
  );
}
function RowInput({ value, label, onCommit }: { value: string; label: string; onCommit: (v: string) => void }) {
  const [v, setV] = React.useState(value);
  React.useEffect(() => setV(value), [value]);
  return <input className="rowinput" aria-label={label} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onCommit(v)}
    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />;
}

// Small drawn glyphs for the line options, where a picture says more than a word.
const Stroke = ({ dash, w = 1.6, len = 20 }: { dash?: string; w?: number; len?: number }) => (
  <svg width={len + 6} height="14" viewBox={`0 0 ${len + 6} 14`}><line x1="3" y1="7" x2={len + 3} y2="7" stroke="currentColor" strokeWidth={w} strokeDasharray={dash} strokeLinecap="round" /></svg>
);

// An icon's stroke width in pixels; Regular leaves it to the icon's size.
// The stroke widths the panel offers. A width set by a look or by hand (an arrow's 1.4, a focal box's 2) shows as
// the nearest of them, nearest by ratio, since a step from 1 to 1.4 looks as big as one from 2 to 2.8.
const WIDTHS = [['Thin', '1', 1.2], ['Medium', '1.6', 2.2], ['Bold', '2.4', 3.4]] as const;
function widthOf(sw: string | undefined): string {
  const n = Number(sw ?? '1');
  if (!(n > 0)) return '1';
  return WIDTHS.reduce((a, b) => (Math.abs(Math.log(n / +b[1])) < Math.abs(Math.log(n / +a[1])) ? b : a))[1];
}

function IconWidths({ value, onPick }: { value: string | undefined; onPick: (v: string | null) => void }) {
  return (
    // the line thickness in pixels; a built-in icon takes the nearest of its weights
    <div className="seg" role="group" aria-label="Icon weight">
      {([['Thin', '0.5', 0.8], ['Light', '1', 1.3], ['Regular', '', 1.8], ['Bold', '2', 2.8]] as const).map(([l, v, w]) => (
        <button key={l} title={l} aria-label={l} className={(value ?? '') === v ? 'on' : ''} onClick={() => onPick(v || null)}><Stroke w={w} /></button>
      ))}
    </div>
  );
}

// How see-through the selection is, 0 to 100%: the canvas follows the slider, and letting go writes opacity= once
// (one undo step). Fully opaque is left off unless the style makes the element see-through.
function Opacity({ value, own, act }: { value: number; own: boolean; act: PanelActions }) {
  const [v, setV] = React.useState(value);
  React.useEffect(() => setV(value), [value]);
  // the preview redraws the selection at the new value, so whether it still needs writing is kept apart
  const pending = React.useRef(false);
  const out = (pc: number) => (pc >= 100 && !own ? null : String(pc / 100));
  const done = () => { if (pending.current) { pending.current = false; act.setProp('opacity', out(v)); } };
  return (
    <div className="opacity">
      <input type="range" min={0} max={100} step={5} value={v} aria-label="Opacity"
        onChange={(e) => { const n = +e.target.value; setV(n); pending.current = true; act.previewProp('opacity', out(n)); }}
        onPointerUp={done} onKeyUp={done} onBlur={done} />
      <span className="value">{v}%</span>
    </div>
  );
}

// How far the selection is turned, in degrees clockwise: typed (Enter or leaving the field writes it), or a quarter
// turn either way from the buttons.
function Rotation({ value, act }: { value: number; act: PanelActions }) {
  const [v, setV] = React.useState(String(value));
  React.useEffect(() => setV(String(value)), [value]);
  const commit = () => { const n = Number(v); if (v.trim() !== '' && Number.isFinite(n) && n !== value) act.rotate(n); else setV(String(value)); };
  return (
    <div className="rotation">
      <label className="angle">
        <input value={v} inputMode="decimal" aria-label="Rotation in degrees" onChange={(e) => setV(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLElement).blur(); } }} />
        <span>°</span>
      </label>
      <div className="seg">
        <button title="Turn a quarter anticlockwise" aria-label="Turn a quarter anticlockwise" onClick={() => act.rotate(value - 90)}><RotateCcw size={16} /></button>
        <button title="Turn a quarter clockwise" aria-label="Turn a quarter clockwise" onClick={() => act.rotate(value + 90)}><RotateCw size={16} /></button>
      </div>
    </div>
  );
}

export function Panel({ sc, src, sel, act }: { sc: Scene; src: string; sel: string[]; act: PanelActions }) {
  const els = sel.map((id) => find(sc, id)).filter((e) => !!e);
  if (!els.length) return null;
  const first = els[0]!;
  const kind = first.kind;
  const same = els.every((e) => e!.kind === kind);
  // a stroke drawn by hand (any open outline) is only a line: it has no inside to fill and carries no text or icon
  const stroke = els.every((e) => e!.kind === 'shape' && !!e!.el.poly && e!.el.p.open === '1');
  const p = first.el.p;
  // whether a selected element's style gives `key` a colour: then "none" has to be written out, as leaving the
  // property off would bring the style's colour back
  // a caption across the top, as a zone has: its text is a title and it draws no second line
  const caption = p['title.pos'] === 'top';
  const styleTints = (key: string) => els.some((e) => { const v = sc.look.styles.get(e!.el.style)?.props[key]; return !!v && v !== 'none'; });
  // each of the look's colours once (two names for one colour show as one swatch); tints are the popover's shades
  const seen = new Set<string>();
  const names = [...sc.look.colors.keys()].filter((n) => {
    const c = color(sc.look, n).toLowerCase();
    if (n === 'paper' || seen.has(c)) return false;
    seen.add(c);
    return true;
  });
  const white = seen.has('#ffffff') ? [] : ['#ffffff'];
  const fills = ['none', ...white, ...names];
  const strokes = [...names, 'none'];
  const iconFills = ['none', ...names];
  // the quick picks in front of each palette: ink and four colours, or none and four light tints of them
  const hues = vivid(sc, names).slice(0, 4);
  const inks = names.includes('ink') ? ['ink', ...hues] : names.slice(0, 5);
  const topFills = ['none', ...hues.map((n) => `${n}/0.08`)];
  const topIconFills = ['none', ...hues.map((n) => `${n}/0.2`)];
  const iconShape = same && kind === 'shape' && els.every((e) => e!.kind === 'shape' && e!.el.shape === 'icon');
  const solidIcon = iconShape && p['icon.style'] === 'solid';
  const styles = [...sc.look.styles.values()].filter((s) => s.kind === (kind === 'conn' ? 'line' : kind));
  const dashOf = (v: string | undefined) => (!v || v === 'none' ? 'solid' : v.startsWith('1') || v.startsWith('2') ? 'dotted' : 'dashed');
  const colorKey = kind === 'conn' ? 'label.color' : 'title.color';
  const sizeKey = kind === 'shape' ? 'title.size' : kind === 'text' ? 'size' : 'label.size';
  // what the element's style says for a key: picking that again drops the override
  const styleProp = (k: string): string | undefined => sc.look.styles.get(first.el.style)?.props[k];
  const fontKey = kind === 'shape' ? 'title.font' : kind === 'text' ? 'font' : 'label.font';
  const font = p[fontKey] ?? 'sans';
  // the size the text is drawn at when nothing sets it: the renderer's own fallbacks (an icon's caption is a size smaller)
  const baseSize = styleProp(sizeKey) ?? (kind === 'conn' ? '8' : iconShape ? '11' : '12');
  const size = p[sizeKey] ?? baseSize;
  const sizes = kind === 'conn' ? [['S', '8'], ['M', '10'], ['L', '12']] : kind === 'text' ? [['S', '9'], ['M', '12'], ['L', '16'], ['XL', '28']] : [['S', '10'], ['M', '12'], ['L', '15'], ['XL', '18']];
  // the ends as drawn, not as written: `a -> b head=none` has no arrowhead, whatever its operator says
  const boxes = els.filter((e) => e!.kind !== 'conn').length;
  const aligns: [AlignMode, string, React.ReactNode][] = [
    ['left', 'Align left edges', <AlignStartVertical size={16} />], ['hcenter', 'Centre horizontally', <AlignCenterVertical size={16} />], ['right', 'Align right edges', <AlignEndVertical size={16} />],
    ['top', 'Align top edges', <AlignStartHorizontal size={16} />], ['vcenter', 'Centre vertically', <AlignCenterHorizontal size={16} />], ['bottom', 'Align bottom edges', <AlignEndHorizontal size={16} />],
  ];

  const dash = dashOf(p.dash);
  const lineLook = (
    // a stroke's dash and width, side by side under its colour
    <div className="segs">
      <div className="seg" role="radiogroup" aria-label="Stroke style">
        {([['solid', 'Solid', 'none', undefined], ['dashed', 'Dashed', '5,4', '5 4'], ['dotted', 'Dotted', '1,4', '0.5 4']] as const).map(([k, l, v, d]) => (
          <button key={k} role="radio" aria-checked={dash === k} title={l} aria-label={l} className={dash === k ? 'on' : ''} onClick={() => act.setProp('dash', v)}><Stroke dash={d} len={16} /></button>
        ))}
      </div>
      <div className="seg" role="radiogroup" aria-label="Stroke width">
        {WIDTHS.map(([l, v, w]) => (
          <button key={l} role="radio" aria-checked={widthOf(p.sw) === v} title={l} aria-label={l} className={widthOf(p.sw) === v ? 'on' : ''}
            onClick={() => act.setProp('sw', v === widthOf(styleProp('sw')) ? null : v)}><Stroke w={w} len={16} /></button>
        ))}
      </div>
    </div>
  );
  const textSize = (
    <div className="seg" role="radiogroup" aria-label="Text size">
      {sizes.map(([l, v]) => <button key={l} role="radio" aria-checked={size === v} className={size === v ? 'on' : ''} onClick={() => act.setProp(sizeKey, v === baseSize ? null : v)}>{l}</button>)}
    </div>
  );
  const fonts = (
    <div className="seg wrap" role="radiogroup" aria-label="Font">
      {[...sc.look.fonts.keys()].map((f) => (
        <button key={f} role="radio" aria-checked={font === f} aria-label={f} title={`${f}: ${fontFamily(sc.look, f).split(',')[0]!.replace(/"/g, '')}`}
          className={'font' + (font === f ? ' on' : '')} style={{ fontFamily: fontFamily(sc.look, f) }}
          onClick={() => act.setProp(fontKey, f === styleProp(fontKey) ? null : f)}>{f[0]!.toUpperCase() + f.slice(1)}</button>
      ))}
    </div>
  );
  const textColour = (
    <ColorChip sc={sc} values={names} current={p[colorKey]} shown={p[colorKey] ?? styleProp(colorKey) ?? (kind === 'conn' ? p.stroke ?? styleProp('stroke') ?? 'muted' : 'ink')}
      onPick={(v) => act.setProp(colorKey, v)} label="Text colour" />
  );
  const boxText = els.length === 1 && first.kind === 'shape' && !stroke && !first.el.legend && !first.el.rows;
  const hasIcon = same && kind === 'shape' && !stroke && !first.el.legend && !first.el.rows;
  const legend = els.length === 1 && first.kind === 'shape' ? first.el.legend : undefined;
  const rows = els.length === 1 && first.kind === 'shape' ? first.el.rows : undefined;
  const opacity = Math.round(Math.min(1, Math.max(0, Number(p.opacity ?? 1) || 0)) * 100);
  const turnable = els.every((e) => e!.kind !== 'conn');

  return (
    <aside className="panel" onPointerDown={(e) => e.stopPropagation()}>
      {same && <StylePicker sc={sc} styles={styles} current={first.el.style} onPick={act.setStyle} />}

      {(boxText || hasIcon || legend || rows) && (
        <Group title="Content">
          {boxText && (
            <>
              <Row label={caption ? 'Title' : 'Text'} top><TextField bare label={caption ? 'Title' : 'Text'} value={first.el.text ?? ''} onCommit={act.setText} multiline /></Row>
              {!caption && <Row label="Below"><TextField bare label="Second line" placeholder="Second line" value={p.sub ?? ''} onCommit={(v) => act.setProp('sub', v || null)} /></Row>}
              <Row label="Tag"><TextField bare label="Corner tag" placeholder="Corner tag" value={p.tag ?? ''} onCommit={(v) => act.setProp('tag', v || null)} /></Row>
            </>
          )}
          {hasIcon && (
            <Row label="Icon" top>
              <IconField look={sc.look} value={p.icon} iconStyle={p['icon.style'] === 'solid' || p['icon.style'] === 'duotone' ? p['icon.style'] : 'outline'}
                onPick={(n, style) => act.setProps({ icon: n, 'icon.style': style !== 'outline' ? style : null })} />
              {p.icon && p.icon !== 'none' && !iconShape && (
                <>
                  <div className="seg">
                    {[['', 'Beside the text'], ['top', 'Above the text']].map(([v, l]) => (
                      <button key={l} aria-label={l} title={`Icon ${l.toLowerCase()}`} className={(p['icon.pos'] ?? '') === v || (v === '' && p['icon.pos'] === 'left') ? 'on' : ''} onClick={() => act.setProp('icon.pos', v || null)}>{l.split(' ')[0]}</button>
                    ))}
                  </div>
                  <div className="seg" role="group" aria-label="Icon size">
                    {[['Auto', ''], ['S', '16'], ['M', '24'], ['L', '32'], ['XL', '48']].map(([l, v]) => (
                      <button key={l} title={v ? `${v}px` : 'Sized to fit the box'} className={(p['icon.size'] ?? '') === v ? 'on' : ''} onClick={() => act.setProp('icon.size', v || null)}>{l}</button>
                    ))}
                  </div>
                  {!sc.look.images.has(p.icon) && (
                    <>
                      <div className="chips">
                        <ColorChip sc={sc} values={names} current={p['icon.color']} shown={p['icon.color'] ?? styleProp('icon.color') ?? 'ink'} text="Colour"
                          onPick={(v) => act.setProp('icon.color', v)} label="Icon colour" />
                        <ColorChip sc={sc} values={iconFills} current={p['icon.fill']} shown={p['icon.fill'] ?? styleProp('icon.fill') ?? 'none'} text="Tint"
                          onPick={(v) => act.setProp('icon.fill', v !== 'none' ? v : styleTints('icon.fill') ? 'none' : null)} label="Icon tint" />
                      </div>
                      <IconWidths value={p['icon.width']} onPick={(v) => act.setProp('icon.width', v)} />
                    </>
                  )}
                </>
              )}
            </Row>
          )}
          {legend && legend.map((it) => <Row key={it.style} label={it.style}><TextField bare label={it.style} value={it.label} onCommit={(v) => act.setProp(it.style, v || null)} /></Row>)}
          {legend && <p className="muted small">Clear an entry to remove it.</p>}
          {rows && first.kind === 'shape' && <RowsEditor rows={rows} chart={first.el.shape === 'chart'} onChange={act.setRows} />}
        </Group>
      )}

      {same && iconShape && (
        // an icon on its own is the shape: fill, stroke and width are the icon's, and there is no box to style
        <Group title="Appearance">
          {/* a solid icon is one filled shape: only its colour (stroke=) applies; fill= is the tint under an outline */}
          <Row label="Colour"><Swatches sc={sc} values={names} top={inks} current={p.stroke ?? 'ink'} onPick={(v) => act.setProp('stroke', v === 'ink' ? null : v)} custom="Custom icon colour" label="Icon colours" /></Row>
          {!solidIcon && <Row label="Tint"><Swatches sc={sc} values={iconFills} top={topIconFills} current={p.fill ?? 'none'} onPick={(v) => act.setProp('fill', v !== 'none' ? v : styleTints('fill') ? 'none' : null)} custom="Custom icon fill" label="Icon fill colours" /></Row>}
          {!solidIcon && <Row label="Weight"><IconWidths value={p.sw} onPick={(v) => act.setProp('sw', v)} /></Row>}
        </Group>
      )}
      {same && kind === 'shape' && !iconShape && (
        <Group title="Appearance">
          {!stroke && <Row label="Fill"><Swatches sc={sc} values={fills} top={topFills} current={p.fill} onPick={(v) => act.setProp('fill', v)} custom="Custom background colour" label="Background colours" /></Row>}
          <Row label="Stroke" top>
            <Swatches sc={sc} values={strokes} top={inks} current={p.stroke} onPick={(v) => act.setProp('stroke', v)} custom="Custom stroke colour" label="Stroke colours" />
            {lineLook}
          </Row>
        </Group>
      )}
      {same && kind === 'conn' && first.kind === 'conn' && (
        <Group title="Line">
          <Row label="Colour"><Swatches sc={sc} values={strokes} top={inks} current={p.stroke} onPick={(v) => act.setProp('stroke', v)} custom="Custom stroke colour" label="Stroke colours" /></Row>
          <Row label="Stroke">{lineLook}</Row>
          <Row label="Shape">
            <div className="seg" role="radiogroup" aria-label="Line shape">
              {[['ortho', 'Right angles', 'M3 11 H12 Q14 11 14 9 V5 Q14 3 16 3 H23'], ['straight', 'Straight', 'M3 11 L23 3'], ['curve', 'Curved', 'M3 11 C12 11 14 3 23 3']].map(([v, l, d]) => (
                <button key={v} role="radio" aria-checked={(p.route ?? 'ortho') === v} title={l} aria-label={l} className={(p.route ?? 'ortho') === v ? 'on' : ''} onClick={() => act.setRoute(v)}>
                  <svg width="26" height="14" viewBox="0 0 26 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d={d} /></svg>
                </button>
              ))}
            </div>
          </Row>
          <Row label="Ends">
            <div className="endpair">
              <EndButton start current={first.el.tailM} onPick={(v) => act.setProp('tail', v)} />
              <EndButton start={false} current={first.el.headM} onPick={(v) => act.setProp('head', v)} />
            </div>
          </Row>
          {(p.via || p.lpos) && (
            <Row label="Route"><div className="seg"><button title="Forget the hand-set route and label position" onClick={act.resetRoute}>Route automatically</button></div></Row>
          )}
        </Group>
      )}

      {same && kind === 'conn' && (
        <Group title="Label">
          <Row label="Place">
            <div className="seg" role="radiogroup" aria-label="Label position">
              {[['', 'Above'], ['below', 'Below'], ['left', 'Left']].map(([v, l]) => (
                <button key={l} role="radio" aria-checked={(p.lside ?? '') === v} className={(p.lside ?? '') === v ? 'on' : ''} onClick={() => act.setProp('lside', v || null)}>{l}</button>
              ))}
            </div>
          </Row>
          <Row label="Size">{textSize}</Row>
          <Row label="Font">{fonts}</Row>
          <Row label="Colour">{textColour}</Row>
        </Group>
      )}
      {same && kind === 'text' && (
        <Group title="Text">
          <Row label="Colour"><Swatches sc={sc} values={names} top={inks} current={p.color} onPick={(v) => act.setProp('color', v)} custom="Custom text colour" label="Text colours" /></Row>
          <Row label="Size">{textSize}</Row>
          <Row label="Font">{fonts}</Row>
          <Row label="Align">{textAlign()}</Row>
        </Group>
      )}
      {same && kind === 'shape' && !stroke && (
        <Group title="Text">
          <Row label="Size">{textSize}</Row>
          {!iconShape && <Row label="Font">{fonts}</Row>}
          {!iconShape && <Row label="Align">{textAlign()}</Row>}
          {!iconShape && <Row label="Colour">{textColour}</Row>}
        </Group>
      )}

      {boxes >= 2 && (
        <Group title="Align">
          <div className="seg wrap">
            {aligns.map(([m, label, icon]) => <button key={m} title={label} aria-label={label} onClick={() => act.align(m)}>{icon}</button>)}
          </div>
        </Group>
      )}

      <Arrange summary={[turnable ? `${turnOf(p)}°` : '', `${opacity}%`].filter(Boolean).join(' · ')}>
        {turnable && <Row label="Rotation"><Rotation value={turnOf(p)} act={act} /></Row>}
        <Row label="Opacity"><Opacity value={opacity} own={els.some((e) => sc.look.styles.get(e!.el.style)?.props.opacity !== undefined)} act={act} /></Row>
        <Row label="Layer">
          <div className="seg">
            <button title="Send to back (Ctrl+Shift+[)" aria-label="Send to back" onClick={() => act.reorder('back')}><ArrowDownToLine size={16} /></button>
            <button title="Send backward (Ctrl+[)" aria-label="Send backward" onClick={() => act.reorder('backward')}><ArrowDown size={16} /></button>
            <button title="Bring forward (Ctrl+])" aria-label="Bring forward" onClick={() => act.reorder('forward')}><ArrowUp size={16} /></button>
            <button title="Bring to front (Ctrl+Shift+])" aria-label="Bring to front" onClick={() => act.reorder('front')}><ArrowUpToLine size={16} /></button>
          </div>
        </Row>
      </Arrange>

      <div className="seg pfoot">
        <button title="Duplicate (Ctrl+D)" aria-label="Duplicate" onClick={act.duplicate}><Copy size={16} /></button>
        <button title="Delete (Del)" aria-label="Delete" className="danger" onClick={act.remove}><Trash2 size={16} /></button>
      </div>
    </aside>
  );

  // the text's alignment: a free text lines up inside its box (width=); one without a box shows none until it has one
  function textAlign() {
    return (
      <div className="seg" role="radiogroup" aria-label="Text align">
        {([['start', 'left', 'Left', <TextAlignStart size={16} />], ['middle', 'center', 'Centre', <TextAlignCenter size={16} />], ['end', 'right', 'Right', <TextAlignEnd size={16} />]] as const).map(([a, al, l, icon]) => {
          const boxed = first.kind === 'text' && !!first.el.lines;
          const on = kind === 'text' ? boxed && (p.align ?? 'left') === al : (p['title.align'] ?? 'center') === al;
          const pick = () => kind === 'text' ? act.setTextAlign(al) : act.setProp('title.align', al === (styleProp('title.align') ?? 'center') ? null : al);
          return <button key={a} role="radio" aria-checked={on} aria-label={`Align ${l.toLowerCase()}`} title={l} className={on ? 'on' : ''} onClick={pick}>{icon}</button>;
        })}
      </div>
    );
  }
}
