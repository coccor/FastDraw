// fastdraw.dev: says what FastDraw is, puts a small editor under it to try with the looks as pills beneath,
// then the kinds of diagram, how to set an agent up, and the checker. The full editor lives at /edit/.
import React, { useMemo, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { buildScene } from '../../../src/scene.ts';
import { renderBody } from '../../../src/render.ts';
import { TEMPLATES } from '../templates.ts';
import { ThemeToggle } from '../ThemeToggle.tsx';
import { useTheme, type Theme } from '../theme.ts';
import { inTheme } from './inTheme.ts';
import { Workbench, type Doc } from './Workbench.tsx';
import checkout from './checkout.fdraw?raw';

const REPO = 'https://github.com/coccor/fastdraw';
// the hero recording plays by itself unless the visitor asked for less motion
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function CopyButton({ text, label = 'Copy' }: { text: string | (() => Promise<string>); label?: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(typeof text === 'string' ? text : await text());
      setDone(true);
      window.setTimeout(() => setDone(false), 1600);
    } catch { /* the clipboard was refused; the text is on screen to select */ }
  };
  return (
    <button className="copy" onClick={copy} aria-live="polite">
      {done ? <Check size={15} /> : <Copy size={15} />}{done ? 'Copied' : label}
    </button>
  );
}

// a command to copy; a slash command is typed in the agent, so it gets no shell prompt
function Command({ text }: { text: string }) {
  return <div className={text.startsWith('/') ? 'command slash' : 'command'}><code>{text}</code><CopyButton text={text} /></div>;
}

// a drawing of a diagram text, for thumbnails
function draw(text: string, theme: Theme) {
  const sc = buildScene(inTheme(text, theme), null);
  return { body: renderBody(sc), box: `${sc.x} ${sc.y} ${sc.w} ${sc.h}` };
}

type Agent = { id: string; name: string; body: React.ReactNode };
const AGENTS: Agent[] = [
  {
    id: 'claude', name: 'Claude Code',
    body: <>
      <p>Type this in Claude Code. It installs the FastDraw plugin for every repository; Claude Code loads its skill whenever a diagram is asked for.</p>
      <Command text="/plugin install fastdraw --marketplace coccor/fastdraw" />
      <p className="muted">Updates come through <code>/plugin</code>. On Claude Code older than 2.1.275, first run <code>/plugin marketplace add coccor/fastdraw</code>, then <code>/plugin install fastdraw@fastdraw</code>.</p>
    </>,
  },
  {
    id: 'agents', name: 'Codex and OpenCode',
    body: <>
      <p>Run this in a terminal. It installs the FastDraw skill in <code>~/.agents/skills</code>, which Codex and OpenCode read, so it works in every repository.</p>
      <Command text="npx skills add coccor/fastdraw -g" />
      <p className="muted">Leave out <code>-g</code> to put the skill in the repository instead, for a team to commit. <code>npx skills update</code> updates it.</p>
    </>,
  },
  {
    id: 'copilot', name: 'GitHub Copilot',
    body: <>
      <p>Run this in your repository. It adds a short Diagrams section to <code>.github/copilot-instructions.md</code>.</p>
      <Command text="npx fastdraw setup copilot" />
    </>,
  },
  {
    id: 'chat', name: 'A chat assistant',
    body: <>
      <p>An assistant that can read web pages needs no setup. Start your message with this:</p>
      <Command text="Read https://fastdraw.dev/llms.txt, then draw this as a FastDraw diagram:" />
      <p>If it cannot open links, paste the guide into the chat yourself:</p>
      <div className="row"><CopyButton label="Copy the guide" text={() => fetch('llms.txt').then((r) => r.text())} /><a href="llms.txt">Read it first</a></div>
      <p className="muted">Paste its answer into the editor with <b>Paste diagram text</b>.</p>
    </>,
  },
];

function Setup() {
  const [tab, setTab] = useState(AGENTS[0].id);
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: React.KeyboardEvent) => {
    const i = AGENTS.findIndex((a) => a.id === tab);
    const j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : -9;
    if (j === -9) return;
    const next = AGENTS[(j + AGENTS.length) % AGENTS.length];
    setTab(next.id);
    ref.current?.querySelector<HTMLButtonElement>(`#tab-${next.id}`)?.focus();
  };
  const agent = AGENTS.find((a) => a.id === tab)!;
  return (
    <div className="setup">
      <div className="tabs" role="tablist" aria-label="Your agent" ref={ref} onKeyDown={move}>
        {AGENTS.map((a) => (
          <button key={a.id} id={`tab-${a.id}`} role="tab" aria-selected={a.id === tab} aria-controls="setup-panel"
            tabIndex={a.id === tab ? 0 : -1} className={a.id === tab ? 'on' : ''} onClick={() => setTab(a.id)}>{a.name}</button>
        ))}
      </div>
      <div className="tabpanel" id="setup-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>{agent.body}</div>
    </div>
  );
}

