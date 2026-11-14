// Home page directions, as static prototypes drawn with the real renderer.
// usage: node docs/design/revamp/home/build.ts   (writes a.html, b.html, c.html next to this file)
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { buildScene } from '../../../../src/scene.ts';
import { renderBody } from '../../../../src/render.ts';

const here = new URL('.', import.meta.url).pathname, root = here + '../../../../';
const svg = (text: string, extra = '', cls = '') => {
  const sc = buildScene(text, null);
  return { html: `<svg class="${cls}" viewBox="${sc.x} ${sc.y} ${sc.w} ${sc.h}" xmlns="http://www.w3.org/2000/svg">${renderBody(sc)}${extra}</svg>`, sc };
};
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

// one small diagram used by every direction
const DEMO = `text "Checkout" at 40,44 style=h1
edge: zone "Edge" at 216,80 192x272
data: zone "Data" at 696,80 192x272
shop: external "Web shop" sub="browser" at 40,112 icon=browser
gw: node "API gateway" sub="auth, rate limits" at 240,112 icon=gateway
co: focal "Checkout" sub="prices, reserves stock" at 472,112 icon=cart
db: store "Orders DB" sub="Postgres" at 720,112 icon=database
cat: node "Catalog" sub="products, stock" at 472,256 icon=list
cache: store "Cache" sub="Redis" at 720,256 icon=cache
pay: external "Payments" sub="card provider" at 936,112 icon=payment
shop -> gw style=link
gw -> co "POST /orders" style=primary lpos=428,134
co -> db "writes" style=primary
gw.bottom -> cat.left "browse" lpos=428,278
cat -> cache "reads"
co.top -> pay.top "charges"
`;
const line = (id: string) => DEMO.split('\n').findIndex((l) => l.startsWith(id + ':'));
const kinds = readdirSync(root + 'examples/kinds').filter((f) => f.endsWith('.fdraw')).map((f) => ({
  name: f.replace('.fdraw', ''), html: svg(readFileSync(root + 'examples/kinds/' + f, 'utf8').replace(/^look .*\n/m, '')).html,
}));

const FONTS = [['Geist', 400, 'Geist-Regular'], ['Geist', 500, 'Geist-Medium'], ['Geist', 600, 'Geist-SemiBold'], ['Geist Mono', 400, 'GeistMono-Regular'], ['Geist Mono', 500, 'GeistMono-Medium'],
  ['Newsreader', 400, 'Newsreader-Regular'], ['Newsreader', 500, 'Newsreader-Medium'], ['Instrument Serif', 400, 'InstrumentSerif-Regular'], ['Libre Franklin', 400, 'LibreFranklin-Regular'], ['Libre Franklin', 700, 'LibreFranklin-Bold']]
  .map(([f, w, file]) => `@font-face{font-family:'${f}';font-weight:${w};src:url('../../../../fonts/${file}.ttf')}`).join('\n');

