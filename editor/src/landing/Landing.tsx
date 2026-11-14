// fastdraw.dev: says what FastDraw is, puts a small editor under it to try, then the looks, the kinds
// of diagram, and how to set an agent up. The full editor lives at /edit/.
import React, { useMemo, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { buildScene } from '../../../src/scene.ts';
import { renderBody } from '../../../src/render.ts';
import { TEMPLATES } from '../templates.ts';
import { ThemeToggle } from '../ThemeToggle.tsx';
import { useTheme } from '../theme.ts';
import { inTheme } from './inTheme.ts';
import { Workbench, type Doc } from './Workbench.tsx';
import checkout from './checkout.fdraw?raw';

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

// '' is the built-in look, which needs no line in the file
const LOOKS: { id: string; name: string; about: string }[] = [
  { id: '', name: 'Built-in', about: 'Rounded cards, tinted zones and one indigo. Used when the file names no look.' },
  { id: 'whiteboard', name: 'Whiteboard', about: 'Sticky-note colours, rounded boxes and curved lines.' },
  { id: 'sketch', name: 'Sketch', about: 'Outlines and lettering drawn by hand, for early ideas.' },
  { id: 'headline', name: 'Headline', about: 'Flat blocks under a serif headline, like a newspaper graphic.' },
  { id: 'night', name: 'Night', about: 'The built-in look on a dark page.' },
  { id: 'shade', name: 'Shade', about: 'Hairline boxes that cast a hatched shadow.' },
  { id: 'engraved', name: 'Engraved', about: 'Double rules and a black plate for the subject.' },
  { id: 'keys', name: 'Keys', about: 'Boxes with a side, like keycaps.' },
  { id: 'transit', name: 'Transit', about: 'Thick routes with stops, like a network map.' },
  { id: 'offset', name: 'Offset', about: 'Two inks printed slightly out of register.' },
  { id: 'listing', name: 'Listing', about: 'A printout on striped listing paper.' },
  { id: 'reference', name: 'Reference', about: 'The palette of diagram-design, the project FastDraw follows.' },
];

// The diagram in the editor above, drawn small in each look. Choosing one writes the look line into the file.
function Looks({ doc, pick }: { doc: Doc; pick: (id: string) => void }) {
  const theme = useTheme();
  const thumbs = useMemo(() => LOOKS.map((l) => {
    const sc = buildScene(inTheme((l.id ? `look ${l.id}\n` : '') + doc.body, theme), null);
    return { body: renderBody(sc), box: `${sc.x} ${sc.y} ${sc.w} ${sc.h}` };
  }), [doc.body, theme]);
  const on = LOOKS.find((l) => l.id === doc.look) ?? LOOKS[0];
  return (
    <section id="looks" className="block" aria-labelledby="looks-title">
      <h2 id="looks-title">The look is one line at the top of the file</h2>
      <p className="lede">
        These are {LOOKS.length} drawings of the diagram in the editor above, one in each look that ships with FastDraw.
        Choose one and a line such as <code>look engraved</code> is written at the top of the file; the built-in look
        needs no line. A team can write its own <code>.look</code> file, and every diagram that names it follows it.
      </p>
      <div className="lookgrid" role="radiogroup" aria-label="Look">
        {LOOKS.map((l, i) => (
          <button key={l.name} role="radio" aria-checked={l.id === doc.look} className={l.id === doc.look ? 'on' : ''} onClick={() => pick(l.id)}>
            <svg viewBox={thumbs[i].box} preserveAspectRatio="xMidYMid meet" aria-hidden="true" dangerouslySetInnerHTML={{ __html: thumbs[i].body }} />
            <b>{l.name}</b>
          </button>
        ))}
      </div>
      <p className="lookabout" role="status"><b>{on.name}.</b> {on.about}</p>
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
          <h1>FastDraw is a text format for diagrams</h1>
          <div className="intro">
            <p className="lede">
              Claude Code, Codex and Copilot write it from a guide and run a checker over the result. You can open the
              same file on a canvas and move things by hand. The editor below has one loaded: drag a box and see
              which line of the file changes.
            </p>
          </div>
          <div className="start">
            <Command text="npx fastdraw setup claude" />
            <p className="small muted">Run this in your repository to add the skill for Claude Code. <a href="#setup">Codex, Copilot and chat assistants</a> are set up the same way.</p>
          </div>
        </section>

        <Workbench doc={doc} setDoc={set} onSettle={settle} />

        <Looks doc={settled} pick={pickLook} />

        <section id="kinds" className="block" aria-labelledby="kinds-title">
          <h2 id="kinds-title">There is a guide for {TEMPLATES.length} kinds of diagram</h2>
          <p className="lede">
            The agent reads the guide for the kind you ask for. Each example was written by an agent from its guide
            and is in the repository unchanged. Choose a name to load that example into the editor above.
          </p>
          <ul className="kinds">
            {TEMPLATES.map((t) => (
              <li key={t.kind}>
                <button className={doc.kind === t.kind ? 'on' : ''} aria-pressed={doc.kind === t.kind} onClick={() => pickKind(t.kind)} title={t.about}>{t.title}</button>
              </li>
            ))}
          </ul>
        </section>

        <section className="block why" aria-labelledby="why-title">
          <h2 id="why-title">Why a text file</h2>
          <div className="prose">
            <p>
              The diagram sits in the repository next to the code it describes, so a change to it shows up in a pull
              request as a few changed lines. Moving a box by hand changes that box's line and no other. The agent
              reads the file before its next edit, keeps your layout, and places only what it adds.
            </p>
            <p>
              Exported PNG and SVG files carry the diagram text inside them, so either one can be opened and edited
              again. The editor runs in your browser and reads and writes files on your machine. Nothing is uploaded.
            </p>
          </div>
        </section>

        <section id="setup" className="block" aria-labelledby="setup-title">
          <h2 id="setup-title">Set up your agent</h2>
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
      </main>

      <footer>
        <p>FastDraw is open source under the MIT licence. <a href={REPO}>Source on GitHub</a>. The guide for agents is at <a href="llms.txt">llms.txt</a>.</p>
        <p className="muted">The kinds of diagram and many composition ideas follow <a href="https://github.com/cathrynlavery/diagram-design">diagram-design</a> by Cathryn Lavery.</p>
      </footer>
    </>
  );
}
