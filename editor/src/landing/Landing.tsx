// fastdraw.dev: what FastDraw is (an agent writes the diagram, a person edits it), how to set an
// agent up, and every kind of diagram it has a guide for. The editor itself lives at /edit/.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { buildScene } from '../../../src/scene.ts';
import { renderBody } from '../../../src/render.ts';
import { TEMPLATES, type Template } from '../templates.ts';
import { Hero } from './Hero.tsx';
import { Showcase } from './Showcase.tsx';
import { Illustration } from './Illustration.tsx';
import { ThemeToggle } from '../ThemeToggle.tsx';
import { useTheme } from '../theme.ts';
import { inTheme } from './inTheme.ts';
import layersSource from './layers.fdraw?raw';

const REPO = 'https://github.com/coccor/fastdraw';

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

function Command({ text }: { text: string }) {
  return <div className="command"><code>{text}</code><CopyButton text={text} /></div>;
}

type Agent = { id: string; name: string; body: React.ReactNode };
const AGENTS: Agent[] = [
  {
    id: 'claude', name: 'Claude Code',
    body: <>
      <p>Run this in your repository. It adds a skill at <code>.claude/skills/fastdraw</code> that Claude Code loads whenever a diagram is asked for.</p>
      <Command text="npx fastdraw setup claude" />
      <p className="muted">Add <code>--global</code> to put the skill in <code>~/.claude</code> for every repository.</p>
    </>,
  },
  {
    id: 'agents', name: 'Codex and OpenCode',
    body: <>
      <p>Run this in your repository. It adds a short Diagrams section to <code>AGENTS.md</code>, which Codex, OpenCode and other agents read on start.</p>
      <Command text="npx fastdraw setup agents" />
    </>,
  },
  {
    id: 'copilot', name: 'GitHub Copilot',
    body: <>
      <p>Run this in your repository. It adds the same section to <code>.github/copilot-instructions.md</code>.</p>
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

const ASKS = [
  "Draw this repo's architecture as docs/architecture.fdraw",
  'Turn the signup flow in src/auth into a flowchart',
  'Add the new billing service to docs/architecture.fdraw',
];

// A kind's example, drawn once it scrolls into view.
function Tile({ t }: { t: Template }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver !== 'function') { setSeen(true); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const theme = useTheme();
  const view = useMemo(() => {
    if (!seen) return null;
    const sc = buildScene(inTheme(t.text, theme), null);
    return { body: renderBody(sc), box: `${sc.x} ${sc.y} ${sc.w} ${sc.h}` };
  }, [seen, t, theme]);
  return (
    <a ref={ref} className="tile" href={`edit/?kind=${encodeURIComponent(t.kind)}`}>
      <span className="pic">
        {view && <svg viewBox={view.box} preserveAspectRatio="xMidYMid meet" aria-hidden="true" dangerouslySetInnerHTML={{ __html: view.body }} />}
      </span>
      <b>{t.title}</b>
      <span className="about">{t.about}</span>
    </a>
  );
}

// How a diagram gets made, as an exploded stack: the prompt at the bottom, the files on top.
// Drawn live from layers.fdraw, in the built-in look or, on a dark page, in Night.
function HowItWorks() {
  const theme = useTheme();
  const view = useMemo(() => {
    const sc = buildScene(inTheme(layersSource, theme), null);
    return { body: renderBody(sc, false), box: `${sc.x} ${sc.y} ${sc.w} ${sc.h}` };
  }, [theme]);
  return (
    <section id="how" className="how" aria-labelledby="how-title">
      <div className="howtext">
        <h2 id="how-title">From a sentence to a finished diagram</h2>
        <p className="lede">
          You ask in plain words. The skill points the agent at the guide for that kind of diagram and at your look.
          The agent writes the diagram as text and runs <code>fastdraw check</code> until it is clean.
        </p>
        <p>
          What comes out is a PNG or SVG with the diagram inside it, and the <code>.fdraw</code> file itself. Any of
          them opens in the editor, so you can carry on by hand.
        </p>
      </div>
      <div className="howart">
        <svg viewBox={view.box} role="img" aria-label="Five layers, bottom to top: your prompt; SKILL.md, which picks one of 44 kinds; the kind's guide and the look, with layout rules and named styles; the diagram text, a .fdraw file checked until clean, highlighted; and the result, PNG, SVG and .fdraw, each of which reopens in the editor."
          dangerouslySetInnerHTML={{ __html: view.body }} />
      </div>
    </section>
  );
}

// The mark: a box, a line, and the box you just moved, in highlighter yellow.
function Mark() {
  return (
    <svg className="mark" viewBox="0 0 256 256" width="30" height="30" aria-hidden="true">
      <rect width="256" height="256" rx="58" className="tile-bg" />
      <path d="M92 104V160A18 18 0 0 0 110 178H128" fill="none" stroke="#fff" strokeWidth="14" strokeLinecap="round" />
      <rect x="42" y="44" width="100" height="68" rx="16" fill="#fff" />
      <rect x="120" y="144" width="96" height="68" rx="16" fill="#ffdc2e" />
    </svg>
  );
}

const KEPT: { term: string; text: React.ReactNode }[] = [
  { term: 'Send the picture, keep the diagram', text: <>Every PNG and SVG you export carries the diagram inside it. Whoever receives it drops it onto the <a href="edit/">editor</a> and carries on where you stopped.</> },
  { term: 'Reviewed like code', text: <>The <code>.fdraw</code> file lives in the repository next to what it describes. Moving a box is one changed line in a pull request.</> },
  { term: 'Your edits are kept', text: <>The agent reads the file before it touches it. It leaves what you arranged alone and places only what it adds.</> },
  { term: 'Nothing is uploaded', text: <>The editor runs in your browser and saves to your own files. There is no account and no server holding your diagrams.</> },
];

export function Landing() {
  return (
    <>
      <div className="lead">
        <header className="top">
          <a className="brand" href="./"><Mark />FastDraw</a>
          <nav>
            <a href="#how">How it works</a>
            <a href="#setup">Set up</a>
            <a href="#kinds">Kinds</a>
            <a href={REPO}>GitHub</a>
            <ThemeToggle className="themetoggle" />
            <a className="btn marker" href="edit/">Open the editor</a>
          </nav>
        </header>
        <section className="hero">
          <h1><span>Your agent draws the diagram.</span> <span>You drag it into shape.</span></h1>
          <div className="pitch">
            <p>
              FastDraw is a diagram format for Claude Code, Codex and Copilot. The agent writes a small text file and
              checks its own work. You move things on a canvas, and each change goes back into the file as one line.
            </p>
            <div className="ctas">
              <a className="btn marker" href="#setup">Set up your agent</a>
              <a className="btn ghost" href="edit/">Open the editor</a>
            </div>
          </div>
        </section>
      </div>

      <main>
        <div className="benchwrap">
          <Hero />
          <p className="benchnote">This is the real renderer and the real file format, running in your browser. Free and open source.</p>
        </div>

        <Showcase />

        <Illustration />

        <HowItWorks />

        <section className="kept" aria-labelledby="kept-title">
          <h2 id="kept-title">It is still a diagram after you send it</h2>
          <dl>
            {KEPT.map((k) => <div key={k.term}><dt>{k.term}</dt><dd>{k.text}</dd></div>)}
          </dl>
        </section>

        <section id="setup" className="setupband" aria-labelledby="setup-title">
          <div className="setuphead">
            <h2 id="setup-title">Set up your agent</h2>
            <p className="lede">
              One command in your repository adds a short instruction file that points your agent at the guide. The tool
              runs through <code>npx</code>, so there is nothing else to install. It needs Node 20 or later.
            </p>
          </div>
          <Setup />
          <div className="next">
            <div>
              <h3>Then ask for a diagram</h3>
              <ul className="asks">{ASKS.map((a) => <li key={a}>{a}</li>)}</ul>
            </div>
            <div>
              <h3>Change it yourself</h3>
              <p>This opens the diagram in the editor. What you change is saved into the file, and the agent reads it before its next edit.</p>
              <Command text="npx fastdraw open docs/architecture.fdraw" />
              <p>Or drop any <code>.fdraw</code> file onto the <a href="edit/">editor</a>.</p>
            </div>
          </div>
        </section>

        <section id="kinds" className="kinds" aria-labelledby="kinds-title">
          <h2 id="kinds-title">{TEMPLATES.length} kinds of diagram, each with a guide the agent follows</h2>
          <p className="lede">Every example below was drawn by an agent from the guide alone. Open one to change it in the editor.</p>
          <div className="tiles">{TEMPLATES.map((t) => <Tile key={t.kind} t={t} />)}</div>
        </section>
      </main>

      <footer>
        <div className="footin">
          <a className="brand" href="./"><Mark />FastDraw</a>
          <p>Open source under the MIT licence. <a href={REPO}>Source on GitHub</a>. The guide for agents is at <a href="llms.txt">llms.txt</a>.</p>
          <p>The kinds of diagram and many composition ideas follow <a href="https://github.com/cathrynlavery/diagram-design">diagram-design</a> by Cathryn Lavery.</p>
        </div>
      </footer>
    </>
  );
}
