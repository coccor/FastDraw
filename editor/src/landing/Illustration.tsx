// The eye-catcher after the hero: an illustrated FastDraw diagram in its own look (Atlas), with
// colour pictures from the look's icon folder, drawn straight onto a band that is the look's page.
import React, { useMemo, useState } from 'react';
import { buildScene } from '../../../src/scene.ts';
import { renderBody } from '../../../src/render.ts';
import { parseLook } from '../../../src/look.ts';
import { withIconImages } from '../../../src/iconfiles.ts';
import source from '../../../examples/showcase/journey.fdraw?raw';
import lookSource from '../../../examples/showcase/atlas.look?raw';

const icons = import.meta.glob('../../../examples/showcase/icons/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export function Illustration() {
  const [showText, setShowText] = useState(false);
  const view = useMemo(() => {
    const files = Object.entries(icons).map(([path, svg]) => ({ name: path.replace(/^.*\//, ''), bytes: new TextEncoder().encode(svg) }));
    const look = withIconImages(parseLook(lookSource, 'atlas.look'), files);
    const sc = buildScene(source, look);
    return { body: renderBody(sc, false), box: `${sc.x} ${sc.y} ${sc.w} ${sc.h}` };
  }, []);

  return (
    <section className="art" aria-labelledby="art-title">
      <div className="arthead">
        <h2 id="art-title">Diagrams people stop to look at</h2>
        <p className="lede">
          This picture is a FastDraw file too. Its look brings the colours, the rounded cards and the soft shapes, and
          the pictures are SVG files kept next to it. The agent wrote the text; the look did the rest.
        </p>
      </div>
      <div className="artframe">
        <svg viewBox={view.box} role="img" aria-label="The life of an order: you tap Buy, the API gateway checks who you are, Checkout prices the order, charges the card with the payment provider and saves it; an order.placed event then reaches shipping, the warehouse, the receipt email and loyalty points, and the parcel is delivered to you."
          dangerouslySetInnerHTML={{ __html: view.body }} />
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
