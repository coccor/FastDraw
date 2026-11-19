// The diagram drawn in every look there is, to try one on. Hovering a look shows it on the
// canvas; clicking one applies it at once (one undo step), and the picker stays open to try more.
// Under them, looks from a GitHub repository: type owner/repo (or paste a link) and its .look files are
// fetched and drawn the same way; choosing one names it in the diagram by its address.
// Each look is offered once, by its light name, and drawn in its version for the app's theme: Built-in shows
// Night when the theme is dark, Shade shows shade-dark. A look that is another's dark version is not listed.
import React, { useEffect, useMemo, useState } from 'react';
import type { Look, Theme } from '../../src/look.ts';
import { BUNDLED_LOOK_NAMES, LOOKS_REPO, isWebLook, parseLook, color, isBundledLook, bundledLook, defaultLook, lookForTheme, lightLookName, lookNear, menuLookNames } from '../../src/look.ts';
import { buildScene } from '../../src/scene.ts';
import { renderBody } from '../../src/render.ts';
import { fetchWebLook } from '../../src/webassets.ts';
import { parseGitHubPlace, listGitHubLooks, webLookLabel, lookTitle } from '../../src/githublooks.ts';
import { setLook } from './ops.ts';

// null is the built-in look (no look line); any other value is what the look line says.
export type LookChoice = string | null;
export type FileLook = { path: string; look: Look } | null;
/** A look fetched from the web: its text, as the diagram's exports carry it, and the look it parses to. */
export type WebLook = { text: string; look: Look };

// a bundled look is named after its file: shade -> Shade
const label = (name: string) => name.charAt(0).toUpperCase() + name.slice(1);
export const lookLabel = (v: LookChoice, file: FileLook) => (v = lightLookName(v), v === null ? 'Built-in' : isWebLook(v) ? webLookLabel(v) : file && v === file.path ? 'This diagram’s look file' : BUNDLED_LOOK_NAMES.includes(v) ? label(v) : v);

// drawIn: the look to draw the card in (the version of `value` for the theme), when there is one
function Thumb({ src, value, look, drawIn }: { src: string; value: LookChoice; look: Look | null; drawIn?: Look | null }) {
  const view = useMemo(() => {
    const sc = drawIn ? buildScene(src, null, '', drawIn) : buildScene(setLook(src, value), look);
    return { body: renderBody(sc), box: `${sc.x} ${sc.y} ${sc.w} ${sc.h}`, paper: color(sc.look, sc.look.canvas.paper ?? 'paper') };
  }, [src, value, look, drawIn]);
  // the card around the drawing is the look's page, a dark one for a dark version
  return <svg viewBox={view.box} preserveAspectRatio="xMidYMid meet" className="lookthumb" style={{ background: view.paper }} dangerouslySetInnerHTML={{ __html: view.body }} />;
}

// Each look file is fetched once per page; a fetch that fails is forgotten so the next try asks again.
const texts = new Map<string, Promise<WebLook | null>>();
function loadWebLook(url: string): Promise<WebLook | null> {
  let p = texts.get(url);
  if (!p) {
    p = fetchWebLook(url).then((text) => (text === null ? null : { text, look: parseLook(text, url) }));
    texts.set(url, p);
    p.catch(() => texts.delete(url));
  }
  return p;
}
// what was last shown from GitHub, so closing and opening the panel keeps it
let lastQuery = '';

// dark: the look's dark version when its dark line names a file by path (fetched with it)
type Found = { name: string; url: string; got: WebLook | null; err?: string; dark?: WebLook | null };

// The look to draw a look from GitHub in for the theme: its dark version (a bundled look, or the file its dark
// line names next to it) when the theme is dark, else the look itself.
function webDrawIn(f: Found, theme: Theme): Look | null {
  const own = f.got?.look ?? null;
  const want = lookForTheme(f.url, theme, own);
  if (want === f.url || !own) return own;
  if (want === null) return defaultLook();
  return isBundledLook(want) ? bundledLook(want) : f.dark?.look ?? own;
}

