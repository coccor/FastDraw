import React from 'react';
import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignStartHorizontal, AlignStartVertical,
  BringToFront, Copy, SendToBack, Trash2,
} from 'lucide-react';
import { color } from '../../src/look.ts';
import { MARKERS } from '../../src/scene.ts';
import type { Scene, Row } from '../../src/scene.ts';
import type { RowSpec } from '../../src/edit.ts';
import { find, stmtToks } from './ops.ts';
import { IconPicker } from './IconPicker.tsx';
import type { AlignMode } from './ops.ts';

export type PanelActions = {
  setProp: (k: string, v: string | null) => void;
  setStyle: (name: string) => void;
  setOp: (op: string) => void;
  reorder: (where: 'front' | 'back') => void;
  align: (mode: AlignMode) => void;
  remove: () => void;
  duplicate: () => void;
  setCanvas: (bg?: Record<string, string | null>) => void;
  resetRoute: () => void;
  setRows: (rows: RowSpec[]) => void;
  setRoute: (route: string) => void;
};

// `custom` adds a last swatch that opens the system colour picker; it shows the chosen colour when that is not one of `values`.
export function Swatches({ sc, values, current, onPick, custom, label }: { sc: Scene; values: string[]; current: string | undefined; onPick: (v: string) => void; custom?: string; label?: string }) {
  const own = !!current && !values.includes(current) && /^#[0-9a-f]{6}$/i.test(current) ? current : null;
  return (
    <div className="swatches" role={label ? "group" : undefined} aria-label={label}>
      {values.map((v) => {
        const c = color(sc.look, v);
        return (
          <button key={v} title={v === 'none' ? 'None' : v} aria-label={v} className={'swatch' + (current === v ? ' on' : '') + (c === 'none' ? ' none' : '')}
            onClick={() => onPick(v)} style={{ background: c === 'none' ? undefined : c }} />
        );
      })}
      {custom && (
        <label className={'custom' + (own ? ' on' : '')} title={own ? `${own} (pick another)` : 'Any colour'} style={own ? { background: own } : undefined}>
          <input type="color" aria-label={custom} value={own ?? (/^#[0-9a-f]{6}$/i.test(color(sc.look, current)) ? color(sc.look, current) : '#000000')} onChange={(e) => onPick(e.target.value)} />
        </label>
      )}
    </div>
  );
}

export function TextField({ label, value, onCommit }: { label: string; value: string; onCommit: (v: string) => void }) {
  const [v, setV] = React.useState(value);
  React.useEffect(() => setV(value), [value]);
  return (
    <label className="field">
      <span>{label}</span>
      <input value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onCommit(v)}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
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
    const next: RowSpec = text === '---' ? { kind: 'rule', cells: [] } : { ...specs[i], kind: specs[i].kind === 'rule' ? 'row' : specs[i].kind, cells: text.split('|').map((c) => c.trim()) };
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
    <div className="seg" role="group" aria-label="Icon stroke width">
      {([['Thin', '1', 1.2], ['Regular', '', 1.8], ['Bold', '2', 2.6], ['Heavy', '2.75', 3.4]] as const).map(([l, v, w]) => (
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
  const names = [...sc.look.colors.keys()].filter((n) => n !== 'paper');
  const fills = ['none', '#ffffff', ...names.map((n) => `${n}/0.08`), ...names.filter((n) => n !== 'ink')];
  const strokes = [...names, ...names.slice(0, 1).map((n) => `${n}/0.3`), 'none'];
  const iconFills = ['none', ...names.filter((n) => n !== 'ink').map((n) => `${n}/0.2`), ...names];
  const iconShape = same && kind === 'shape' && els.every((e) => e!.kind === 'shape' && e!.el.shape === 'icon');
  const styles = [...sc.look.styles.values()].filter((s) => s.kind === (kind === 'conn' ? 'line' : kind));
  const dashOf = (v: string | undefined) => (!v || v === 'none' ? 'solid' : v.startsWith('1') || v.startsWith('2') ? 'dotted' : 'dashed');
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
          <section><h4>Fill</h4><Swatches sc={sc} values={iconFills} current={p.fill ?? 'none'} onPick={(v) => act.setProp('fill', v === 'none' ? null : v)} custom="Custom icon fill" label="Icon fill colours" /></section>
          <section><h4>Stroke</h4><Swatches sc={sc} values={names} current={p.stroke ?? 'ink'} onPick={(v) => act.setProp('stroke', v === 'ink' ? null : v)} custom="Custom icon colour" label="Icon stroke colours" /></section>
          <section>
            <h4>Stroke width</h4>
            <IconWidths value={p.sw} onPick={(v) => act.setProp('sw', v)} />
          </section>
        </>
      )}
      {same && kind === 'shape' && !stroke && !iconShape && (
        <section><h4>Background</h4><Swatches sc={sc} values={fills} current={p.fill} onPick={(v) => act.setProp('fill', v)} /></section>
      )}
      {same && kind !== 'text' && !iconShape && (
        <>
          <section><h4>Stroke</h4><Swatches sc={sc} values={strokes} current={p.stroke} onPick={(v) => act.setProp('stroke', v)} /></section>
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
        <section><h4>Colour</h4><Swatches sc={sc} values={names} current={p.color} onPick={(v) => act.setProp('color', v)} /></section>
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
          <IconPicker look={sc.look} value={p.icon} onPick={(n) => act.setProp('icon', n)} />
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
                  <div className="sublabel">Icon stroke</div>
                  <div className="seg" style={{ marginBottom: 4 }}>
                    <button className={!p['icon.color'] ? 'on' : ''} title="Same colour as the text" onClick={() => act.setProp('icon.color', null)}>Text colour</button>
                  </div>
                  <Swatches sc={sc} values={names} current={p['icon.color']} onPick={(v) => act.setProp('icon.color', v)} custom="Custom icon colour" label="Icon stroke colours" />
                  <div className="sublabel">Icon fill</div>
                  <Swatches sc={sc} values={iconFills} current={p['icon.fill'] ?? 'none'}
                    onPick={(v) => act.setProp('icon.fill', v === 'none' ? null : v)} custom="Custom icon fill" label="Icon fill colours" />
                  <div className="sublabel">Icon stroke width</div>
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
          <h4>Extra text</h4>
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
          <button title="Bring to front" aria-label="Bring to front" onClick={() => act.reorder('front')}><BringToFront size={16} /></button>
          <button title="Send to back" aria-label="Send to back" onClick={() => act.reorder('back')}><SendToBack size={16} /></button>
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
