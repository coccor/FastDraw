// fastdraw.dev: what FastDraw is (an agent writes the diagram, a person edits it), how to set an
// agent up, and every kind of diagram it has a guide for. The editor itself lives at /edit/.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { buildScene } from '../../../src/scene.ts';
import { renderBody } from '../../../src/render.ts';
import { TEMPLATES, type Template } from '../templates.ts';
import { Hero } from './Hero.tsx';
import { Showcase } from './Showcase.tsx';

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
  const view = useMemo(() => {
    if (!seen) return null;
    const sc = buildScene(t.text, null);
    return { body: renderBody(sc), box: `${sc.x} ${sc.y} ${sc.w} ${sc.h}` };
  }, [seen, t]);
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

export function Landing() {
  return (
    <>
      <header className="top">
        <a className="brand" href="./"><img src="favicon.svg" alt="" width="28" height="28" />FastDraw</a>
        <nav>
          <a href="#setup">Set up</a>
          <a href="#kinds">Kinds</a>
          <a href={REPO}>GitHub</a>
          <a className="btn" href="edit/">Open the editor</a>
        </nav>
      </header>

      <main>
        <section className="hero">
          <div className="intro">
            <h1>Your coding agent draws the diagram. You finish it by hand.</h1>
            <p className="lede">
              FastDraw is a diagram format for Claude Code, Codex and Copilot. The agent writes a small text file and
              checks its own work. You open it on a canvas, drag things into place, and your change goes back into the text.
            </p>
            <div className="ctas">
              <a className="btn focal" href="#setup">Set up your agent</a>
              <a className="btn" href="edit/">Open the editor</a>
            </div>
            <p className="small muted">Free and open source. Your files never leave your machine.</p>
          </div>
          <Hero />
        </section>

        <Showcase />

        <section id="setup" className="block">
          <h2>Set up your agent</h2>
          <p className="lede">
            One command in your repository adds a short instruction file that points your agent at the guide. The tool
            runs through <code>npx</code>, so there is nothing else to install. It needs Node 20 or later.
          </p>
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
              <p className="muted">Or drop any <code>.fdraw</code> file onto the <a href="edit/">editor</a>.</p>
            </div>
          </div>
        </section>

        <section className="block why">
          <h2>Why a text file</h2>
          <dl>
            <div><dt>It is reviewed like code</dt><dd>Diagrams live in the repository next to what they describe. A change shows up as a few lines in a diff.</dd></div>
            <div><dt>Your edits are kept</dt><dd>Moving a box changes one line. The agent leaves what you arranged alone and places only what it adds.</dd></div>
            <div><dt>One look for the whole team</dt><dd>A <code>.look</code> file names the styles: what a service, a store or the main path looks like. Every diagram follows it.</dd></div>
            <div><dt>Nothing is uploaded</dt><dd>The editor runs in your browser and saves to your files. Exported PNG and SVG files carry the diagram inside, so they open for editing again.</dd></div>
          </dl>
        </section>

        <section id="kinds" className="block">
          <h2>{TEMPLATES.length} kinds of diagram, each with a guide the agent follows</h2>
          <p className="lede">Every example below was drawn by an agent from the guide alone. Open one to change it in the editor.</p>
          <div className="tiles">{TEMPLATES.map((t) => <Tile key={t.kind} t={t} />)}</div>
        </section>
      </main>

      <footer>
        <p>FastDraw is open source under the MIT licence. <a href={REPO}>Source on GitHub</a>. The guide for agents is at <a href="llms.txt">llms.txt</a>.</p>
        <p className="muted">The kinds of diagram and many composition ideas follow <a href="https://github.com/cathrynlavery/diagram-design">diagram-design</a> by Cathryn Lavery.</p>
      </footer>
    </>
  );
}