function FromGitHub({ src, current, theme, onPreview, onApply, onLoaded, onShown }: {
  src: string; current: LookChoice; theme: Theme;
  onPreview: (v: LookChoice | undefined) => void; onApply: (v: LookChoice) => void; onLoaded: (url: string, w: WebLook) => void;
  onShown: (urls: string[]) => void;
}) {
  const [query, setQuery] = useState(lastQuery);
  const [state, setState] = useState<{ busy: boolean; note: string; found: Found[] }>({ busy: false, note: '', found: [] });

  const show = async (q: string) => {
    lastQuery = q;
    const place = parseGitHubPlace(q);
    if (!place) { setState({ busy: false, note: 'Type owner/repo, or paste a link to a repository on GitHub or to one .look file in it.', found: [] }); return; }
    setState({ busy: true, note: '', found: [] });
    try {
      const looks = await listGitHubLooks(place);
      if (!looks.length) { setState({ busy: false, note: `No .look files in ${place.owner}/${place.repo}${place.path ? '/' + place.path : ''}.`, found: [] }); return; }
      const found = await Promise.all(looks.map(async (l): Promise<Found> => {
        try {
          const got = await loadWebLook(l.url);
          if (got) onLoaded(l.url, got);
          // its dark version, when its dark line names a file (dark "./x-dark.look"); a look without one keeps itself
          const d = got?.look.dark;
          const darkUrl = d && !isBundledLook(d) ? lookNear(d, l.url) : null;
          const dark = darkUrl && darkUrl !== l.url ? await loadWebLook(darkUrl).catch(() => null) : null;
          if (darkUrl && dark) onLoaded(darkUrl, dark);
          return { name: l.name, url: l.url, got, dark, ...(got ? {} : { err: 'not found' }) };
        } catch (e) { return { name: l.name, url: l.url, got: null, err: (e as Error).message }; }
      }));
      const bad = found.filter((f) => !f.got).length;
      setState({ busy: false, note: bad ? `${bad} of ${found.length} could not be fetched.` : '', found });
    } catch (e) {
      setState({ busy: false, note: `Could not list the looks in ${place.owner}/${place.repo}: ${(e as Error).message}.`, found: [] });
    }
  };
  // reopening the panel shows what was there (the listing and the files are kept for the page's life)
  useEffect(() => { if (lastQuery) void show(lastQuery); }, []);

  // a look that is another listed look's dark version is shown only as that look's dark side
  const darkOfOthers = new Set(state.found.flatMap((f) => { const d = f.got?.look.dark; const u = d && !isBundledLook(d) ? lookNear(d, f.url) : null; return u && u !== f.url ? [u] : []; }));
  const ok = state.found.filter((f) => f.got && !darkOfOthers.has(f.url));
  useEffect(() => { onShown(state.found.filter((f) => f.got).map((f) => f.url)); }, [state]);
  return (
    <section className="lookgh" aria-label="Looks from GitHub">
      <h3>From GitHub</h3>
      <form onSubmit={(e) => { e.preventDefault(); void show(query); }}>
        <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="owner/repo, or a link to a .look file"
          aria-label="GitHub repository or look file" spellCheck={false} autoCapitalize="off" autoCorrect="off" />
        <button type="submit" disabled={state.busy || !query.trim()}>{state.busy ? 'Loading…' : 'Show looks'}</button>
      </form>
      {!state.found.length && !state.busy && (
        <button className="link" onClick={() => { setQuery(LOOKS_REPO); void show(LOOKS_REPO); }}>Show FastDraw’s looks ({LOOKS_REPO})</button>
      )}
      {state.note && <p className="muted">{state.note}</p>}
      {ok.length > 0 && (
        <div className="lookgrid" onPointerLeave={() => onPreview(undefined)}>
          {ok.map((f) => (
            <button key={f.url} className={'lookcard' + (f.url === current ? ' on' : '')} aria-pressed={f.url === current}
              aria-label={lookTitle(f.name) + (f.url === current ? ' (in use)' : '')} title={`look "${f.url}"`}
              onPointerEnter={() => onPreview(f.url === current ? undefined : f.url)} onClick={() => { onPreview(undefined); if (f.url !== current) onApply(f.url); }}>
              <Thumb src={src} value={f.url} look={f.got!.look} drawIn={webDrawIn(f, theme)} />
              <span>{lookTitle(f.name)}{f.url === current && <em> · in use</em>}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

// theme: the app's theme, which version of each look the cards show. fileDark: the dark version of the
// diagram's own look file, once read, for its card when the theme is dark.
export function LookPicker({ src, current: named, file, theme, fileDark, onPreview, onApply, onLoaded }: {
  src: string; current: LookChoice; file: FileLook; theme: Theme; fileDark?: Look;
  onPreview: (v: LookChoice | undefined) => void; onApply: (v: LookChoice) => void; onLoaded: (url: string, w: WebLook) => void;
}) {
  // a diagram that names a dark version (look night) is in use under its light look (Built-in)
  const current = lightLookName(named);
  // the diagram's own look, unless it is among the looks shown from GitHub below
  const [fromGitHub, setFromGitHub] = useState<string[]>([]);
  const choices: LookChoice[] = [...menuLookNames(), ...(file && !fromGitHub.includes(file.path) ? [file.path] : [])];
  const show = (v: LookChoice) => onPreview(v === current ? undefined : v);
  // each card in its look's version for the theme
  const drawIn = (v: LookChoice): Look | null => {
    const own = file && v === file.path ? file.look : null;
    const want = lookForTheme(v, theme, own);
    if (want === null) return defaultLook();
    if (isBundledLook(want)) return bundledLook(want);
    return want === v ? own : fileDark ?? own;
  };
  return (
    <div className="lookpicker" aria-label="Choose a look">
      <div className="lookgrid" onPointerLeave={() => onPreview(undefined)}>
        {choices.map((v) => (
          <button key={v ?? '(built-in)'} className={'lookcard' + (v === current ? ' on' : '')} aria-pressed={v === current} aria-label={lookLabel(v, file) + (v === current ? ' (in use)' : '')} title={v === null ? 'The built-in look' : `look ${v}`}
            onPointerEnter={() => show(v)} onClick={() => { onPreview(undefined); if (v !== current) onApply(v); }}>
            <Thumb src={src} value={v} look={file && v === file.path ? file.look : null} drawIn={drawIn(v)} />
            <span>{lookLabel(v, file)}{v === current && <em> · in use</em>}</span>
          </button>
        ))}
      </div>
      <div className="lookactions"><span className="muted">Hover a look to see it on the canvas, click to use it. Undo goes back.</span></div>
      <FromGitHub src={src} current={current} theme={theme} onPreview={onPreview} onApply={onApply} onLoaded={onLoaded} onShown={setFromGitHub} />
    </div>
  );
}