// '' is the built-in look, which needs no line in the file
const LOOKS: { id: string; name: string; about: string }[] = [
  { id: '', name: 'Built-in', about: 'Rounded cards, tinted zones and one tomato red. Used when the file names no look.' },
  { id: 'whiteboard', name: 'Whiteboard', about: 'Sticky-note colours, rounded boxes and curved lines.' },
  { id: 'sketch', name: 'Sketch', about: 'Outlines and lettering drawn by hand, for early ideas.' },
  { id: 'shade', name: 'Shade', about: 'Hairline boxes that cast a hatched shadow.' },
  { id: 'reference', name: 'Reference', about: 'The palette of diagram-design, the project FastDraw follows.' },
];

// Under the editor: one pill per look, each with the diagram drawn small in it. Choosing one writes the look line.
function LookPills({ doc, pick }: { doc: Doc; pick: (id: string) => void }) {
  const theme = useTheme();
  const thumbs = useMemo(() => LOOKS.map((l) => draw((l.id ? `look ${l.id}\n` : '') + doc.body, theme)), [doc.body, theme]);
  const on = LOOKS.find((l) => l.id === doc.look) ?? LOOKS[0];
  return (
    <div id="looks" className="looks">
      <div className="pills" role="radiogroup" aria-label="Look">
        {LOOKS.map((l, i) => (
          <button key={l.name} role="radio" aria-checked={l.id === doc.look} className={'pill-look' + (l.id === doc.look ? ' on' : '')} onClick={() => pick(l.id)}>
            <svg viewBox={thumbs[i].box} preserveAspectRatio="xMidYMid slice" aria-hidden="true" dangerouslySetInnerHTML={{ __html: thumbs[i].body }} />
            {l.name}
          </button>
        ))}
      </div>
      <p className="lookabout" role="status"><b>{on.name}.</b> {on.about} {on.id ? <>The file starts with <code>look {on.id}</code>.</> : <>The file needs no look line.</>}</p>
    </div>
  );
}

const SHOWN = ['architecture', 'swimlane', 'sankey', 'state', 'db-schema', 'gantt'];

