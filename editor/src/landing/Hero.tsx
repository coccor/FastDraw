// The opening demonstration: a person asks their agent for a diagram, the agent writes the .fdraw
// text line by line (drawn live by the real renderer as it goes), checks it, and then the person
// drags one box, which changes one line of the text.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { buildScene } from '../../../src/scene.ts';
import { renderBody } from '../../../src/render.ts';

const PROMPT = 'Draw our checkout flow as docs/checkout.fdraw';
const LINES = [
  'text "Checkout" at 40,56 style=h1',
  '',
  'shop: external "Web shop" sub="browser" icon=desktop at 40,104 152x64',
  'api:  focal "Checkout API" sub="prices, validates" at 304,104 168x64',
  'pay:  cloud "Payments" sub="card provider" at 560,104 152x64',
  'db:   store "Orders DB" sub="Postgres" at 304,232 168x64',
  '',
  'shop -> api "places order" style=primary',
  'api -> pay "charges"',
  'api -> db "writes"',
];
const PAY = 4, FROM = 104, TO = 232;
const CONSOLE = [
  ['fastdraw check docs/checkout.fdraw', 'ok: no problems found'],
  ['fastdraw render docs/checkout.fdraw', 'wrote docs/checkout.png'],
];

type State = { step: 0 | 1 | 2; typed: number; lines: number; console: number; payY: number; cursor: boolean; done: boolean };
const START: State = { step: 0, typed: 0, lines: 0, console: 0, payY: FROM, cursor: false, done: false };
const END: State = { step: 2, typed: PROMPT.length, lines: LINES.length, console: CONSOLE.length, payY: TO, cursor: false, done: true };

const textOf = (s: State) => LINES.slice(0, s.lines).map((l, i) => (i === PAY ? l.replace(`,${FROM} `, `,${s.payY} `) : l));

// The whole sequence as a list of [delay, change] steps.
function script(): [number, (s: State) => State][] {
  const out: [number, (s: State) => State][] = [[500, (s) => s]];
  for (let i = 1; i <= PROMPT.length; i++) out.push([28, (s) => ({ ...s, typed: i })]);
  out.push([450, (s) => ({ ...s, step: 1 })]);
  for (let i = 1; i <= LINES.length; i++) out.push([LINES[i - 1] ? 260 : 80, (s) => ({ ...s, lines: i })]);
  for (let i = 1; i <= CONSOLE.length; i++) out.push([500, (s) => ({ ...s, console: i })]);
  out.push([900, (s) => ({ ...s, step: 2, cursor: true })]);
  out.push([500, (s) => s]);
  for (let y = FROM + 4; y <= TO; y += 4) out.push([22, (s) => ({ ...s, payY: y })]);
  out.push([700, (s) => ({ ...s, cursor: false, done: true })]);
  return out;
}

// Colours the parts of a line the way a reader picks them out: ids, quoted text, arrows, keys.
function Line({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  const re = /^(\w+:)|("[^"]*")|(->)|(\b[\w.]+=)|(\bat\b)/g;
  let last = 0, m: RegExpExecArray | null, k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const cls = m[1] ? 'tk-id' : m[2] ? 'tk-str' : m[3] ? 'tk-arrow' : 'tk-key';
    parts.push(<span key={k++} className={cls}>{m[0]}</span>);
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}

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

  const lines = textOf(s);
  const final = useMemo(() => buildScene(LINES.join('\n'), null), []);
  const body = useMemo(() => renderBody(buildScene(lines.join('\n'), null), false), [lines.join('\n')]);
  const moved = s.payY !== FROM;
  const step = (n: number, label: string) => <li className={s.step === n ? 'on' : s.step > n ? 'past' : ''}>{label}</li>;

  return (
    <div className="demo" aria-label="Example: an agent writes a diagram, then a person moves one box">
      <ol className="steps">
        {step(0, 'You ask your agent')}
        {step(1, 'It writes the file and checks it')}
        {step(2, 'You move things by hand')}
      </ol>
      <div className="window">
        <div className="prompt">
          <span className="who">You</span>
          <span className="said">{PROMPT.slice(0, s.typed)}{s.step === 0 && <span className="caret" />}</span>
        </div>
        <div className="panes">
          <div className="code">
            <div className="filename">docs/checkout.fdraw{moved && <span className="edited">edited in the editor</span>}</div>
            <pre>
              {lines.map((l, i) => (
                <div key={i} className={'ln' + (i === PAY && moved ? ' changed' : '')}>
                  <span className="no">{i + 1}</span><span className="tx"><Line text={l} /></span>
                </div>
              ))}
              {s.step === 1 && s.lines < LINES.length && <div className="ln"><span className="no">{s.lines + 1}</span><span className="caret" /></div>}
            </pre>
            <div className="console">
              {CONSOLE.slice(0, s.console).map(([cmd, out]) => (
                <div key={cmd}><span className="cmd">$ {cmd}</span><span className="out">{out}</span></div>
              ))}
            </div>
          </div>
          <div className="canvas">
            <svg viewBox={`${final.x} ${final.y} ${final.w} ${final.h}`} role="img" aria-label="The checkout diagram the text describes">
              <g dangerouslySetInnerHTML={{ __html: body }} />
              {s.cursor && (
                <path transform={`translate(${650},${s.payY + 40})`} d="M0 0 L0 17 L4.5 13 L7.5 20 L10.5 18.8 L7.6 12 L13 12 Z" fill="#fff" stroke="#1f2328" strokeWidth="1.3" strokeLinejoin="round" />
              )}
            </svg>
          </div>
        </div>
      </div>
      {s.done && !reduced && <button className="replay" onClick={() => setRun((r) => r + 1)}>Play it again</button>}
      {reduced && <button className="replay" onClick={() => setRun((r) => r + 1)}>Play the example</button>}
    </div>
  );
}
