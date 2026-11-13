// The eye-catcher after the hero: an illustrated FastDraw diagram in its own look (Atlas), with
// colour pictures from the look's icon folder, drawn straight onto a band that is the look's page.
// The first time it comes into view it builds up statement by statement, the way an agent writes
// it, and then an order (a glowing dot) travels its main path and out along the bus.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { buildScene } from '../../../src/scene.ts';
import { renderBody } from '../../../src/render.ts';
import { parseLook } from '../../../src/look.ts';
import { withIconImages } from '../../../src/iconfiles.ts';
import source from '../../../examples/showcase/journey.fdraw?raw';
import lookSource from '../../../examples/showcase/atlas.look?raw';

const icons = import.meta.glob('../../../examples/showcase/icons/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const LOOK = withIconImages(parseLook(lookSource, 'atlas.look'), Object.entries(icons).map(([path, svg]) => ({ name: path.replace(/^.*\//, ''), bytes: new TextEncoder().encode(svg) })));

const LINES = source.split('\n');
const ALL = LINES.length;
// the lines that draw something, in order: each one is a step of the build
const STEPS = LINES.map((l, i) => i).filter((i) => LINES[i].trim() && !LINES[i].trim().startsWith('//') && !LINES[i].startsWith('look '));

// the order's route, in the diagram's own coordinates: along the main path, down the bus, and left
const ROUTE = 'M 152,348 L 368,352 L 676,348 L 1012,348 L 1244,348 L 1244,532 L 188,532';

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function Illustration() {
  const [showText, setShowText] = useState(false);
  const [shown, setShown] = useState(() => (reducedMotion() || typeof IntersectionObserver !== 'function' ? ALL : 1));
  const frame = useRef<HTMLDivElement>(null);
  const final = useMemo(() => buildScene(source, LOOK), []);

  // build it up once, when it first comes into view
  useEffect(() => {
    if (shown === ALL || !frame.current) return;
    let timer = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      let k = 0;
      const next = () => {
        if (k >= STEPS.length) { setShown(ALL); return; }
        setShown(STEPS[k++] + 1);
        timer = window.setTimeout(next, 70);
      };
      next();
    }, { threshold: 0.3 });
    io.observe(frame.current);
    return () => { io.disconnect(); window.clearTimeout(timer); };
  }, []);

  // two layers, so the order can travel between them: the soft blobs below, everything else above
  const layers = useMemo(() => {
    const upTo = LINES.slice(0, shown);
    const isBlob = (l: string) => /^\s*[\w-]+:\s*blob\b/.test(l);
    return {
      back: renderBody(buildScene(upTo.map((l) => (isBlob(l) || l.startsWith('look ') ? l : '')).join('\n'), LOOK), false),
      front: renderBody(buildScene(upTo.map((l) => (isBlob(l) ? '' : l)).join('\n'), LOOK), false),
    };
  }, [shown]);
  const done = shown === ALL;

  return (
    <section className="art" aria-labelledby="art-title">
      <div className="arthead" data-reveal="">
        <h2 id="art-title">Diagrams people stop to look at</h2>
        <p className="lede">
          This picture is a FastDraw file too. Its look brings the colours, the rounded cards and the soft shapes, and
          the pictures are SVG files kept next to it. The agent wrote the text; the look did the rest.
        </p>
      </div>
      <div className="artframe" ref={frame}>
        <svg viewBox={`${final.x} ${final.y} ${final.w} ${final.h}`} role="img" aria-label="The life of an order: you tap Buy, the API gateway checks who you are, Checkout prices the order, charges the card with the payment provider and saves it; an order.placed event then reaches shipping, the warehouse, the receipt email and loyalty points, and the parcel is delivered to you.">
          <g dangerouslySetInnerHTML={{ __html: layers.back }} />
          {done && !reducedMotion() && (
            <g className="token" aria-hidden="true">
              <circle r="16" fill="#6d4aff" opacity=".18">
                <animateMotion dur="8s" repeatCount="indefinite" path={ROUTE} />
              </circle>
              <circle r="7" fill="#6d4aff" stroke="#fff" strokeWidth="2.5">
                <animateMotion dur="8s" repeatCount="indefinite" path={ROUTE} />
              </circle>
            </g>
          )}
          <g dangerouslySetInnerHTML={{ __html: layers.front }} />
        </svg>
      </div>
      <div className="showfoot">
        <button className="linkish" aria-expanded={showText} onClick={() => setShowText((v) => !v)}>
          {showText ? 'Hide the file' : `Show the file (${source.trim().split('\n').length} lines)`}
        </button>
        <span className="muted">Plus <code>atlas.look</code> and ten SVG pictures in its folder.</span>
      </div>
      {showText && <pre className="showsrc">{source}</pre>}
    </section>
  );
}