const CSS = `${FONTS}
:root{--page:#f6f7fb;--ink:#0f172a;--muted:#475569;--soft:#94a3b8;--accent:#4f46e5;--tint:#eef0ff;--hair:rgba(15,23,42,.12);--box:#fff;--mono:'Geist Mono',monospace}
*{box-sizing:border-box}body{margin:0;font:16px/1.55 'Geist',sans-serif;color:var(--ink);background:var(--page);-webkit-font-smoothing:antialiased}
svg{display:block;width:100%;height:auto}
.top{display:flex;align-items:center;justify-content:space-between;padding:18px 40px}.brand{font-weight:600;font-size:17px;display:flex;gap:10px;align-items:center}
.logo{width:26px;height:26px;border-radius:7px;background:var(--accent)}
nav{display:flex;gap:26px;align-items:center;color:var(--muted);font-size:15px}
.btn{display:inline-flex;align-items:center;padding:10px 18px;border-radius:9px;border:1px solid var(--hair);background:#fff;font-weight:500;font-size:15px;color:var(--ink)}
.btn.go{background:var(--accent);border-color:var(--accent);color:#fff}
h1,h2{font-family:'Newsreader',serif;font-weight:400;letter-spacing:-.015em;margin:0;line-height:1.05}
p{margin:0;color:var(--muted)}code,.mono{font-family:var(--mono)}
.cmd{display:flex;align-items:center;justify-content:space-between;gap:16px;background:#14162b;color:#e8e9f7;font:14px var(--mono);padding:13px 16px;border-radius:10px}
.cmd b{color:#8f8af5;font-weight:400}.cmd span.copy{font:12px 'Geist';color:#a9acc9;border:1px solid #3a3d63;border-radius:6px;padding:3px 9px}
.card{background:#fff;border:1px solid var(--hair);border-radius:14px;box-shadow:0 1px 2px rgba(15,23,42,.04),0 12px 32px -18px rgba(15,23,42,.25)}
.note{background:#14162b;color:#cfd2ee;font:13px 'Geist';padding:9px 40px;z-index:9}.note b{color:#fff;font-weight:600}
.map{display:flex;gap:8px;padding:14px 40px 40px;align-items:stretch}.map div{flex:1;border:1px dashed var(--soft);border-radius:10px;padding:12px 14px;font-size:13px;color:var(--muted);background:rgba(255,255,255,.5)}
.map div b{display:block;color:var(--ink);font-weight:600;font-size:14px;margin-bottom:2px}.map i{font-style:normal;color:var(--accent)}
.maph{padding:36px 40px 0;font:600 13px 'Geist';color:var(--soft)}
`;
const page = (title: string, note: string, body: string, css: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${CSS}${css}</style></head><body><div class="note"><b>${title}.</b> ${note}</div>${body}</body></html>`;
const TOP = `<header class="top"><div class="brand"><span class="logo"></span>FastDraw</div><nav><span>Set up</span><span>Kinds</span><span>Looks</span><span>GitHub</span><span class="btn go">Open the editor</span></nav></header>`;
const map = (items: [string, string][]) => `<div class="maph">The rest of the page, top to bottom</div><div class="map">${items.map(([a, b], i) => `<div><b><i>${i + 2}</i> ${a}</b>${b}</div>`).join('')}</div>`;

// ---------- A. Workbench: the hero is the product ----------
{
  const moved = DEMO.replace('pay: external "Payments" sub="card provider" at 936,112', 'pay: external "Payments" sub="card provider" at 936,256');
  const sc0 = buildScene(moved, null), pay = sc0.shapes.find((s) => s.id === 'pay')!;
  const hx = [[pay.x, pay.y], [pay.x + pay.w, pay.y], [pay.x, pay.y + pay.h], [pay.x + pay.w, pay.y + pay.h]];
  const sel = `<rect x="${pay.x - 4}" y="${pay.y - 4}" width="${pay.w + 8}" height="${pay.h + 8}" fill="none" stroke="#4f46e5" stroke-width="1.5"/>` +
    hx.map(([x, y]) => `<rect x="${x - 7}" y="${y - 7}" width="6" height="6" fill="#fff" stroke="#4f46e5" stroke-width="1.5" transform="translate(${x > pay.x ? 8 : 0} ${y > pay.y ? 8 : 0})"/>`).join('') +
    `<rect x="${pay.x}" y="112" width="${pay.w}" height="${pay.h}" rx="10" fill="none" stroke="#4f46e5" stroke-width="1" stroke-dasharray="4 4" opacity=".55"/>` +
    `<path d="M ${pay.x + pay.w / 2},184 V 244" stroke="#4f46e5" stroke-width="1" stroke-dasharray="3 3" opacity=".55"/>` +
    `<path transform="translate(${pay.x + pay.w - 26} ${pay.y + pay.h - 18})" d="M0,0 L0,17 L4.5,13 L8,20 L10.5,19 L7,12 L13,12 Z" fill="#0f172a" stroke="#fff" stroke-width="1.2"/>`;
  const d = svg(moved, sel);
  const n = line('pay');
  const src = moved.split('\n').filter(Boolean).map((l, i) => {
    const hit = i === n;
    const t = esc(l).replace(/^([a-z]+):/, '<i>$1</i>:').replace(/"([^"]*)"/g, '<q>"$1"</q>');
    return `<div class="ln${hit ? ' hit' : ''}"><span>${i + 1}</span>${hit ? t.replace('936,256', '<del>936,112</del><ins>936,256</ins>') : t}</div>`;
  }).join('');
  const body = `${TOP}
<section class="hero">
  <div class="say"><h1>Your agent writes the diagram.<br>You move the boxes.</h1>
  <p>Drag anything on the canvas below. The one line that describes it changes, and nothing else does, so your agent picks up where you left off.</p></div>
  <div class="go"><div class="cmd"><span><b>$</b> npx fastdraw setup claude</span><span class="copy">Copy</span></div><p>One command in your repository. Works with Claude Code, Codex and Copilot.</p></div>
</section>
<section class="bench card">
  <div class="tabs"><span class="on">checkout.fdraw</span><span>Try: add a box</span><span>Try: change the look</span><em>This is the real editor. Nothing is uploaded.</em></div>
  <div class="split"><div class="src">${src}</div><div class="canvas"><div class="tools"><b></b><b></b><b></b><b></b><b></b><b></b></div>${d.html}</div></div>
</section>
${map([['Looks', 'The same file redrawn in eleven looks: a strip of thumbnails, one click each.'], ['Kinds', 'An index of the 44 kinds as a list of names; hovering one draws it in the workbench above.'], ['Why a text file', 'Four short lines, no cards: reviewed like code, edits kept, one look per team, nothing uploaded.'], ['Set up', 'The command again, with the agent tabs and three prompts to try.']])}`;
  const css = `.hero{display:grid;grid-template-columns:1.25fr .9fr;gap:56px;align-items:end;padding:34px 40px 30px}.hero h1{font-size:60px}.hero .say p{font-size:18px;max-width:620px;margin-top:18px}
.hero .go p{font-size:14px;margin-top:10px}.bench{margin:0 40px;overflow:hidden}
.tabs{display:flex;gap:6px;align-items:center;padding:10px 14px;border-bottom:1px solid var(--hair);font-size:14px;color:var(--muted)}.tabs span{padding:6px 12px;border-radius:8px}.tabs .on{background:var(--tint);color:var(--accent);font-weight:500;font-family:var(--mono);font-size:13px}.tabs em{margin-left:auto;font-style:normal;font-size:13px;color:var(--soft)}
.split{display:grid;grid-template-columns:590px 1fr;align-items:stretch}.src{font:12px/1.95 var(--mono);padding:16px 0;border-right:1px solid var(--hair);background:#fbfbfe;color:#334155;white-space:nowrap;overflow:hidden}
.ln{padding:0 16px 0 0}.ln span{display:inline-block;width:38px;text-align:right;margin-right:14px;color:var(--soft)}.ln i{font-style:normal;color:var(--accent)}.ln q{quotes:none;color:#0f766e}
.ln.hit{background:var(--tint);box-shadow:inset 3px 0 0 var(--accent)}del{color:#b4233c;background:#fde8ec;text-decoration:line-through;padding:1px 3px;border-radius:3px;margin-right:4px}ins{color:#166534;background:#dcfce7;text-decoration:none;padding:1px 3px;border-radius:3px}
.canvas{position:relative;padding:44px 18px 18px;background:#f6f7fb;display:flex;align-items:center}.tools{position:absolute;top:14px;left:50%;transform:translateX(-50%);display:flex;gap:6px;padding:6px;border-radius:10px;background:#fff;border:1px solid var(--hair);box-shadow:0 6px 18px -10px rgba(15,23,42,.4)}.tools b{width:26px;height:26px;border-radius:6px;background:#eef0f6}.tools b:nth-child(2){background:var(--tint);outline:1px solid var(--accent)}`;
  writeFileSync(here + 'a.html', page('A. Workbench', 'The top of the page is the editor itself, with a real diagram in it. The pitch is something you do, not something you read.', body, css));
}

// ---------- B. One diagram, told in scroll ----------
{
  const partial = DEMO.split('\n').slice(0, 7).join('\n') + '\n';
  const frames: [string, string, string, string][] = [
    ['You ask', 'Your agent reads the guide for this kind of diagram and starts writing a small text file.', `<div class="term"><b>&gt;</b> Draw our checkout flow as docs/checkout.fdraw<br><span>Reading the guide for architecture diagrams</span><br><span>Writing docs/checkout.fdraw</span></div>`, svg(partial).html],
    ['It checks its own work', 'fastdraw check reports overlaps, text that does not fit and lines through boxes, with line numbers. The agent fixes them before you see anything.', `<div class="term"><b>$</b> fastdraw check docs/checkout.fdraw<br><span>ok: no problems found</span></div>`, svg(DEMO).html],
    ['Your team\'s look', 'One line at the top of the file picks a look. The same diagram, drawn again.', `<div class="term"><ins>+ look engraved</ins></div>`, svg('look engraved\n' + DEMO).html],
  ];
  const body = `${TOP}
<section class="lead"><h1>One diagram, from a sentence<br>to something you can share.</h1><p>Scroll. The diagram on the right stays put and changes as the story does.</p></section>
${frames.map(([h, p, t, d], i) => `<section class="frame"><div class="step"><em>${['First', 'Then', 'Later'][i]}</em><h2>${h}</h2><p>${p}</p>${t}<div class="rail">${[0, 1, 2, 3, 4].map((k) => `<b class="${k === [0, 1, 3][i] ? 'on' : ''}"></b>`).join('')}</div></div><div class="pin card">${d}</div></section>`).join('<div class="gap">scroll</div>')}
${map([['After the story', 'The pinned diagram becomes the live editor: change it yourself.'], ['Set up', 'The command, with agent tabs.'], ['Kinds', 'A compact gallery of the 44 kinds, three rows that scroll sideways.'], ['Footer', 'Open source, llms.txt, credits.']])}`;
  const css = `.lead{padding:44px 40px 26px}.lead h1{font-size:64px}.lead p{font-size:18px;margin-top:16px}
.frame{display:grid;grid-template-columns:380px 1fr;gap:44px;padding:22px 40px;align-items:center}.step em{font-style:normal;font-size:14px;color:var(--accent);font-weight:500}.step h2{font-size:38px;margin:6px 0 12px}.step p{font-size:16px}
.term{margin-top:18px;background:#14162b;color:#e8e9f7;font:12.5px/1.8 var(--mono);padding:14px 16px;border-radius:10px}.term b{color:#8f8af5;font-weight:400}.term span{color:#a9acc9}.term ins{color:#86efac;text-decoration:none}
.pin{padding:20px 26px}.rail{display:flex;gap:6px;margin-top:22px}.rail b{width:34px;height:4px;border-radius:2px;background:var(--hair)}.rail b.on{background:var(--accent)}
.gap{text-align:center;font-size:12px;color:var(--soft);padding:2px 0;border-top:1px dashed var(--hair);margin:10px 40px 0}`;
  writeFileSync(here + 'b.html', page('B. One diagram, told in scroll', 'Three moments of the same scrolling screen are shown stacked. The left column changes; the diagram stays pinned and is redrawn.', body, css));
}

// ---------- C. Specimen wall ----------
{
  const NAMES: Record<string, string> = { 'high-level': 'High-level', 'db-schema': 'Database schema', 'uml-class': 'UML class', 'axonometric-plan': 'Axonometric plan', exploded: 'Exploded view', state: 'State machine', line: 'Line chart', radar: 'Radar chart', loop: 'Loop', wardley: 'Wardley map' };
  const order = ['high-level', 'sankey', 'swimlane', 'exploded', 'db-schema', 'radar', 'deployment', 'axonometric-plan', 'gantt', 'loop', 'heatmap', 'venn', 'state', 'treemap', 'uml-class', 'fishbone', 'wardley', 'line'];
  const pick = order.map((n) => kinds.find((k) => k.name === n)!).filter(Boolean);
  const cell = (k: { name: string; html: string }, cls = '') => `<figure class="${cls}">${k.html}<figcaption>${NAMES[k.name] ?? k.name.replace(/-/g, ' ')}</figcaption></figure>`;
  const body = `${TOP}
<section class="wall">
  ${pick.slice(0, 2).map((k) => cell(k)).join('')}
  <div class="poster"><h1>44 kinds of diagram.<br>Your agent draws them.<br>You finish them by hand.</h1>
    <div class="cmd"><span><b>$</b> npx fastdraw setup claude</span><span class="copy">Copy</span></div>
    <p>Every diagram on this page was written by an agent from the guide. Click one to open it in the editor.</p></div>
  ${pick.slice(2).map((k, i) => cell(k, i === 2 || i === 9 ? 'wide' : '')).join('')}
</section>
${map([['Looks', 'Pick a look and the whole wall is redrawn in it.'], ['How it works', 'Three lines and one small picture: ask, check, drag.'], ['Set up', 'The command with agent tabs.'], ['All 44', 'The wall continues with the rest, filterable by name.']])}`;
  const css = `.wall{display:grid;grid-template-columns:repeat(4,1fr);grid-auto-flow:dense;gap:14px;padding:10px 40px 0}
figure{margin:0;background:#f6f7fb;border:1px solid var(--hair);border-radius:12px;overflow:hidden;position:relative;aspect-ratio:1.42;display:flex;align-items:center}figure.wide{grid-column:span 2;aspect-ratio:2.9}
figure svg{max-height:100%}figcaption{position:absolute;left:10px;bottom:8px;font:500 12px 'Geist';background:rgba(255,255,255,.92);border:1px solid var(--hair);border-radius:6px;padding:2px 8px;}figcaption::first-letter{text-transform:uppercase}
.poster{grid-column:span 2;grid-row:span 2;background:var(--accent);color:#fff;border-radius:12px;padding:38px 40px;display:flex;flex-direction:column;justify-content:space-between}
.poster h1{font-size:54px;color:#fff}.poster p{color:#dcdcff;font-size:15px;max-width:440px}.poster .cmd{background:#fff;color:var(--ink);max-width:440px}.poster .cmd b{color:var(--accent)}.poster .cmd span.copy{color:var(--muted);border-color:var(--hair)}`;
  writeFileSync(here + 'c.html', page('C. Specimen wall', 'The page opens on the diagrams themselves, the way a type foundry shows a specimen. Breadth is the pitch.', body, css));
}
console.log('wrote a.html b.html c.html');
