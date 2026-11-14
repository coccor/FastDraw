// The opening scene is the product itself: the diagram file on the left, the picture on the right.
// First an agent writes docs/checkout.fdraw line by line while the real renderer draws it, and a
// cursor drags one box. Then it is the visitor's: every box can be dragged (or moved with the arrow
// keys), and the line that changed lights up in the file, as it would in a diff.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { buildScene, type Shape } from '../../../src/scene.ts';
import { bundledLook, defaultLook } from '../../../src/look.ts';
import { renderBody } from '../../../src/render.ts';
import { moveElements } from '../ops.ts';
import { useTheme } from '../theme.ts';

const PROMPT = 'Draw our checkout flow as docs/checkout.fdraw';
const LINES = [
  'text "Checkout" at 40,56 style=h1',
  'shop: external "Web shop" sub="browser" icon=browser at 40,104 152x64',
  'api: focal "Checkout API" sub="prices, validates" icon=cart at 304,104 168x64',
  'pay: cloud "Payments" sub="card provider" icon=payment at 560,104 152x64',
  'db: store "Orders DB" sub="Postgres" icon=database at 304,232 168x64',
  'shop -> api "places order" style=primary',
  'api -> pay "charges"',
  'api -> db "writes"',
];
const FIRST = LINES.join('\n');
const PAY = 3, FROM = 104, TO = 232, BOX = { x: 560, w: 152, h: 64 };
const VIEW = { x: 8, y: 12, w: 744, h: 320 }; // the part of the canvas on show; boxes stay inside it
const GRID = 8;

// What the agent says, in order; `draw` marks the step during which the file is written.
const SAID: { text: string; draw?: boolean }[] = [
  { text: 'Reading the guide for architecture diagrams' },
  { text: 'Writing docs/checkout.fdraw', draw: true },
  { text: 'Running fastdraw check' },
  { text: 'No problems found. Open it and move things around.' },
];

type Intro = { typed: number; said: number; lines: number; cursor: boolean; selected: boolean; payY: number };
const START: Intro = { typed: 0, said: 0, lines: 0, cursor: false, selected: false, payY: FROM };

function script(): [number, (s: Intro) => Intro][] {
  const out: [number, (s: Intro) => Intro][] = [[500, (s) => s]];
  for (let i = 1; i <= PROMPT.length; i++) out.push([22, (s) => ({ ...s, typed: i })]);
  SAID.forEach((step, n) => {
    out.push([n === 0 ? 400 : 520, (s) => ({ ...s, said: n + 1 })]);
    if (step.draw) for (let i = 1; i <= LINES.length; i++) out.push([150, (s) => ({ ...s, lines: i })]);
  });
  out.push([700, (s) => ({ ...s, cursor: true })]);
  out.push([400, (s) => ({ ...s, selected: true })]);
  out.push([300, (s) => s]);
  for (let y = FROM + 4; y <= TO; y += 4) out.push([18, (s) => ({ ...s, payY: y })]);
  out.push([500, (s) => s]);
  return out;
}

const payAt = (y: number) => LINES.map((l, i) => (i === PAY ? l.replace(`,${FROM} `, `,${y} `) : l)).join('\n');

// One line of the file, lightly coloured: the name, the quoted words, the position and the arrow.
function Line({ text }: { text: string }) {
  const parts = text.split(/(^\w+:|"[^"]*"| at \d+,\d+|->)/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) => {
        const cls = /^\w+:$/.test(p) ? 'k' : p[0] === '"' ? 's' : p.startsWith(' at ') ? 'n' : p === '->' ? 'k' : undefined;
        return cls ? <span key={i} className={cls}>{p}</span> : <React.Fragment key={i}>{p}</React.Fragment>;
      })}
    </>
  );
}

