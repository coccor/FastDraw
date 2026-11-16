import React from 'react';
import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignStartHorizontal, AlignStartVertical,
  ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpToLine, Copy, Trash2,
} from 'lucide-react';
import { color } from '../../src/look.ts';
import { MARKERS } from '../../src/scene.ts';
import type { Scene, Row } from '../../src/scene.ts';
import type { RowSpec } from '../../src/edit.ts';
import { splitCells } from '../../src/edit.ts';
import { find, stmtToks } from './ops.ts';
import { IconField } from './IconPicker.tsx';
import { ColorPicker } from './ColorPicker.tsx';
import type { AlignMode, Layering } from './ops.ts';

export type PanelActions = {
  setProp: (k: string, v: string | null) => void;
  setText: (text: string) => void;
  setProps: (kv: Record<string, string | null>) => void;
  setStyle: (name: string) => void;
  setOp: (op: string) => void;
  reorder: (where: Layering) => void;
  align: (mode: AlignMode) => void;
  remove: () => void;
  duplicate: () => void;
  setCanvas: (bg?: Record<string, string | null>) => void;
  resetRoute: () => void;
  setRows: (rows: RowSpec[]) => void;
  setRoute: (route: string) => void;
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
export function TextField({ label, value, onCommit, multiline }: { label: string; value: string; onCommit: (v: string) => void; multiline?: boolean }) {
  const [v, setV] = React.useState(value);
  React.useEffect(() => setV(value), [value]);
  const done = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !(multiline && e.shiftKey)) { e.preventDefault(); (e.target as HTMLElement).blur(); } };
  return (
    <label className="field">
      <span>{label}</span>
      {multiline
        ? <textarea value={v} rows={Math.min(4, v.split('\n').length)} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onCommit(v)} onKeyDown={done} />
        : <input value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onCommit(v)} onKeyDown={done} />}
    </label>
  );
}

const MARKER_NAMES: Record<string, string> = {
  none: 'Nothing', arrow: 'Arrow', open: 'Open arrow', triangle: 'Hollow triangle', diamond: 'Hollow diamond', 'diamond-solid': 'Filled diamond',
  dot: 'Dot', circle: 'Circle', one: 'One', 'only-one': 'Exactly one', many: 'Many', 'one-many': 'One or more', 'zero-one': 'Zero or one', 'zero-many': 'Zero or more',
};

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
const Stroke = ({ dash, w = 1.6 }: { dash?: string; w?: number }) => (
  <svg width="26" height="14" viewBox="0 0 26 14"><line x1="3" y1="7" x2="23" y2="7" stroke="currentColor" strokeWidth={w} strokeDasharray={dash} strokeLinecap="round" /></svg>
);
const Ends = ({ a, b }: { a: boolean; b: boolean }) => (
  <svg width="26" height="14" viewBox="0 0 26 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="7" x2="22" y2="7" />
    {b && <path d="M18 3 L22 7 L18 11" />}
    {a && <path d="M8 3 L4 7 L8 11" />}
  </svg>
);

// An icon's stroke width in pixels; Regular leaves it to the icon's size.
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