function Kinds({ current, pick }: { current: string | null; pick: (kind: string) => void }) {
  const theme = useTheme();
  const shown = useMemo(() => SHOWN.map((k) => TEMPLATES.find((t) => t.kind === k)).filter((t) => !!t)
    .map((t) => ({ t, ...draw(t.text, theme) })), [theme]);
  return (
    <section id="kinds" className="band grey" aria-labelledby="kinds-title">
      <div className="wrap">
        <h2 id="kinds-title">A guide for <em>{TEMPLATES.length} kinds of diagram.</em></h2>
        <p className="lede">
          The agent reads the guide for the kind you ask for. Every example was written by an agent from its guide
          and is in the repository unchanged. Choose one to load it into the editor above.
        </p>
        {/* the large drawings repeat names from the list below, so they are a mouse shortcut only */}
        <div className="kindgrid" aria-hidden="true">
          {shown.map(({ t, body, box }) => (
            <div key={t.kind} className="kindcard" onClick={() => pick(t.kind)}>
              <div className="kindart"><svg viewBox={box} preserveAspectRatio="xMidYMid meet" dangerouslySetInnerHTML={{ __html: body }} /></div>
              <b>{t.title}</b>
            </div>
          ))}
        </div>
        <ul className="kinds">
          {TEMPLATES.map((t) => (
            <li key={t.kind}>
              <button className={current === t.kind ? 'on' : ''} aria-pressed={current === t.kind} onClick={() => pick(t.kind)} title={t.about}>{t.title}</button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// the checker's report on a broken copy of the diagram, then on the fixed one
function Checker() {
  const theme = useTheme();
  const art = useMemo(() => draw(checkout, theme), [theme]);
  return (
    <section className="band grey" aria-labelledby="check-title">
      <div className="wrap">
        <h2 id="check-title">The agent runs the checker <em>before it answers.</em></h2>
        <p className="lede">
          <code>fastdraw check</code> reports overlapping boxes, text that does not fit and lines with no room, each
          with its line number. The agent fixes them before you see the diagram.
        </p>
        <div className="check">
          <div className="term" aria-label="A terminal session">
            <div><b>$</b> fastdraw check docs/checkout.fdraw</div>
            <div className="bad">line 9: "Cache" overlaps "Catalog" (line 8)</div>
            <div className="dim"># the agent moves Cache back into the Data zone</div>
            <div><b>$</b> fastdraw check docs/checkout.fdraw</div>
            <div className="ok">ok: no problems found</div>
          </div>
          <div className="pane"><svg viewBox={art.box} preserveAspectRatio="xMidYMid meet" aria-hidden="true" dangerouslySetInnerHTML={{ __html: art.body }} /></div>
        </div>
      </div>
    </section>
  );
}

const START: Doc = { name: 'checkout.fdraw', kind: null, look: '', body: checkout, orig: checkout };

export function Landing() {
  const [doc, setDoc] = useState<Doc>(START);
  // the looks are redrawn when a drag ends, not on every pixel of it
  const [settled, setSettled] = useState<Doc>(START);
  const set = (d: Doc) => { setDoc(d); };
  const settle = (d: Doc) => { setDoc(d); setSettled(d); };
  const toTop = () => document.getElementById('try')?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  const pickLook = (id: string) => settle({ ...doc, look: id });
  const pickKind = (kind: string) => {
    const t = TEMPLATES.find((x) => x.kind === kind)!;
    const body = t.text.replace(/^\n+/, '');
    settle({ name: `${kind}.fdraw`, kind, look: '', body, orig: body });
    toTop();
  };

  return (
    <>
      <header className="top">
        <a className="brand" href="./"><img src="favicon.svg" alt="" width="28" height="28" />FastDraw</a>
        <nav>
          <a href="#looks">Looks</a>
          <a href="#kinds">Kinds</a>
          <a href="#setup">Set up</a>
          <a href={REPO}>GitHub</a>
          <ThemeToggle className="themetoggle" />
          <a className="btn focal" href="edit/">Open the editor</a>
        </nav>
      </header>

      <main>
        <section className="hero">
          <span className="kicker">Open source · for Claude Code, Codex, OpenCode and Copilot</span>
          <h1>Diagrams your agent writes <br /><em>as text.</em></h1>
          <div className="start">
            <Command text="npx skills add coccor/fastdraw" />
            <a className="btn focal big" href="edit/">Open the editor</a>
          </div>
          <p className="small muted">The command installs the FastDraw skill for the coding agents it finds: Claude Code, Codex, OpenCode, Cursor and others. <a href="#setup">Claude Code's plugin, Copilot and chat assistants</a> are below.</p>
          {/* a recorded session: a person asks Claude Code for a diagram and three changes, then edits it by hand */}
          <video className="herovideo" src="demo.mp4" poster="demo-poster.jpg" autoPlay={!reducedMotion()} muted loop playsInline controls preload="metadata" width={1920} height={1080}
            aria-label="Recording: a person asks Claude Code for a checkout diagram, a Redis cache, a Stripe payment and a look of their own, then moves boxes and adds one in the editor">
            <a href="demo.mp4">Watch the recording (MP4)</a>
          </video>
        </section>

        <div className="stage">
          <Workbench doc={doc} setDoc={set} onSettle={settle} />
          <LookPills doc={settled} pick={pickLook} />
        </div>
      </main>

      <Kinds current={doc.kind} pick={pickKind} />

      <section id="setup" className="band white" aria-labelledby="setup-title">
        <div className="wrap">
          <h2 id="setup-title">Set up <em>in three steps.</em></h2>
          <p className="lede">
            One command installs a short skill that points your agent at the guide, once for every repository. The
            tool runs through <code>npx</code>, so there is nothing else to install. It needs Node 20 or later.
          </p>
          <ol className="steps">
            <li><i>1</i><h3>Install the skill</h3><p>Choose your agent below. Each command installs one short skill file and nothing else.</p></li>
            <li><i>2</i><h3>Ask for a diagram</h3><p>“Draw this repo's architecture as docs/architecture.fdraw.” The agent reads the guide for that kind of diagram, writes the file and checks it.</p></li>
            <li><i>3</i><h3>Open it and move things</h3><p><code>npx fastdraw open docs/architecture.fdraw</code> opens the editor. What you change is saved into the file, and the agent reads it before its next edit.</p></li>
          </ol>
          <Setup />
        </div>
      </section>

      <Checker />

      <section className="close" aria-labelledby="close-title">
        <div className="wrap">
          <h2 id="close-title">Set it up <em>in your repository.</em></h2>
          <p>
            The diagram sits next to the code it describes, so a change to it shows up in a pull request as a few
            changed lines. Exported PNG and SVG files carry the diagram text inside them, so either one can be opened
            and edited again. The editor runs in your browser; nothing is uploaded.
          </p>
          <Command text="npx skills add coccor/fastdraw" />
        </div>
      </section>

      <footer>
        <p>FastDraw is open source under the MIT licence. <a href={REPO}>Source on GitHub</a>. The guide for agents is at <a href="llms.txt">llms.txt</a>.</p>
        <p className="muted">The kinds of diagram and many composition ideas follow <a href="https://github.com/cathrynlavery/diagram-design">diagram-design</a> by Cathryn Lavery.</p>
      </footer>
    </>
  );
}
