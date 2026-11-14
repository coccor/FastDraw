// One rich diagram, large, redrawn live in each look that ships with FastDraw: the same text, five
// different pictures.
import React, { useMemo, useState } from 'react';
import { buildScene } from '../../../src/scene.ts';
import { renderBody } from '../../../src/render.ts';
import source from './showcase.fdraw?raw';
import { currentTheme } from '../theme.ts';

const LOOKS: { id: string; name: string; about: string }[] = [
  { id: '', name: 'Built-in', about: 'One blue pen and a yellow highlighter. The default.' },
  { id: 'night', name: 'Night', about: 'The built-in look as a blueprint, for dark pages.' },
  { id: 'whiteboard', name: 'Whiteboard', about: 'Sticky-note colours, rounded boxes, curved lines.' },
  { id: 'sketch', name: 'Sketch', about: 'Drawn by hand, for early ideas.' },
  { id: 'headline', name: 'Headline', about: 'Flat blocks and one strong colour, for print.' },
];

const withLook = (look: string) => source.replace(/^look .*\n/, look ? `look ${look}\n` : '');

export function Showcase() {
  const [i, setI] = useState(() => (currentTheme() === 'dark' ? LOOKS.findIndex((l) => l.id === 'night') : 0));
  const [showText, setShowText] = useState(false);

  const text = withLook(LOOKS[i].id);
  const view = useMemo(() => {
    const sc = buildScene(text, null);
    return { body: renderBody(sc), box: `${sc.x} ${sc.y} ${sc.w} ${sc.h}` };
  }, [text]);

  return (
    <section className="showcase" aria-labelledby="showcase-title">
      <div className="showhead">
        <h2 id="showcase-title">One file. Any look your team wants.</h2>
        <p className="lede">
          An agent wrote this diagram from the guide. Pick a look and the same file is drawn again. A team keeps its
          look in one <code>.look</code> file, and every diagram follows it.
        </p>
      </div>
      <div className="looks" role="radiogroup" aria-label="Look">
        {LOOKS.map((l, n) => (
          <button key={l.name} role="radio" aria-checked={n === i} className={n === i ? 'on' : ''}
            onClick={() => setI(n)}>
            {l.name}
          </button>
        ))}
      </div>
      <figure className="showframe">
        <svg key={i} viewBox={view.box} role="img" aria-label={`The shop platform architecture, drawn in the ${LOOKS[i].name} look`}
          dangerouslySetInnerHTML={{ __html: view.body }} />
      </figure>
      <div className="showfoot">
        <span className="lookabout">{LOOKS[i].about}</span>
        <button className="linkish" aria-expanded={showText} onClick={() => setShowText((v) => !v)}>
          {showText ? 'Hide the file' : `Show the file (${text.trim().split('\n').length} lines)`}
        </button>
      </div>
      {showText && <pre className="showsrc">{text}</pre>}
    </section>
  );
}
