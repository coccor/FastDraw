// One rich diagram, large, redrawn live in each look that ships with FastDraw: the same text, four
// different pictures. Looks step on their own while the section is in view, until a person picks one.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { buildScene } from '../../../src/scene.ts';
import { renderBody } from '../../../src/render.ts';
import source from './showcase.fdraw?raw';

const LOOKS: { id: string; name: string; about: string }[] = [
  { id: 'whiteboard', name: 'Whiteboard', about: 'Sticky-note colours, rounded boxes, curved lines' },
  { id: 'sketch', name: 'Sketch', about: 'Drawn by hand, for early ideas' },
  { id: 'headline', name: 'Headline', about: 'Flat blocks and one strong colour, for print' },
  { id: '', name: 'Built-in', about: 'Quiet outlines and one green, the default' },
];

const withLook = (look: string) => source.replace(/^look .*\n/, look ? `look ${look}\n` : '');

export function Showcase() {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState(false);
  const [showText, setShowText] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const reduced = useMemo(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches, []);

  // step through the looks while the section is on screen
  useEffect(() => {
    if (picked || reduced || typeof IntersectionObserver !== 'function' || !ref.current) return;
    let timer = 0;
    const io = new IntersectionObserver(([e]) => {
      window.clearInterval(timer);
      if (e.isIntersecting) timer = window.setInterval(() => setI((n) => (n + 1) % LOOKS.length), 5000);
    }, { threshold: 0.45 });
    io.observe(ref.current);
    return () => { io.disconnect(); window.clearInterval(timer); };
  }, [picked, reduced]);

  const text = withLook(LOOKS[i].id);
  const view = useMemo(() => {
    const sc = buildScene(text, null);
    return { body: renderBody(sc), box: `${sc.x} ${sc.y} ${sc.w} ${sc.h}` };
  }, [text]);

  return (
    <section className="showcase" ref={ref} aria-labelledby="showcase-title">
      <div className="showhead">
        <h2 id="showcase-title">One text file. Any look your team wants.</h2>
        <p className="lede">
          An agent wrote this diagram from the guide. Pick a look and the same file is drawn again: a team keeps its
          look in one <code>.look</code> file, and every diagram follows it.
        </p>
      </div>
      <div className="looks" role="radiogroup" aria-label="Look">
        {LOOKS.map((l, n) => (
          <button key={l.name} role="radio" aria-checked={n === i} className={n === i ? 'on' : ''}
            onClick={() => { setI(n); setPicked(true); }} title={l.about}>
            {l.name}
          </button>
        ))}
        <span className="lookabout">{LOOKS[i].about}</span>
      </div>
      <figure className="showframe">
        <svg key={i} viewBox={view.box} role="img" aria-label={`The shop platform architecture, drawn in the ${LOOKS[i].name} look`}
          dangerouslySetInnerHTML={{ __html: view.body }} />
      </figure>
      <div className="showfoot">
        <button className="linkish" aria-expanded={showText} onClick={() => setShowText((v) => !v)}>
          {showText ? 'Hide the file' : `Show the file (${text.trim().split('\n').length} lines)`}
        </button>
        <span className="muted">Every box, line and label above comes from this text.</span>
      </div>
      {showText && <pre className="showsrc">{text}</pre>}
    </section>
  );
}
