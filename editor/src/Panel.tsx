import React from 'react';
import { color } from '../../src/look.ts';
import type { Scene } from '../../src/scene.ts';
import { find, stmtToks } from './ops.ts';
import type { AlignMode } from './ops.ts';

export type PanelActions = {
  setProp: (k: string, v: string | null) => void;
  setStyle: (name: string) => void;
  setOp: (op: string) => void;
  reorder: (where: 'front' | 'back') => void;
  align: (mode: AlignMode) => void;
  remove: () => void;
  duplicate: () => void;
  setCanvas: (w: number, h: number) => void;
};

function Swatches({ sc, values, current, onPick }: { sc: Scene; values: string[]; current: string | undefined; onPick: (v: string) => void }) {
  return (
    <div className="swatches">
      {values.map((v) => {
        const c = color(sc.look, v);
        return (
          <button key={v} title={v} className={'swatch' + (current === v ? ' on' : '')} onClick={() => onPick(v)}
            style={{ background: c === 'none' ? 'transparent' : c }}>{c === 'none' ? '∅' : ''}</button>
        );
      })}
    </div>
  );
}

function TextField({ label, value, onCommit }: { label: string; value: string; onCommit: (v: string) => void }) {
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

export function Panel({ sc, src, sel, act }: { sc: Scene; src: string; sel: string[]; act: PanelActions }) {
  const els = sel.map((id) => find(sc, id)).filter((e) => !!e);
  if (!els.length) {
    return (
      <div className="panel">
        <h4>Canvas</h4>
        <div className="row2">
          <TextField label="Width" value={String(sc.w)} onCommit={(v) => +v > 0 && act.setCanvas(+v, sc.h)} />
          <TextField label="Height" value={String(sc.h)} onCommit={(v) => +v > 0 && act.setCanvas(sc.w, +v)} />
        </div>
        <p className="hint">Select something to change it. Double-click to edit its text.</p>
      </div>
    );
  }
  const first = els[0]!;
  const kind = first.kind;
  const same = els.every((e) => e!.kind === kind);
  const p = first.el.p;
  const names = [...sc.look.colors.keys()].filter((n) => n !== 'paper');
  const fills = ['none', '#ffffff', ...names.map((n) => `${n}/0.08`), ...names.filter((n) => n !== 'ink')];
  const strokes = [...names, ...names.slice(0, 1).map((n) => `${n}/0.3`), 'none'];
  const styles = [...sc.look.styles.values()].filter((s) => s.kind === (kind === 'conn' ? 'line' : kind));
  const dashOf = (v: string | undefined) => (!v || v === 'none' ? 'solid' : v.startsWith('1') || v.startsWith('2') ? 'dotted' : 'dashed');
  const sizeKey = kind === 'shape' ? 'title.size' : kind === 'text' ? 'size' : 'label.size';
  const sizes = kind === 'conn' ? [['S', '8'], ['M', '10'], ['L', '12']] : kind === 'text' ? [['S', '9'], ['M', '12'], ['L', '16'], ['XL', '28']] : [['S', '10'], ['M', '12'], ['L', '15'], ['XL', '18']];
  const op = kind === 'conn' ? stmtToks(src, first.el.line)?.find((t) => t.t === 'word' && ['->', '--', '<->'].includes(t.v))?.v : undefined;
  const multiBoxes = els.filter((e) => e!.kind !== 'conn').length;

  return (
    <div className="panel">
      {same && (
        <>
          <h4>Style</h4>
          <select value={first.el.style} onChange={(e) => act.setStyle(e.target.value)}>
            {styles.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
        </>
      )}
      {same && kind === 'shape' && (
        <>
          <h4>Fill</h4>
          <Swatches sc={sc} values={fills} current={p.fill} onPick={(v) => act.setProp('fill', v)} />
        </>
      )}
      {same && kind !== 'text' && (
        <>
          <h4>Stroke</h4>
          <Swatches sc={sc} values={strokes} current={p.stroke} onPick={(v) => act.setProp('stroke', v)} />
          <h4>Line</h4>
          <div className="seg">
            {(['solid', 'dashed', 'dotted'] as const).map((d) => (
              <button key={d} className={dashOf(p.dash) === d ? 'on' : ''}
                onClick={() => act.setProp('dash', d === 'solid' ? 'none' : d === 'dashed' ? '5,4' : '1,4')}>{d}</button>
            ))}
          </div>
          <div className="seg">
            {[['thin', '1'], ['medium', '1.6'], ['bold', '2.4']].map(([l, v]) => (
              <button key={l} className={(p.sw ?? '1') === v ? 'on' : ''} onClick={() => act.setProp('sw', v)}>{l}</button>
            ))}
          </div>
        </>
      )}
      {same && kind === 'text' && (
        <>
          <h4>Colour</h4>
          <Swatches sc={sc} values={names} current={p.color} onPick={(v) => act.setProp('color', v)} />
        </>
      )}
      {same && kind === 'conn' && (
        <>
          <h4>Ends</h4>
          <div className="seg">
            {[['->', 'arrow'], ['<->', 'both'], ['--', 'none']].map(([o, l]) => (
              <button key={o} className={op === o ? 'on' : ''} onClick={() => act.setOp(o)}>{l}</button>
            ))}
          </div>
          <h4>Label side</h4>
          <div className="seg">
            {[['', 'above / right'], ['below', 'below'], ['left', 'left']].map(([v, l]) => (
              <button key={l} className={(p.lside ?? '') === v ? 'on' : ''} onClick={() => act.setProp('lside', v || null)}>{l}</button>
            ))}
          </div>
        </>
      )}
      {same && (
        <>
          <h4>Text size</h4>
          <div className="seg">
            {sizes.map(([l, v]) => <button key={l} className={p[sizeKey] === v ? 'on' : ''} onClick={() => act.setProp(sizeKey, v)}>{l}</button>)}
          </div>
        </>
      )}
      {els.length === 1 && kind === 'shape' && (
        <>
          <h4>Details</h4>
          <TextField label="Second line" value={p.sub ?? ''} onCommit={(v) => act.setProp('sub', v || null)} />
          <TextField label="Corner tag" value={p.tag ?? ''} onCommit={(v) => act.setProp('tag', v || null)} />
        </>
      )}
      {multiBoxes >= 2 && (
        <>
          <h4>Align</h4>
          <div className="seg">
            {([['left', '⇤'], ['hcenter', '↔'], ['right', '⇥'], ['top', '⤒'], ['vcenter', '↕'], ['bottom', '⤓']] as [AlignMode, string][]).map(([m, l]) => (
              <button key={m} title={m} onClick={() => act.align(m)}>{l}</button>
            ))}
          </div>
        </>
      )}
      <h4>Arrange</h4>
      <div className="seg">
        <button onClick={() => act.reorder('front')}>to front</button>
        <button onClick={() => act.reorder('back')}>to back</button>
      </div>
      <div className="seg">
        <button onClick={act.duplicate}>duplicate</button>
        <button className="danger" onClick={act.remove}>delete</button>
      </div>
    </div>
  );
}
