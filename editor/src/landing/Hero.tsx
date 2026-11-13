// The opening scene: an agent's terminal and the FastDraw editor side by side. The agent writes
// docs/checkout.fdraw and checks it while the editor draws it (with the real renderer); then a
// person selects one box and drags it, and the one line that changed is shown as a diff.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Circle, Diamond, Hand, MousePointer2, Square, Type } from 'lucide-react';
import { buildScene } from '../../../src/scene.ts';
import { bundledLook } from '../../../src/look.ts';
import { withIconImages } from '../../../src/iconfiles.ts';
import { renderBody } from '../../../src/render.ts';

// drawn in the Whiteboard look: sticky-note colours, so the first picture on the page is a lively one
// with the colour pictures from the illustration's look folder, so its boxes carry colour icons
const PICTURES = import.meta.glob('../../../examples/showcase/icons/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const LOOK = withIconImages(bundledLook('whiteboard')!, Object.entries(PICTURES).map(([path, svg]) => ({ name: path.replace(/^.*\//, ''), bytes: new TextEncoder().encode(svg) })));

const PROMPT = 'Draw our checkout flow as docs/checkout.fdraw';
const LINES = [
  'text "Checkout" at 40,56 style=h1',
  'shop: external "Web shop" sub="browser" icon=shopper icon.size=30 at 40,104 152x64',
  'api:  focal "Checkout API" sub="prices, validates" icon=basket icon.size=30 at 304,104 168x64',
  'pay:  cloud "Payments" sub="card provider" icon=card icon.size=30 at 560,104 152x64',
  'db:   store "Orders DB" sub="Postgres" icon=vault icon.size=30 at 304,232 168x64',
  'shop -> api "places order" style=primary',
  'api -> pay "charges"',
  'api -> db "writes"',
];
const PAY = 3, FROM = 104, TO = 232, BOX = { x: 560, w: 152, h: 64 };

// What the agent says, in order; `draw` marks the step during which the file is written.
const SAID: { text: string; kind: 'step' | 'out' | 'done'; draw?: boolean }[] = [
  { text: 'Reading the guide for architecture diagrams', kind: 'step' },
  { text: 'Writing docs/checkout.fdraw', kind: 'step', draw: true },
  { text: 'fastdraw check docs/checkout.fdraw', kind: 'step' },
  { text: 'ok: no problems found', kind: 'out' },
  { text: 'Done. Adjust it: fastdraw open docs/checkout.fdraw', kind: 'done' },
];

type State = { typed: number; said: number; lines: number; selected: boolean; cursor: boolean; payY: number; diff: boolean };
const START: State = { typed: 0, said: 0, lines: 0, selected: false, cursor: false, payY: FROM, diff: false };
const END: State = { typed: PROMPT.length, said: SAID.length, lines: LINES.length, selected: true, cursor: false, payY: TO, diff: true };

function script(): [number, (s: State) => State][] {
  const out: [number, (s: State) => State][] = [[600, (s) => s]];
  for (let i = 1; i <= PROMPT.length; i++) out.push([26, (s) => ({ ...s, typed: i })]);
  SAID.forEach((step, n) => {
    out.push([n === 0 ? 500 : 650, (s) => ({ ...s, said: n + 1 })]);
    if (step.draw) for (let i = 1; i <= LINES.length; i++) out.push([170, (s) => ({ ...s, lines: i })]);
  });
  out.push([1000, (s) => ({ ...s, cursor: true })]);
  out.push([450, (s) => ({ ...s, selected: true })]);
  out.push([350, (s) => s]);
  for (let y = FROM + 4; y <= TO; y += 4) out.push([20, (s) => ({ ...s, payY: y })]);
  out.push([450, (s) => ({ ...s, cursor: false, diff: true })]);
  return out;
}

const payLine = (y: number) => LINES[PAY].replace(`,${FROM} `, `,${y} `);
// the changed line with its middle left out, so the part that changed stays in view
const short = (l: string) => l.replace(/^(\w+):.*?( at .*)$/, "$1: …$2");

export function Hero() {
  const reduced = useMemo(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const [s, setS] = useState<State>(reduced ? END : START);
  const [run, setRun] = useState(0);
  const timer = useRef<number>();

  useEffect(() => {
    if (reduced && run === 0) return;
    const steps = script();
    let i = 0, cur = START;
    setS(START);
    const next = () => {
      if (i >= steps.length) return;
      const [delay, change] = steps[i++];
      timer.current = window.setTimeout(() => { cur = change(cur); setS(cur); next(); }, delay);
    };
    next();
    return () => window.clearTimeout(timer.current);
  }, [run, reduced]);

  const text = LINES.slice(0, s.lines).map((l, i) => (i === PAY ? payLine(s.payY) : l)).join('\n');
  const final = useMemo(() => buildScene(LINES.join('\n'), LOOK), []);
  const body = useMemo(() => renderBody(buildScene(text, LOOK), false), [text]);
  const hs = 7; // handle size, in diagram units
  const corners = [[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5]];

  return (
    <div className="stage" aria-label="Example: an agent writes a diagram file, then a person drags one box in the editor">
      <div className="win editor-win">
        <div className="bar">
          <span className="dots" aria-hidden="true"><i /><i /><i /></span>
          <span className="url">fastdraw.dev/edit</span>
          <span className="tab">checkout.fdraw</span>
        </div>
        <div className="board">
          <div className="tools" aria-hidden="true">
            <MousePointer2 size={15} className="on" /><Hand size={15} /><Square size={15} /><Circle size={15} /><Diamond size={15} /><ArrowRight size={15} /><Type size={15} />
          </div>
          <svg viewBox={`${final.x} ${final.y} ${final.w} ${final.h}`} preserveAspectRatio="xMidYMin meet" role="img" aria-label="The checkout diagram, drawn from the file">
            <g dangerouslySetInnerHTML={{ __html: body }} />
            {s.selected && s.lines === LINES.length && (
              <g>
                <rect x={BOX.x - 4} y={s.payY - 4} width={BOX.w + 8} height={BOX.h + 8} fill="none" stroke="#5448d6" strokeWidth="1.5" />
                {corners.map(([fx, fy]) => (
                  <rect key={`${fx}${fy}`} x={BOX.x - 4 + fx * (BOX.w + 8) - hs / 2} y={s.payY - 4 + fy * (BOX.h + 8) - hs / 2} width={hs} height={hs} fill="#fff" stroke="#5448d6" strokeWidth="1.5" />
                ))}
              </g>
            )}
            {s.cursor && (
              <path transform={`translate(${BOX.x + 96},${s.payY + 38})`} d="M0 0 L0 19 L5 14.5 L8.4 22.3 L11.7 20.9 L8.5 13.3 L14.6 13.3 Z" fill="#fff" stroke="#1f2328" strokeWidth="1.4" strokeLinejoin="round" />
            )}
          </svg>
        </div>
      </div>

      <div className="win term-win">
        <div className="bar"><span className="dots" aria-hidden="true"><i /><i /><i /></span><span className="title">Your coding agent</span></div>
        <div className="term">
          <div className="you"><span className="sign">&gt;</span>{PROMPT.slice(0, s.typed)}{s.said === 0 && <span className="caret" />}</div>
          {SAID.slice(0, s.said).map((l) => (
            <div key={l.text} className={'said ' + l.kind}>
              {l.kind === 'step' && <span className="bullet">●</span>}
              {l.text}
              {l.draw && s.lines < LINES.length && s.lines > 0 && <span className="count"> {s.lines} of {LINES.length} lines</span>}
            </div>
          ))}
        </div>
      </div>

      <div className={'diff' + (s.diff ? ' shown' : '')} aria-hidden={!s.diff}>
        <div className="diffhead">docs/checkout.fdraw, after your drag</div>
        <div className="minus"><span>−</span>{short(LINES[PAY])}</div>
        <div className="plus"><span>+</span>{short(payLine(TO))}</div>
      </div>

      {(s.diff || reduced) && <button className="replay" onClick={() => setRun((r) => r + 1)}>{reduced && run === 0 ? 'Play the example' : 'Play it again'}</button>}
    </div>
  );
}
