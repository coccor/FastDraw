// Home page directions taken from yapstudio.app, as static prototypes drawn with the real renderer.
// usage: node docs/design/yap/build.ts   (writes a.html, b.html, c.html next to this file)
import { readFileSync, writeFileSync } from 'node:fs';
import { buildScene } from '../../../src/scene.ts';
import { renderBody } from '../../../src/render.ts';

const here = new URL('.', import.meta.url).pathname, root = here + '../../../';
const DEMO = readFileSync(root + 'editor/src/landing/checkout.fdraw', 'utf8');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const svg = (text: string, cls = '') => {
  const sc = buildScene(text, null);
  return `<svg class="${cls}" viewBox="${sc.x} ${sc.y} ${sc.w} ${sc.h}" xmlns="http://www.w3.org/2000/svg">${renderBody(sc)}</svg>`;
};
const kind = (name: string, look = '') => svg((look ? `look ${look}\n` : '') + readFileSync(root + `examples/kinds/${name}.fdraw`, 'utf8').replace(/^look .*\n/m, ''));
const srcLine = (id: string) => DEMO.split('\n').find((l) => l.startsWith(id + ':'))!;

const FONTS = [['Geist Mono', 400, 'GeistMono-Regular'], ['Geist Mono', 500, 'GeistMono-Medium'], ['Instrument Serif', 400, 'InstrumentSerif-Italic']]
  .map(([f, w, file]) => `@font-face{font-family:'${f}';font-weight:${w};${String(file).includes('Italic') ? 'font-style:italic;' : ''}src:url('../../../fonts/${file}.ttf')}`).join('\n');

