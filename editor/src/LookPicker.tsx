// The diagram drawn in every look there is, to try one on. Hovering a look shows it on the
// canvas; clicking one applies it at once (one undo step), and the picker stays open to try more.
// Under them, looks from a GitHub repository: type owner/repo (or paste a link) and its .look files are
// fetched and drawn the same way; choosing one names it in the diagram by its address.
import React, { useEffect, useMemo, useState } from 'react';
import type { Look } from '../../src/look.ts';
import { BUNDLED_LOOK_NAMES, LOOKS_REPO, isWebLook, parseLook } from '../../src/look.ts';
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
export const lookLabel = (v: LookChoice, file: FileLook) => (v === null ? 'Built-in' : isWebLook(v) ? webLookLabel(v) : file && v === file.path ? 'This diagram’s look file' : BUNDLED_LOOK_NAMES.includes(v) ? label(v) : v);

function Thumb({ src, value, look }: { src: string; value: LookChoice; look: Look | null }) {
  const view = useMemo(() => {
    const sc = buildScene(setLook(src, value), look);
    return { body: renderBody(sc), box: `${sc.x} ${sc.y} ${sc.w} ${sc.h}` };
  }, [src, value, look]);
  return <svg viewBox={view.box} preserveAspectRatio="xMidYMid meet" className="lookthumb" dangerouslySetInnerHTML={{ __html: view.body }} />;
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

type Found = { name: string; url: string; got: WebLook | null; err?: string };

function FromGitHub({ src, current, onPreview, onApply, onLoaded, onShown }: {
  src: string; current: LookChoice;
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
          return { name: l.name, url: l.url, got, ...(got ? {} : { err: 'not found' }) };
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

  const ok = state.found.filter((f) => f.got);
  useEffect(() => { onShown(ok.map((f) => f.url)); }, [state]);
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
              <Thumb src={src} value={f.url} look={f.got!.look} />
              <span>{lookTitle(f.name)}{f.url === current && <em> · in use</em>}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export function LookPicker({ src, current, file, onPreview, onApply, onLoaded }: {
  src: string; current: LookChoice; file: FileLook;
  onPreview: (v: LookChoice | undefined) => void; onApply: (v: LookChoice) => void; onLoaded: (url: string, w: WebLook) => void;
}) {
  // the diagram's own look, unless it is among the looks shown from GitHub below
  const [fromGitHub, setFromGitHub] = useState<string[]>([]);
  const choices: LookChoice[] = [null, ...BUNDLED_LOOK_NAMES, ...(file && !fromGitHub.includes(file.path) ? [file.path] : [])];
  const show = (v: LookChoice) => onPreview(v === current ? undefined : v);
  return (
    <div className="lookpicker" aria-label="Choose a look">
      <div className="lookgrid" onPointerLeave={() => onPreview(undefined)}>
        {choices.map((v) => (
          <button key={v ?? '(built-in)'} className={'lookcard' + (v === current ? ' on' : '')} aria-pressed={v === current} aria-label={lookLabel(v, file) + (v === current ? ' (in use)' : '')} title={v === null ? 'The built-in look' : `look ${v}`}
            onPointerEnter={() => show(v)} onClick={() => { onPreview(undefined); if (v !== current) onApply(v); }}>
            <Thumb src={src} value={v} look={file && v === file.path ? file.look : null} />
            <span>{lookLabel(v, file)}{v === current && <em> · in use</em>}</span>
          </button>
        ))}
      </div>
      <div className="lookactions"><span className="muted">Hover a look to see it on the canvas, click to use it. Undo goes back.</span></div>
      <FromGitHub src={src} current={current} onPreview={onPreview} onApply={onApply} onLoaded={onLoaded} onShown={setFromGitHub} />
    </div>
  );
}
