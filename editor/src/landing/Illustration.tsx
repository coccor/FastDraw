// The feature diagram after the hero: a production architecture in the Harbor look, drawn straight
// onto a band that is the look's own page. Nested zones, icons, cylinders, numbered steps, a chart
// and a legend, all from one .fdraw file and one .look file.
import React, { useMemo, useState } from 'react';
import { buildScene } from '../../../src/scene.ts';
import { renderBody } from '../../../src/render.ts';
import { parseLook } from '../../../src/look.ts';
import source from '../../../examples/showcase/options/1-cloud.fdraw?raw';
import lookSource from '../../../examples/showcase/options/harbor.look?raw';
import nightSource from '../../../examples/showcase/options/harbor-night.look?raw';
import { useTheme } from '../theme.ts';

export function Illustration() {
  const [showText, setShowText] = useState(false);
  const theme = useTheme();
  const view = useMemo(() => {
    const sc = buildScene(source, theme === 'dark' ? parseLook(nightSource, 'harbor-night.look') : parseLook(lookSource, 'harbor.look'));
    return { body: renderBody(sc, false), box: `${sc.x} ${sc.y} ${sc.w} ${sc.h}` };
  }, [theme]);

  return (
    <section className="art" aria-labelledby="art-title">
      <div className="arthead" data-reveal="">
        <h2 id="art-title">Real architecture, not boxes and arrows</h2>
        <p className="lede">
          Nested zones, managed services, databases with replicas, numbered steps, a live chart and a legend. This is
          one FastDraw file and one look file; an agent writes the first, your team keeps the second.
        </p>
      </div>
      <div className="artframe">
        <svg viewBox={view.box} role="img" aria-label="How an order is placed: shoppers reach a load balancer and CDN in region eu-west-1; inside a private network the app tier (checkout, catalog, accounts, order worker) talks to the data tier (orders database with a replica and backups, cache, search, order queue); checkout charges an outside payment provider and the worker sends a receipt through an email service, in eight numbered steps, with an observability panel."
          dangerouslySetInnerHTML={{ __html: view.body }} />
      </div>
      <div className="showfoot">
        <button className="linkish" aria-expanded={showText} onClick={() => setShowText((v) => !v)}>
          {showText ? 'Hide the file' : `Show the file (${source.trim().split('\n').length} lines)`}
        </button>
        <span className="muted">Drawn with <code>{theme === 'dark' ? 'harbor-night.look' : 'harbor.look'}</code>, which sets the colours, the zones and the icons.</span>
      </div>
      {showText && <pre className="showsrc">{source}</pre>}
    </section>
  );
}