export function Hero() {
  const reduced = useMemo(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const [intro, setIntro] = useState<Intro | null>(reduced ? null : START); // null once the visitor has the diagram
  const [src, setSrc] = useState(reduced ? FIRST : payAt(TO));
  const [picked, setPicked] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [run, setRun] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; x: number; y: number; src: string; shape: Shape } | null>(null);

  useEffect(() => {
    if (reduced && run === 0) return;
    const steps = script();
    let i = 0, cur = START, timer = 0;
    setIntro(START); setPicked(null);
    const next = () => {
      if (i >= steps.length) { setSrc(payAt(TO)); setPicked('pay'); setIntro(null); return; }
      const [delay, change] = steps[i++];
      timer = window.setTimeout(() => { cur = change(cur); setIntro(cur); next(); }, delay);
    };
    next();
    return () => window.clearTimeout(timer);
  }, [run, reduced]);

  const look = useTheme() === 'dark' ? bundledLook('night')! : defaultLook();
  const text = intro ? payAt(intro.payY).split('\n').slice(0, intro.lines).join('\n') : src;
  const scene = useMemo(() => buildScene(text, look), [text, look]);
  const body = useMemo(() => renderBody(scene, false), [scene]);
  const lines = text ? text.split('\n') : [];
  const changed = (i: number) => lines[i] !== LINES[i];
  const count = lines.filter((_, i) => changed(i)).length;
  const boxes = intro ? [] : scene.shapes.filter((s) => !s.back);
  const sel = intro ? (intro.selected && intro.lines === LINES.length ? { x: BOX.x, y: intro.payY, w: BOX.w, h: BOX.h } : null) : boxes.find((s) => s.id === picked) ?? null;

  const toCanvas = (e: { clientX: number; clientY: number }) => {
    const m = svgRef.current?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    return { x: (e.clientX - m.e) / m.a, y: (e.clientY - m.f) / m.d };
  };
  const moveBy = (from: string, s: Shape, dx: number, dy: number) => {
    const nx = Math.min(VIEW.x + VIEW.w - s.w - 8, Math.max(VIEW.x + 8, s.x + dx));
    const ny = Math.min(VIEW.y + VIEW.h - s.h - 8, Math.max(VIEW.y + 8, s.y + dy));
    setSrc(moveElements(from, buildScene(from, look), [s.id], nx - s.x, ny - s.y));
    setTouched(true);
  };
  const down = (e: React.PointerEvent, s: Shape) => {
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { id: s.id, ...toCanvas(e), src, shape: s };
    setPicked(s.id);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = toCanvas(e);
    const snap = (v: number) => Math.round(v / GRID) * GRID;
    moveBy(d.src, d.shape, snap(p.x - d.x), snap(p.y - d.y));
  };
  const key = (e: React.KeyboardEvent, s: Shape) => {
    const step: Record<string, [number, number]> = { ArrowLeft: [-GRID, 0], ArrowRight: [GRID, 0], ArrowUp: [0, -GRID], ArrowDown: [0, GRID] };
    const by = step[e.key];
    if (!by) return;
    e.preventDefault();
    setPicked(s.id);
    moveBy(src, s, by[0], by[1]);
  };
  const skip = () => { if (intro) { setSrc(payAt(TO)); setPicked('pay'); setIntro(null); } };
  const hs = 7; // handle size, in diagram units
  const corners = [[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5]];
  const said = intro ? SAID.slice(0, intro.said) : SAID;

  return (
    <div className="bench" onPointerDown={skip}>
      <div className="benchfile">
        <div className="agent">
          <p className="ask"><span aria-hidden="true">&gt;</span>{intro ? PROMPT.slice(0, intro.typed) : PROMPT}{intro && intro.said === 0 && <i className="caret" />}</p>
          <p className="says" aria-live="off">{said.length ? said[said.length - 1].text : ' '}</p>
        </div>
        <div className="filename">docs/checkout.fdraw</div>
        <ol className="code" aria-label="The diagram file">
          {LINES.map((_, i) => (
            <li key={i} className={i < lines.length ? (changed(i) ? 'changed' : '') : 'empty'}>
              {i < lines.length ? <Line text={lines[i]} /> : ' '}
            </li>
          ))}
        </ol>
        <div className="benchfoot">
          {intro
            ? <span>The agent is writing the file</span>
            : <span><b>{count === 0 ? 'No lines' : count === 1 ? '1 line' : `${count} lines`}</b> changed by hand</span>}
          {!intro && <button type="button" onClick={(e) => { e.stopPropagation(); setTouched(false); setRun((r) => r + 1); }}>Play it again</button>}
        </div>
      </div>

      <div className="benchcanvas">
        <svg ref={svgRef} viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} preserveAspectRatio="xMidYMid meet"
          role="group" aria-label="The checkout diagram, drawn from the file. Each box can be moved.">
          <g dangerouslySetInnerHTML={{ __html: body }} />
          {sel && (
            <g className="sel" pointerEvents="none">
              <rect x={sel.x - 4} y={sel.y - 4} width={sel.w + 8} height={sel.h + 8} />
              {corners.map(([fx, fy]) => (
                <rect key={`${fx}${fy}`} className="h" x={sel.x - 4 + fx * (sel.w + 8) - hs / 2} y={sel.y - 4 + fy * (sel.h + 8) - hs / 2} width={hs} height={hs} />
              ))}
            </g>
          )}
          {boxes.map((s) => (
            <rect key={s.id} className="grab" x={s.x} y={s.y} width={s.w} height={s.h} rx="8" tabIndex={0} role="button"
              aria-label={`${s.text ?? s.id}: drag it, or move it with the arrow keys`}
              onPointerDown={(e) => down(e, s)} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
              onKeyDown={(e) => key(e, s)} onFocus={() => setPicked(s.id)} />
          ))}
          {intro?.cursor && (
            <path className="ghost" transform={`translate(${BOX.x + 96},${intro.payY + 38})`} d="M0 0 L0 19 L5 14.5 L8.4 22.3 L11.7 20.9 L8.5 13.3 L14.6 13.3 Z" />
          )}
        </svg>
        <p className={'nudge' + (!intro && !touched ? ' on' : '')} aria-hidden={intro !== null || touched}>Your turn. Drag any box.</p>
      </div>
    </div>
  );
}
