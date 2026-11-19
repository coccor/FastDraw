// The look's styles, each shown the way it is actually drawn. Picking one arms the tool that
// places it on the canvas.
import React, { useMemo } from 'react';
import type { Look, Style } from '../../src/look.ts';
import { buildScene } from '../../src/scene.ts';
import { renderBody } from '../../src/render.ts';

// styles that have a tool in the top bar (the icon among them), so the sidebar does not list them
export const BUILTIN = new Set(['rect', 'ellipse', 'diamond', 'polygon', 'freehand', 'arc', 'text', 'arrow', 'line', 'legend', 'icon']);

export function Thumb({ look, style }: { look: Look; style: Style }) {
  const view = useMemo(() => {
    const p = style.props;
    let src: string, w = 176, h = 84;
    if (style.kind === 'shape') {
      const m = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/.exec(p.size ?? '');
      let sw = m ? +m[1] : 132, sh = m ? +m[2] : 56;
      if (sw < 40) { sw = Math.max(sw, 8); sh = Math.min(sh, 64); } // narrow things (bars) keep their shape
      w = Math.max(176, sw + 24); h = sh + 24;
      const label = sw < 40 ? '' : p['title.pos'] === 'top' ? '"Group"' : '"Name"';
      src = `s: ${style.name} ${label} at ${(w - sw) / 2},${(h - sh) / 2} ${sw}x${sh}`;
      if (p.shape === 'chart') { h = 104; src = `s: ${style.name} at 36,12 120x68 x="A,B,C,D" yaxis=0\n  | bars "" 30 50 40 70`; }
      if (p.shape === 'table') { h = 104; src = `s: ${style.name} "Name" at 24,12 128x0\n  | "first" "value"\n  | "second" "value"`; }
    } else if (style.kind === 'line') {
      src = `20,${h / 2 + 6} ${p.head === 'none' || p.route === 'straight' ? '--' : '->'} ${w - 20},${h / 2 + 6} "label" style=${style.name}`;
    } else {
      src = `text "Sample text" at ${w / 2},${h / 2 + 4} style=${style.name} anchor=middle`;
    }
    const sc = buildScene(src, look);
    // drop the paper and dot layers so the thumbnail sits on the card
    const body = renderBody(sc).split('\n').filter((l) => !l.startsWith('<rect class="fd-page"') && !l.startsWith('<defs>')).join('\n');
    return { body, w, h };
  }, [look, style]);
  return <svg viewBox={`0 0 ${view.w} ${view.h}`} className="thumb" dangerouslySetInnerHTML={{ __html: view.body }} />;
}

export function Gallery({ look, current, onPick }: { look: Look; current: string; onPick: (tool: string) => void }) {
  const styles = [...look.styles.values()].filter((s) => !BUILTIN.has(s.name));
  const groups: [string, string, Style[]][] = [
    ['Shapes', 'style:', styles.filter((s) => s.kind === 'shape')],
    ['Lines and arrows', 'conn:', styles.filter((s) => s.kind === 'line')],
    ['Text', 'style:', styles.filter((s) => s.kind === 'text')],
  ];
  if (!styles.length) {
    return <div className="gallery"><p className="muted">This diagram's look defines no styles of its own. Use the plain shapes in the toolbar.</p></div>;
  }
  return (
    <div className="gallery" onPointerDown={(e) => e.stopPropagation()}>
      <p className="muted">These are the styles your look defines. Pick one, then click or drag on the canvas to place it.</p>
      {groups.filter((g) => g[2].length).map(([title, prefix, list]) => (
        <section key={title}>
          <h4>{title}</h4>
          <div className="thumbs">
            {list.map((s) => (
              <button key={s.name} className={'thumbcard' + (current === prefix + s.name ? ' on' : '')} onClick={() => onPick(prefix + s.name)} title={s.props.use ?? s.name}>
                <Thumb look={look} style={s} />
                <span className="tname">{s.name}</span>
                {s.props.use && <span className="tuse">{s.props.use}</span>}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