// Shared: Yap's type pairing (a heavy, tightly set sans with an italic serif clause), pill buttons,
// alternating full-width bands. FastDraw keeps its indigo; Yap's yellow becomes the annotation colour.
const CSS = `${FONTS}
:root{--grey:#f3f3f5;--white:#fff;--ink:#121318;--muted:#4b4f5c;--soft:#9095a3;--accent:#4f46e5;--accent-ink:#3b33c4;--band:#3d35d9;--yellow:#f6d77a;--tag:#fbe7a6;--tag-ink:#3d2f00;--hair:rgba(18,19,24,.1);--mono:'Geist Mono',monospace;--serif:'Instrument Serif',serif}
*{box-sizing:border-box}body{margin:0;font:16px/1.6 'Geist',sans-serif;color:var(--ink);background:var(--white);-webkit-font-smoothing:antialiased}
svg{display:block;width:100%;height:auto}p{margin:0;color:var(--muted)}code,.mono{font-family:var(--mono);font-size:.92em}
.wrap{max-width:1120px;margin:0 auto;padding:0 24px}
h1,h2,h3{margin:0;font-weight:800;letter-spacing:-.045em;line-height:.98}
h1 em,h2 em{font:italic 400 1.08em/0 var(--serif);letter-spacing:-.01em;color:var(--muted)}
h1{font-size:76px}h2{font-size:54px}h3{font-size:18px;font-weight:600;letter-spacing:-.01em;line-height:1.3}
.lede{font-size:19px;line-height:1.6;margin-top:22px;max-width:590px}
.band{padding:110px 0}.grey{background:var(--grey)}.white{background:var(--white)}
.top{display:flex;align-items:center;justify-content:space-between;padding:20px 40px}.brand{display:flex;gap:10px;align-items:center;font-weight:600;font-size:17px;letter-spacing:-.01em}
.top img{width:28px;height:28px}nav{display:flex;gap:26px;align-items:center;font-size:15px;color:var(--muted)}
.pill{display:inline-flex;align-items:center;gap:8px;padding:12px 22px;border-radius:999px;background:var(--accent);color:#fff;font-weight:600;font-size:16px}.pill.sm{padding:8px 16px;font-size:15px}
.pill.ghost{background:none;color:var(--ink);padding:0;text-decoration:underline;text-underline-offset:4px;font-weight:500}
.meta{font-size:14px;color:var(--soft);margin-top:14px}
.cmd{display:flex;align-items:center;justify-content:space-between;gap:16px;background:#fff;border:1px solid var(--hair);color:var(--ink);font:14.5px var(--mono);padding:8px 8px 8px 18px;border-radius:999px;max-width:440px}
.cmd b{color:var(--soft);font-weight:400}.cmd span.copy{font:500 13px 'Geist';color:#fff;background:var(--ink);border-radius:999px;padding:7px 14px}
.tag{display:inline-block;font:500 12.5px var(--mono);background:var(--tag);color:var(--tag-ink);padding:4px 10px;border-radius:6px;white-space:nowrap;box-shadow:0 1px 0 rgba(61,47,0,.12)}
.card{background:#fff;border:1px solid var(--hair);border-radius:22px;box-shadow:0 30px 60px -40px rgba(18,19,24,.35)}
.note{background:var(--ink);color:#d7d8de;font:13px 'Geist';padding:10px 40px}.note b{color:#fff}
/* numbered setup cards */
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:44px}
.steps>div{background:var(--grey);border:1px solid var(--hair);border-radius:18px;padding:22px 24px 26px}
.steps i{display:block;font:italic 400 56px/1 var(--serif);color:var(--accent);margin-bottom:12px}
.steps p{font-size:15px;margin-top:8px}.steps code{background:#fff;border:1px solid var(--hair);padding:1px 6px;border-radius:5px}
/* the checker on a dark card */
.check{margin-top:44px;background:#16171d;border-radius:22px;padding:36px;display:grid;grid-template-columns:1fr 1.25fr;gap:36px;align-items:center;color:#e7e8ee}
.term{font:13.5px/1.9 var(--mono);color:#c9cbd6}.term b{color:#8f8af5;font-weight:400}.term .bad{color:#fca5a5}.term .ok{color:#86efac}.term .dim{color:#6b6f80}
.check .pane{background:#f6f7fb;border-radius:14px;padding:18px}
/* closing band */
.close{background:var(--yellow);padding:96px 0;text-align:center}.close h2 em{color:#7a5a00}.close p{color:#4a3a00;margin:18px auto 30px;max-width:560px;font-size:18px}
.close .cmd{margin:0 auto;background:#fffaf0;border-color:rgba(61,47,0,.15)}
footer{padding:34px 40px;font-size:14px;color:var(--soft);display:flex;justify-content:space-between}
`;
const head = (title: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&display=swap" rel="stylesheet">`;
const page = (title: string, note: string, body: string, css: string) => `${head(title)}<style>${CSS}${css}</style></head><body><div class="note"><b>${title}.</b> ${note}</div>${body}</body></html>`;
const TOP = (cls = '') => `<header class="top ${cls}"><div class="brand"><img src="../../../editor/public/favicon.svg" alt="">FastDraw</div><nav><span>How it works</span><span>Looks</span><span>Kinds</span><span>GitHub</span><span class="pill sm">Open the editor</span></nav></header>`;

const SETUP = `<div class="steps">
  <div><i>1</i><h3>Run one command in your repository</h3><p><code>npx fastdraw setup claude</code> adds a skill for Claude Code. <code>setup agents</code> and <code>setup copilot</code> do the same for Codex, OpenCode and Copilot. Needs Node 20.</p></div>
  <div><i>2</i><h3>Ask for a diagram</h3><p>“Draw this repo's architecture as docs/architecture.fdraw.” The agent reads the guide for that kind of diagram and writes the file.</p></div>
  <div><i>3</i><h3>Open it and move things</h3><p><code>npx fastdraw open docs/architecture.fdraw</code> opens the editor. What you move is saved into the file, and the agent reads it before its next edit.</p></div>
</div>`;

const broken = DEMO.replace('cache: store "Cache" sub="Redis" at 768,256', 'cache: store "Cache" sub="Redis" at 640,262');
const CHECK = `<div class="check">
  <div class="term"><b>$</b> fastdraw check docs/checkout.fdraw<br><span class="bad">line 9: "Cache" overlaps "Catalog" (line 8)</span><br><span class="bad">line 15: the line "reads" has no room between them</span><br><span class="dim"># the agent moves Cache back into the Data zone</span><br><b>$</b> fastdraw check docs/checkout.fdraw<br><span class="ok">ok: no problems found</span></div>
  <div class="pane">${svg(DEMO)}</div>
</div>`;

const CLOSE = `<section class="close"><div class="wrap"><h2>Set it up <em>in your repository.</em></h2><p>FastDraw is free and open source under the MIT licence. The tool runs through npx, so there is nothing else to install.</p><div class="cmd"><span><b>$</b> npx fastdraw setup claude</span><span class="copy">Copy</span></div></div></section>
<footer><span>FastDraw · MIT · <u>Source on GitHub</u> · <u>llms.txt</u></span><span>Kinds of diagram after diagram-design by Cathryn Lavery</span></footer>`;

const LOOKS: [string, string, string][] = [
  ['', 'Built-in', 'Rounded cards, tinted zones and one indigo.'], ['engraved', 'Engraved', 'Double rules and a black plate for the subject.'],
  ['whiteboard', 'Whiteboard', 'Sticky-note colours and curved lines.'], ['sketch', 'Sketch', 'Outlines and lettering drawn by hand.'],
  ['headline', 'Headline', 'Flat blocks under a serif headline.'], ['transit', 'Transit', 'Thick routes with stops, like a network map.'],
  ['shade', 'Shade', 'Hairline boxes that cast a hatched shadow.'], ['offset', 'Offset', 'Two inks printed slightly out of register.'],
];
const lookSvg = (id: string) => svg((id ? `look ${id}\n` : '') + DEMO);

// ---------- A. Annotated: Yap's page skeleton, the hero diagram labelled with its own source lines ----------
{
  const sc = buildScene(DEMO, null);
  const S = (id: string) => sc.shapes.find((s) => s.id === id)!;
  // callouts sit above and below the diagram; each one is the file's line for the box it points at
  const band = 70, vb = `${sc.x - 10} ${sc.y - band} ${sc.w + 20} ${sc.h + band * 2}`;
  const targets: [string, 'top' | 'bottom', number][] = [['shop', 'top', 0], ['co', 'top', -60], ['pay', 'top', -150], ['cat', 'bottom', -40], ['cache', 'bottom', 10]];
  const notes = targets.map(([id, side, dx]) => {
    const s = S(id), line = srcLine(id).replace(/ sub="[^"]*"/, '').replace(/ icon=\S+/, '');
    const w = line.length * 7.6 + 20, ax = s.x + s.w * (id === 'pay' ? 0.78 : 0.5), ay = side === 'top' ? s.y : s.y + s.h;
    const ty = side === 'top' ? sc.y - band + 14 : sc.y + sc.h + band - 42, tx = Math.min(Math.max(ax - w / 2 + dx, sc.x), sc.x + sc.w - w);
    const ly = side === 'top' ? ty + 28 : ty;
    return `<path d="M ${ax},${ay} V ${ly}" stroke="#c9a227" stroke-width="1.3"/><circle cx="${ax}" cy="${ay}" r="3.5" fill="#c9a227"/>
<g transform="translate(${tx} ${ty})"><rect width="${w}" height="28" rx="6" fill="#fbe7a6"/><text x="10" y="19" font-family="Geist Mono" font-size="12.5" fill="#3d2f00">${esc(line)}</text></g>`;
  }).join('');
  const hero = `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg">${renderBody(sc)}${notes}</svg>`;
  const pills = LOOKS.slice(0, 4).map(([id, name], i) => `<span class="lp${i === 0 ? ' on' : ''}"><span class="thumb">${lookSvg(id)}</span>${name}</span>`).join('');
  const shots = [['Ask', `<div class="term light"><b>&gt;</b> Draw our checkout flow as docs/checkout.fdraw<br><span class="dim">Reading guide/architecture.md</span><br><span class="dim">Writing docs/checkout.fdraw (16 lines)</span><br><span class="dim">Running fastdraw check: ok</span></div>`, 'The agent writes the file and checks it.'],
    ['Move', svg(DEMO.replace('at 984,112', 'at 984,256')), 'Payments dragged down; line 10 changed and no other.']];
  const body = `<div class="grey">${TOP()}
<section class="hero wrap">
  <div><h1>FastDraw is a text format <em>for diagrams.</em></h1>
  <p class="lede">Claude Code, Codex and Copilot write it from a guide and run a checker over what they wrote. You open the same file on a canvas and move things by hand; each box you move changes its own line and no other.</p></div>
  <div class="side"><div class="cta"><span class="pill">Open the editor</span><span class="pill ghost">View on GitHub</span></div>
  <p class="meta">Open source · Runs in your browser · Files stay on your machine</p>
  <div class="cmd" style="margin-top:22px"><span><b>$</b> npx fastdraw setup claude</span><span class="copy">Copy</span></div></div>
  <div class="art"><div class="frame card">${hero}</div><div class="looks">${pills}<span class="more">+8 more</span></div></div>
</section></div>
<section class="band white"><div class="wrap"><h2>Three steps, <em>then ask for a diagram.</em></h2><p class="lede">The setup writes a short instruction file that points your agent at the guide. Nothing else is installed.</p>${SETUP}</div></section>
<section class="band grey"><div class="wrap walk"><div><h2>From a request <em>to a file in the repo.</em></h2>
  <ol><li><b>Ask in your agent's chat</b>Name the file and say what it should show.</li><li><b>The agent writes and checks it</b>It reads the guide for the kind you asked for, writes the file, and runs <code>fastdraw check</code> until nothing is reported.</li><li><b>Open it and move things</b>Drag, retype, recolour. Each change rewrites only its own line.</li><li><b>Commit it with the code</b>The diff is a few lines. PNG and SVG exports carry the text inside, so they can be opened again.</li></ol></div>
  <div class="shots">${shots.map(([, s, c]) => `<figure><div class="card">${s}</div><figcaption>${c}</figcaption></figure>`).join('')}</div></div></section>
<section class="band white"><div class="wrap"><h2>The agent runs the checker <em>before it answers.</em></h2><p class="lede"><code>fastdraw check</code> reports overlapping boxes, text that does not fit and lines with no room, each with its line number. The agent fixes them before you see the diagram.</p>${CHECK}</div></section>
${CLOSE}`;
  const css = `.hero{display:grid;grid-template-columns:1.5fr 1fr;gap:28px 64px;align-items:end;padding:64px 24px 100px;max-width:1280px}
.hero h1{font-size:72px}.cta{display:flex;gap:26px;align-items:center}
.art{grid-column:1/-1;margin-top:40px}.frame{padding:18px 26px;border-radius:26px}
.looks{display:flex;gap:8px;justify-content:center;margin-top:18px;flex-wrap:wrap}
.lp{display:inline-flex;align-items:center;gap:8px;padding:5px 14px 5px 5px;border-radius:999px;background:#fff;border:1px solid var(--hair);font-weight:500;font-size:14.5px}
.lp.on{background:var(--ink);color:#fff;border-color:var(--ink)}.lp .thumb{width:44px;height:26px;border-radius:999px;overflow:hidden;background:#f6f7fb;display:flex;align-items:center}.more{font-size:14px;color:var(--soft);align-self:center;margin-left:6px}
.walk{display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:start}.walk ol{margin:36px 0 0;padding-left:22px}.walk li{margin-bottom:20px;color:var(--muted);font-size:15.5px}.walk li b{display:block;color:var(--ink);font-size:17px;margin-bottom:3px}
.shots{display:grid;gap:22px;margin-top:8px}.shots figure{margin:0}.shots .card{padding:18px;border-radius:16px}.shots figcaption{font-size:14px;color:var(--muted);margin-top:8px}
.term.light{color:var(--ink);font:13px/1.9 var(--mono)}.term.light b{color:var(--accent)}.term.light .dim{color:var(--soft)}`;
  writeFileSync(here + 'a.html', page('A. Annotated', "Yap's page skeleton, closely: the hero diagram is labelled with yellow tags, and each tag is that box's line from the file. Look pills under it switch the drawing.", body, css));
}

// ---------- B. Bands: a short hero, then the looks carried by a full-width indigo band ----------
{
  const body = `${TOP()}
<section class="hero wrap"><span class="kicker">Open source · for Claude Code, Codex and Copilot</span><h1>Diagrams your agent writes <em>as text.</em></h1>
  <p class="lede">A FastDraw diagram is a short text file that sits in your repository. Agents write it from a guide and check it; you open it on a canvas and move things by hand.</p>
  <div class="cta"><div class="cmd"><span><b>$</b> npx fastdraw setup claude</span><span class="copy">Copy</span></div><span class="pill">Open the editor</span></div>
  <div class="heroart card">${svg(DEMO)}<div class="filebar"><span class="mono">docs/checkout.fdraw</span><span>16 lines · checked</span></div></div>
</section>
<section class="blue"><div class="wrap"><h2>The look is one line <em>at the top of the file.</em></h2><p class="lede">Write <code>look engraved</code> and the same file is drawn another way. Twelve looks ship with FastDraw, and a team can write its own.</p></div>
  <div class="rail">${LOOKS.map(([id, name, about]) => `<figure><div class="tile">${lookSvg(id)}<span class="tag">${id ? 'look ' + id : '(no look line)'}</span></div><figcaption><b>${name}</b>${about}</figcaption></figure>`).join('')}</div>
  <div class="wrap railfoot"><span class="also"><b>ALSO SHIPPED</b> Keys · Listing · Night · Reference</span><span class="arrows"><i>‹</i><i class="on">›</i></span></div></section>
<section class="band white"><div class="wrap"><h2>A guide for <em>44 kinds of diagram.</em></h2><p class="lede">The agent reads the guide for the kind you ask for. Every example below was written by an agent from its guide and is in the repository unchanged.</p>
  <div class="kinds">${[['high-level', 'Architecture'], ['swimlane', 'Swimlane'], ['sankey', 'Sankey'], ['state', 'State machine'], ['db-schema', 'Database schema'], ['gantt', 'Gantt']].map(([k, n]) => `<figure><div class="kt">${kind(k)}</div><figcaption>${n}</figcaption></figure>`).join('')}</div>
  <p class="index">Also: bar, data flow, dependency, deployment, ER, exploded, fishbone, heatmap, journey, kanban, layers, loop, org chart, pyramid, quadrant, radar, timeline, treemap, UML class, Venn, Wardley map and more.</p></div></section>
<section class="band grey"><div class="wrap"><h2>Set up <em>in three steps.</em></h2>${SETUP.replace(/var\(--grey\)/g, '#fff')}</div></section>
<section class="band white"><div class="wrap"><h2>The agent runs the checker <em>before it answers.</em></h2><p class="lede"><code>fastdraw check</code> reports overlapping boxes, text that does not fit and lines with no room, each with its line number.</p>${CHECK}</div></section>
${CLOSE}`;
  const css = `.hero{text-align:center;padding:64px 24px 90px}.kicker{font:500 13px var(--mono);color:var(--accent);background:#eef0ff;border-radius:999px;padding:5px 12px}
.hero h1{margin-top:26px}.hero .lede{margin:22px auto 0}.cta{display:flex;gap:14px;justify-content:center;align-items:center;margin-top:34px}.cta .cmd{background:var(--grey)}
.heroart{margin:64px -60px 0;padding:34px 40px 0;border-radius:26px;overflow:hidden;background:#f6f7fb}.filebar{display:flex;justify-content:space-between;margin:20px -40px 0;padding:12px 22px;background:#fff;border-top:1px solid var(--hair);font-size:13px;color:var(--soft)}
.blue{background:var(--band);color:#fff;padding:110px 0 90px}.blue h2{color:#fff}.blue h2 em{color:var(--yellow)}.blue .lede{color:#d9d8ff}.blue code{background:rgba(255,255,255,.14);padding:1px 6px;border-radius:5px}
.rail{display:flex;gap:18px;overflow:hidden;padding:48px 0 0 calc(50vw - 536px)}.rail figure{margin:0;flex:0 0 400px}
.tile{position:relative;background:#fff;border-radius:18px;padding:30px 18px;height:250px;display:flex;align-items:center;box-shadow:0 30px 50px -30px rgba(0,0,30,.6)}.tile .tag{position:absolute;left:14px;top:12px}
.rail figcaption{color:#d9d8ff;font-size:15px;margin-top:14px;line-height:1.45}.rail b{display:block;color:#fff;font-size:17px;margin-bottom:2px}
.railfoot{display:flex;justify-content:space-between;align-items:center;margin-top:36px}.also{font-size:15px;color:#d9d8ff}.also b{font:500 12.5px var(--mono);letter-spacing:.08em;color:#fff;margin-right:10px}
.arrows i{display:inline-grid;place-items:center;width:44px;height:44px;border-radius:50%;border:1px solid rgba(255,255,255,.3);font-style:normal;font-size:22px;margin-left:8px;color:rgba(255,255,255,.5)}.arrows i.on{background:rgba(255,255,255,.14);color:#fff}
.kinds{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:44px}.kinds figure{margin:0}.kt{background:#f6f7fb;border:1px solid var(--hair);border-radius:16px;aspect-ratio:1.5;display:flex;align-items:center;padding:14px;overflow:hidden}.kt svg{max-height:100%}
.kinds figcaption{font-weight:600;font-size:15px;margin-top:10px}.index{margin-top:26px;font-size:15px;max-width:780px}`;
  writeFileSync(here + 'b.html', page('B. Bands', 'A short centred hero, then the page moves through full-width bands. The looks ride a sideways carousel on an indigo band, as Yap does with its cards and effects.', body, css));
}

// ---------- C. Walkthrough: progress tabs drive the hero, then where diagrams live today ----------
{
  const flagged = (() => {
    const sc = buildScene(broken, null), c = sc.shapes.find((s) => s.id === 'cache')!;
    return `<svg viewBox="${sc.x} ${sc.y} ${sc.w} ${sc.h}" xmlns="http://www.w3.org/2000/svg">${renderBody(sc)}<rect x="${c.x - 6}" y="${c.y - 6}" width="${c.w + 12}" height="${c.h + 12}" rx="12" fill="none" stroke="#e11d48" stroke-width="2" stroke-dasharray="5 4"/><g transform="translate(${c.x + c.w - 20} ${c.y + c.h + 14})"><rect width="310" height="30" rx="6" fill="#ffe4e8"/><text x="11" y="20" font-family="Geist Mono" font-size="13.5" fill="#9f1239">line 9: overlaps "Catalog" (line 8)</text></g></svg>`;
  })();
  const tabs = [['Ask', true, 100], ['Check', true, 45], ['Move by hand', false, 0]] as const;
  const wild: [string, string, string][] = [['high-level', 'sketch', 'Photo of a whiteboard, in a chat thread'], ['swimlane', 'headline', 'Slide 14 of last quarter’s review'], ['state', '', 'PNG in the wiki, source lost'], ['db-schema', 'whiteboard', 'A design tool file nobody else can open']];
  const body = `${TOP()}
<section class="hero wrap"><div class="say"><h1>Diagrams that live <em>next to the code.</em></h1>
  <p class="lede">FastDraw is a text format for diagrams. Your coding agent writes the file from a guide, checks it, and commits it with the change it describes. You can open it on a canvas and move things by hand.</p>
  <div class="cta"><span class="pill">Open the editor</span><span class="pill ghost">View on GitHub</span></div></div>
  <div class="cmdcol"><div class="cmd"><span><b>$</b> npx fastdraw setup claude</span><span class="copy">Copy</span></div><p class="meta">Run in your repository. Codex, OpenCode and Copilot have their own one-word variant.</p></div></section>
<section class="wrap demo">
  <div class="ptabs">${tabs.map(([t, , p], i) => `<div class="pt${i === 1 ? ' on' : ''}"><span class="n">${i + 1}</span>${t}<span class="bar"><b style="width:${p}%"></b></span></div>`).join('')}</div>
  <div class="screen card"><div class="chrome"><i></i><i></i><i></i><span>docs/checkout.fdraw · fastdraw check</span></div>
    <div class="split"><div class="term">${broken.trim().split('\n').map((l, i) => `<div class="ln${i === 8 ? ' hit' : ''}"><span>${i + 1}</span>${esc(l)}</div>`).join('')}</div><div class="pane">${flagged}<span class="tag callout">The agent sees this before you do</span></div></div></div>
  <p class="meta">The tabs advance on their own, about six seconds each. Step 2 is shown: the checker found an overlap on line 9, and the agent moves the box back before it answers.</p></section>
<section class="band grey"><div class="wrap wild"><div class="grid card"><div class="ghead"><b>Diagrams of this codebase</b><span>Not in the repository</span></div><div class="cells">${wild.map(([k, l, c]) => `<figure><div class="cell">${kind(k, l)}</div><figcaption>${c}</figcaption></figure>`).join('')}</div></div>
  <div><h2>Most diagrams of a codebase <em>live outside it.</em></h2><p class="lede">They are drawn once, for a meeting or a document, in a tool the next person may not have. The code keeps changing and the drawing does not.</p>
  <ul><li>An agent can update a text file in the same commit as the code.</li><li>A reviewer sees the change to the diagram as a few changed lines.</li><li>Anyone with a browser can open it; nothing is uploaded.</li></ul></div></div></section>
<section class="band white"><div class="wrap"><h2>Set up <em>in three steps.</em></h2>${SETUP}</div></section>
<section class="blue"><div class="wrap"><h2>One file, <em>twelve looks.</em></h2><p class="lede">Write <code>look engraved</code> as the first line and the same file is drawn another way.</p><div class="looks">${LOOKS.slice(0, 4).map(([id, name]) => `<figure><div class="tile">${lookSvg(id)}</div><figcaption>${name}</figcaption></figure>`).join('')}</div></div></section>
${CLOSE}`;
  const css = `.hero{display:grid;grid-template-columns:1.4fr 1fr;gap:56px;align-items:end;padding:64px 24px 52px}.cta{display:flex;gap:26px;align-items:center;margin-top:30px}.cmdcol .cmd{max-width:none}
.demo{padding-bottom:100px}.ptabs{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px}
.pt{position:relative;background:#fff;border:1px solid var(--hair);border-radius:16px;padding:16px 18px 22px;display:flex;align-items:center;gap:12px;font-weight:600;font-size:16.5px;color:var(--soft)}
.pt.on{color:var(--ink);box-shadow:0 18px 30px -22px rgba(18,19,24,.4)}.pt .n{display:inline-grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--grey);font-size:13px}.pt.on .n{background:var(--ink);color:#fff}
.pt .bar{position:absolute;left:18px;right:18px;bottom:10px;height:3px;border-radius:2px;background:var(--grey)}.pt .bar b{display:block;height:100%;border-radius:2px;background:var(--yellow)}.pt.on .bar b{background:#e2b93b}
.screen{overflow:hidden;border-radius:20px}.chrome{display:flex;gap:7px;align-items:center;padding:12px 16px;background:var(--grey);border-bottom:1px solid var(--hair)}.chrome i{width:11px;height:11px;border-radius:50%;background:#d6d7dc}.chrome span{margin-left:12px;font:13px var(--mono);color:var(--muted)}
.split{display:grid;grid-template-columns:400px 1fr}.split .term{font:11px/1.95 var(--mono);color:var(--muted);padding:14px 0;border-right:1px solid var(--hair);background:#fbfbfc;white-space:nowrap;overflow:hidden}
.ln span{display:inline-block;width:34px;text-align:right;margin-right:12px;color:var(--soft)}.ln.hit{background:#ffe4e8;box-shadow:inset 3px 0 0 #e11d48;color:#9f1239}
.pane{position:relative;background:#f6f7fb;padding:30px 22px;display:flex;align-items:center}.callout{position:absolute;right:22px;top:18px}
.wild{display:grid;grid-template-columns:1fr 1fr;gap:64px;align-items:center}.grid{background:#16171d;border:0;padding:16px;border-radius:22px}.ghead{display:flex;justify-content:space-between;color:#fff;font-size:14px;padding:2px 4px 12px}.ghead span{color:#a3a6b4}
.cells{display:grid;grid-template-columns:1fr 1fr;gap:10px}.cells figure{margin:0}.cell{background:#f6f7fb;border-radius:10px;aspect-ratio:1.25;display:flex;align-items:center;padding:8px;overflow:hidden}.cell svg{max-height:100%}
.cells figcaption{color:#c9cbd6;font-size:12.5px;margin-top:6px;line-height:1.35}
.wild ul{margin:30px 0 0;padding:0;list-style:none}.wild li{position:relative;padding-left:24px;margin-bottom:12px;color:var(--muted)}.wild li::before{content:'';position:absolute;left:2px;top:9px;width:9px;height:9px;border-radius:50%;background:var(--yellow);box-shadow:0 0 0 3px #fbefc8}
.blue{background:var(--band);padding:110px 0}.blue h2{color:#fff}.blue h2 em{color:var(--yellow)}.blue .lede{color:#d9d8ff}.blue code{background:rgba(255,255,255,.14);padding:1px 6px;border-radius:5px}
.looks{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:40px}.looks figure{margin:0}.tile{background:#fff;border-radius:14px;padding:14px;aspect-ratio:1.6;display:flex;align-items:center}.looks figcaption{color:#fff;font-weight:600;margin-top:10px}`;
  writeFileSync(here + 'c.html', page('C. Walkthrough', "Yap's progress tabs drive the hero: Ask, Check, Move by hand, each a real screen. Then a section on where diagrams live today, set beside a grid of them, as Yap does with the camera roll.", body, css));
}
// ---------- D. B's hero, A's look pills, B's guide; no colour band; one page per accent candidate ----------
{
  const ACCENTS: [string, string, string, string, string][] = [
    // slug, name, accent, darker ink for text on white, pale tint for focal fills
    ['vermilion', 'Vermilion', '#e4512b', '#c2401e', '#fde6df'],
    ['teal', 'Teal', '#0f8b8d', '#0b6f71', '#dcf1f0'],
    ['green', 'Green', '#15803d', '#116b33', '#def2e5'],
    ['ochre', 'Ochre', '#b45309', '#924306', '#f9ebd9'],
  ];
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(',');
  const favicon = readFileSync(root + 'editor/public/favicon.svg', 'utf8').replace(/<title>.*?<\/title>/, '');
  for (const [slug, name, acc, ink, tint] of ACCENTS) {
    const re = (h: string) => h.replace(/#4f46e5/gi, acc).replace(/#e6e5fb/gi, tint).replace(/79,70,229/g, rgb(acc));
    const logo = re(favicon).replace('<svg ', '<svg class="logo" ');
    const pills = LOOKS.slice(0, 5).map(([id, n], i) => `<span class="lp${i === 0 ? ' on' : ''}"><span class="thumb">${lookSvg(id)}</span>${n}</span>`).join('');
    const swatches = ACCENTS.map(([s2, n2, a2]) => `<a href="d-${s2}.html" class="${s2 === slug ? 'on' : ''}"><i style="background:${a2}"></i>${n2}</a>`).join('');
    const body = `<header class="top"><div class="brand">${logo}FastDraw</div><nav><span>How it works</span><span>Looks</span><span>Kinds</span><span>GitHub</span><span class="pill sm">Open the editor</span></nav></header>
<section class="hero wrap"><span class="kicker">Open source · for Claude Code, Codex and Copilot</span><h1>Diagrams your agent writes <em>as text.</em></h1>
  <p class="lede">A FastDraw diagram is a short text file that sits in your repository. Agents write it from a guide and check it; you open it on a canvas and move things by hand.</p>
  <div class="cta"><div class="cmd"><span><b>$</b> npx fastdraw setup claude</span><span class="copy">Copy</span></div><span class="pill">Open the editor</span></div>
  <div class="heroart card">${svg(DEMO)}<div class="filebar"><span class="mono">docs/checkout.fdraw</span><span>16 lines · checked</span></div></div>
  <div class="looks">${pills}<span class="more">+7 more looks</span></div>
</section>
<section class="band grey"><div class="wrap"><h2>A guide for <em>44 kinds of diagram.</em></h2><p class="lede">The agent reads the guide for the kind you ask for. Every example below was written by an agent from its guide and is in the repository unchanged.</p>
  <div class="kinds">${[['high-level', 'Architecture'], ['swimlane', 'Swimlane'], ['sankey', 'Sankey'], ['state', 'State machine'], ['db-schema', 'Database schema'], ['gantt', 'Gantt']].map(([k, n]) => `<figure><div class="kt">${kind(k)}</div><figcaption>${n}</figcaption></figure>`).join('')}</div>
  <p class="index">Also: bar, data flow, dependency, deployment, ER, exploded, fishbone, heatmap, journey, kanban, layers, loop, org chart, pyramid, quadrant, radar, timeline, treemap, UML class, Venn, Wardley map and more.</p></div></section>
<section class="band white"><div class="wrap"><h2>Set up <em>in three steps.</em></h2>${SETUP}</div></section>
<section class="band grey"><div class="wrap"><h2>The agent runs the checker <em>before it answers.</em></h2><p class="lede"><code>fastdraw check</code> reports overlapping boxes, text that does not fit and lines with no room, each with its line number.</p>${CHECK}</div></section>
${CLOSE}`;
    const css = `:root{--accent:${acc};--accent-ink:${ink};--tint:${tint}}
.top .logo{width:28px;height:28px}
.hero{text-align:center;padding:64px 24px 100px}.kicker{font:500 13px var(--mono);color:var(--accent-ink);background:var(--tint);border-radius:999px;padding:5px 12px}
.hero h1{margin-top:26px}.hero .lede{margin:22px auto 0}.cta{display:flex;gap:14px;justify-content:center;align-items:center;margin-top:34px}.cta .cmd{background:var(--grey)}
.heroart{margin:64px -60px 0;padding:34px 40px 0;border-radius:26px;overflow:hidden;background:#f6f7fb;text-align:left}.filebar{display:flex;justify-content:space-between;margin:20px -40px 0;padding:12px 22px;background:#fff;border-top:1px solid var(--hair);font-size:13px;color:var(--soft)}
.looks{display:flex;gap:8px;justify-content:center;margin-top:22px;flex-wrap:wrap}
.lp{display:inline-flex;align-items:center;gap:8px;padding:5px 14px 5px 5px;border-radius:999px;background:#fff;border:1px solid var(--hair);font-weight:500;font-size:14.5px}
.lp.on{background:var(--ink);color:#fff;border-color:var(--ink)}.lp .thumb{width:44px;height:26px;border-radius:999px;overflow:hidden;background:#f6f7fb;display:flex;align-items:center}.more{font-size:14px;color:var(--soft);align-self:center;margin-left:6px}
.kinds{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:44px}.kinds figure{margin:0}.kt{background:#fff;border:1px solid var(--hair);border-radius:16px;aspect-ratio:1.5;display:flex;align-items:center;padding:14px;overflow:hidden}.kt svg{max-height:100%}
.kinds figcaption{font-weight:600;font-size:15px;margin-top:10px}.index{margin-top:26px;font-size:15px;max-width:780px}
.swatch{position:fixed;right:18px;bottom:18px;z-index:9;display:flex;gap:6px;background:#fff;border:1px solid var(--hair);border-radius:999px;padding:6px;box-shadow:0 12px 30px -16px rgba(0,0,0,.4)}
.swatch a{display:flex;align-items:center;gap:6px;padding:5px 12px 5px 6px;border-radius:999px;color:var(--ink);text-decoration:none;font-size:13.5px;font-weight:500}.swatch a.on{background:var(--grey)}.swatch i{width:18px;height:18px;border-radius:50%}`;
    writeFileSync(here + `d-${slug}.html`, page(`D. ${name}`, "B's hero, A's look pills under it, B's guide to the kinds; no colour band. The accent replaces indigo in the page, the logo and the built-in look's focal box and main path.", re(body) + `<div class="swatch">${swatches}</div>`, css));
  }
}
console.log('wrote a.html b.html c.html d-*.html');