export function Panel({ sc, src, sel, act }: { sc: Scene; src: string; sel: string[]; act: PanelActions }) {
  const els = sel.map((id) => find(sc, id)).filter((e) => !!e);
  if (!els.length) return null;
  const first = els[0]!;
  const kind = first.kind;
  const same = els.every((e) => e!.kind === kind);
  // a stroke drawn by hand (any open outline) is only a line: it has no inside to fill and carries no text or icon
  const stroke = els.every((e) => e!.kind === 'shape' && !!e!.el.poly && e!.el.p.open === '1');
  const p = first.el.p;
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
  const sizes = kind === 'conn' ? [['S', '8'], ['M', '10'], ['L', '12']] : kind === 'text' ? [['S', '9'], ['M', '12'], ['L', '16'], ['XL', '28']] : [['S', '10'], ['M', '12'], ['L', '15'], ['XL', '18']];
  const op = kind === 'conn' ? stmtToks(src, first.el.line)?.find((t) => t.t === 'word' && ['->', '--', '<->'].includes(t.v))?.v : undefined;
  const boxes = els.filter((e) => e!.kind !== 'conn').length;
  const aligns: [AlignMode, string, React.ReactNode][] = [
    ['left', 'Align left edges', <AlignStartVertical size={16} />], ['hcenter', 'Centre horizontally', <AlignCenterVertical size={16} />], ['right', 'Align right edges', <AlignEndVertical size={16} />],
    ['top', 'Align top edges', <AlignStartHorizontal size={16} />], ['vcenter', 'Centre vertically', <AlignCenterHorizontal size={16} />], ['bottom', 'Align bottom edges', <AlignEndHorizontal size={16} />],
  ];

  return (
    <aside className="panel" onPointerDown={(e) => e.stopPropagation()}>
      {same && (
        <section>
          <h4>Style</h4>
          <select value={first.el.style} onChange={(e) => act.setStyle(e.target.value)}>
            {styles.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
        </section>
      )}
      {iconShape && (
        // an icon on its own is the shape: fill, stroke and width are the icon's, and there is no box to style
        <>
          {/* a solid icon is one filled shape: only its colour (stroke=) applies; fill= is the tint under an outline */}
          {!solidIcon && <section><h4>Tint</h4><Swatches sc={sc} values={iconFills} top={topIconFills} current={p.fill ?? 'none'} onPick={(v) => act.setProp('fill', v === 'none' ? null : v)} custom="Custom icon fill" label="Icon fill colours" /></section>}
          <section><h4>Colour</h4><Swatches sc={sc} values={names} top={inks} current={p.stroke ?? 'ink'} onPick={(v) => act.setProp('stroke', v === 'ink' ? null : v)} custom="Custom icon colour" label="Icon colours" /></section>
          {!solidIcon && (
            <section>
              <h4>Weight</h4>
              <IconWidths value={p.sw} onPick={(v) => act.setProp('sw', v)} />
            </section>
          )}
        </>
      )}
      {same && kind === 'shape' && !stroke && !iconShape && (
        <section><h4>Background</h4><Swatches sc={sc} values={fills} top={topFills} current={p.fill} onPick={(v) => act.setProp('fill', v)} custom="Custom background colour" label="Background colours" /></section>
      )}
      {same && kind !== 'text' && !iconShape && (
        <>
          <section><h4>Stroke</h4><Swatches sc={sc} values={strokes} top={inks} current={p.stroke} onPick={(v) => act.setProp('stroke', v)} custom="Custom stroke colour" label="Stroke colours" /></section>
          <section>
            <h4>Stroke style</h4>
            <div className="seg">
              <button title="Solid" className={dashOf(p.dash) === 'solid' ? 'on' : ''} onClick={() => act.setProp('dash', 'none')}><Stroke /></button>
              <button title="Dashed" className={dashOf(p.dash) === 'dashed' ? 'on' : ''} onClick={() => act.setProp('dash', '5,4')}><Stroke dash="5 4" /></button>
              <button title="Dotted" className={dashOf(p.dash) === 'dotted' ? 'on' : ''} onClick={() => act.setProp('dash', '1,4')}><Stroke dash="0.5 4" /></button>
            </div>
          </section>
          <section>
            <h4>Stroke width</h4>
            <div className="seg">
              {[['Thin', '1', 1.2], ['Medium', '1.6', 2.2], ['Bold', '2.4', 3.4]].map(([l, v, w]) => (
                <button key={l as string} title={l as string} className={(p.sw ?? '1') === v ? 'on' : ''} onClick={() => act.setProp('sw', v as string)}><Stroke w={w as number} /></button>
              ))}
            </div>
          </section>
        </>
      )}
      {same && kind === 'text' && (
        <section><h4>Colour</h4><Swatches sc={sc} values={names} top={inks} current={p.color} onPick={(v) => act.setProp('color', v)} custom="Custom text colour" label="Text colours" /></section>
      )}
      {same && kind === 'conn' && (
        <>
          <section>
            <h4>Arrowheads</h4>
            <div className="seg">
              <button title="No arrowhead" className={op === '--' ? 'on' : ''} onClick={() => act.setOp('--')}><Ends a={false} b={false} /></button>
              <button title="Arrowhead at the end" className={op === '->' ? 'on' : ''} onClick={() => act.setOp('->')}><Ends a={false} b /></button>
              <button title="Arrowheads at both ends" className={op === '<->' ? 'on' : ''} onClick={() => act.setOp('<->')}><Ends a b /></button>
            </div>
          </section>
          <section>
            <h4>Line shape</h4>
            <div className="seg">
              {[['ortho', 'Right angles', 'M3 11 H12 Q14 11 14 9 V5 Q14 3 16 3 H23'], ['straight', 'Straight', 'M3 11 L23 3'], ['curve', 'Curved', 'M3 11 C12 11 14 3 23 3']].map(([v, l, d]) => (
                <button key={v} title={l} aria-label={l} className={(p.route ?? 'ortho') === v ? 'on' : ''} onClick={() => act.setRoute(v)}>
                  <svg width="26" height="14" viewBox="0 0 26 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d={d} /></svg>
                </button>
              ))}
            </div>
          </section>
          <section>
            <h4>Line ends</h4>
            {([['tail', 'Start', first.kind === 'conn' ? first.el.tailM : 'none'], ['head', 'End', first.kind === 'conn' ? first.el.headM : 'none']] as const).map(([k, label, cur]) => (
              <label className="field" key={k}>
                <span>{label}</span>
                <select aria-label={`${label} of the line`} value={cur} onChange={(e) => act.setProp(k, e.target.value)}>
                  {MARKERS.map((m) => <option key={m} value={m}>{MARKER_NAMES[m] ?? m}</option>)}
                </select>
              </label>
            ))}
          </section>
          {(p.via || p.lpos) && (
            <section>
              <h4>Route</h4>
              <div className="seg"><button title="Forget the hand-set route and label position" onClick={act.resetRoute}>Route automatically</button></div>
            </section>
          )}
          <section>
            <h4>Label position</h4>
            <div className="seg">
              {[['', 'Above'], ['below', 'Below'], ['left', 'Left']].map(([v, l]) => (
                <button key={l} className={(p.lside ?? '') === v ? 'on' : ''} onClick={() => act.setProp('lside', v || null)}>{l}</button>
              ))}
            </div>
          </section>
        </>
      )}
      {same && !stroke && (
        <section>
          <h4>Text size</h4>
          <div className="seg">
            {sizes.map(([l, v]) => <button key={l} className={p[sizeKey] === v ? 'on' : ''} onClick={() => act.setProp(sizeKey, v)}>{l}</button>)}
          </div>
        </section>
      )}
      {same && kind !== 'text' && !stroke && !iconShape && (
        <section>
          <h4>Text colour</h4>
          <Swatches sc={sc} values={names} top={inks} current={p[colorKey]} onPick={(v) => act.setProp(colorKey, v)} custom="Custom text colour" label="Text colours" />
        </section>
      )}
      {els.length === 1 && first.kind === 'shape' && first.el.legend && (
        <section>
          <h4>Legend entries</h4>
          {first.el.legend.map((it) => <TextField key={it.style} label={it.style} value={it.label} onCommit={(v) => act.setProp(it.style, v || null)} />)}
          <p className="muted small">Clear an entry to remove it.</p>
        </section>
      )}
      {same && kind === 'shape' && !stroke && !first.el.legend && !first.el.rows && (
        <section>
          <h4>Icon</h4>
          <IconField look={sc.look} value={p.icon} iconStyle={p['icon.style'] === 'solid' || p['icon.style'] === 'duotone' ? p['icon.style'] : 'outline'}
            onPick={(n, style) => act.setProps({ icon: n, 'icon.style': style !== 'outline' ? style : null })} />
          {p.icon && p.icon !== 'none' && !iconShape && (
            <>
              <div className="seg" style={{ marginTop: 6 }}>
                {[['', 'Beside the text'], ['top', 'Above the text']].map(([v, l]) => (
                  <button key={l} aria-label={l} title={`Icon ${l.toLowerCase()}`} className={(p['icon.pos'] ?? '') === v || (v === '' && p['icon.pos'] === 'left') ? 'on' : ''} onClick={() => act.setProp('icon.pos', v || null)}>{l.split(' ')[0]}</button>
                ))}
              </div>
              <div className="seg" role="group" aria-label="Icon size" style={{ marginTop: 6 }}>
                {[['Auto', ''], ['S', '16'], ['M', '24'], ['L', '32'], ['XL', '48']].map(([l, v]) => (
                  <button key={l} title={v ? `${v}px` : 'Sized to fit the box'} className={(p['icon.size'] ?? '') === v ? 'on' : ''} onClick={() => act.setProp('icon.size', v || null)}>{l}</button>
                ))}
              </div>
              {!sc.look.images.has(p.icon) && (
                <>
                  <div className="sublabel">Icon colour</div>
                  <Swatches sc={sc} values={names} top={inks} current={p['icon.color']} onPick={(v) => act.setProp('icon.color', v)} custom="Custom icon colour" label="Icon colours" />
                  <div className="sublabel">Icon tint</div>
                  <Swatches sc={sc} values={iconFills} top={topIconFills} current={p['icon.fill'] ?? 'none'}
                    onPick={(v) => act.setProp('icon.fill', v === 'none' ? null : v)} custom="Custom icon fill" label="Icon fill colours" />
                  <div className="sublabel">Icon weight</div>
                  <IconWidths value={p['icon.width']} onPick={(v) => act.setProp('icon.width', v)} />
                </>
              )}
            </>
          )}
        </section>
      )}
      {els.length === 1 && first.kind === 'shape' && first.el.rows && <RowsEditor rows={first.el.rows} chart={first.el.shape === 'chart'} onChange={act.setRows} />}
      {els.length === 1 && first.kind === 'shape' && !stroke && !first.el.legend && !first.el.rows && (
        <section>
          <h4>Text</h4>
          <TextField label={first.el.shape === 'rect' && first.el.back ? 'Title' : 'Text'} value={first.el.text ?? ''} onCommit={act.setText} multiline />
          <TextField label="Second line" value={p.sub ?? ''} onCommit={(v) => act.setProp('sub', v || null)} />
          <TextField label="Corner tag" value={p.tag ?? ''} onCommit={(v) => act.setProp('tag', v || null)} />
        </section>
      )}
      {boxes >= 2 && (
        <section>
          <h4>Align</h4>
          <div className="seg wrap">
            {aligns.map(([m, label, icon]) => <button key={m} title={label} aria-label={label} onClick={() => act.align(m)}>{icon}</button>)}
          </div>
        </section>
      )}
      <section>
        <h4>Layers</h4>
        <div className="seg">
          <button title="Send to back (Ctrl+Shift+[)" aria-label="Send to back" onClick={() => act.reorder('back')}><ArrowDownToLine size={16} /></button>
          <button title="Send backward (Ctrl+[)" aria-label="Send backward" onClick={() => act.reorder('backward')}><ArrowDown size={16} /></button>
          <button title="Bring forward (Ctrl+])" aria-label="Bring forward" onClick={() => act.reorder('forward')}><ArrowUp size={16} /></button>
          <button title="Bring to front (Ctrl+Shift+])" aria-label="Bring to front" onClick={() => act.reorder('front')}><ArrowUpToLine size={16} /></button>
        </div>
      </section>
      <section>
        <h4>Actions</h4>
        <div className="seg">
          <button title="Duplicate (Ctrl+D)" aria-label="Duplicate" onClick={act.duplicate}><Copy size={16} /></button>
          <button title="Delete (Del)" aria-label="Delete" className="danger" onClick={act.remove}><Trash2 size={16} /></button>
        </div>
      </section>
    </aside>
  );
}
