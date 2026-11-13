import React from 'react';
import type { Look } from '../../src/look.ts';
import { isIconUri } from '../../src/iconfiles.ts';
import { iconMatches } from '../../src/icons.ts';

// One icon drawn small, the way the diagram draws it: a look's outline in the current colour, or an icon file as an image.
export function IconGlyph({ look, name, size = 22 }: { look: Look; name: string; size?: number }) {
  const img = look.images.get(name);
  if (img) return isIconUri(img) ? <img src={img} width={size} height={size} alt="" draggable={false} /> : null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {(look.icons.get(name) ?? []).map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

// Every icon the look has, as tiles to click, with a search box. The look's folder icons come first.
export function IconPicker({ look, value, onPick }: { look: Look; value: string | undefined; onPick: (name: string | null) => void }) {
  const [q, setQ] = React.useState('');
  const match = (n: string) => iconMatches(n, q);
  const folder = [...look.images.keys()].filter(match);
  const builtIn = [...look.icons.keys()].filter((n) => !look.images.has(n)).filter(match).sort();
  const first = folder[0] ?? builtIn[0];
  // keep the chosen icon in sight when the panel opens on a box that has one
  const grid = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const g = grid.current, on = g?.querySelector<HTMLElement>('.icontile.on');
    if (g && on) g.scrollTop = on.offsetTop - g.offsetTop - g.clientHeight / 2 + on.clientHeight / 2;
  }, [value]);
  const tile = (n: string) => (
    <button key={n} type="button" className={'icontile' + (value === n ? ' on' : '')} title={value === n ? `${n} (click again to remove)` : n} role="radio" aria-label={n} aria-checked={value === n} onClick={() => onPick(value === n ? null : n)}>
      <IconGlyph look={look} name={n} />
    </button>
  );
  return (
    <div className="iconpicker">
      <div className="iconsearch">
        <input type="search" aria-label="Search icons" placeholder="Search icons" title={`${new Set([...look.images.keys(), ...look.icons.keys()]).size} icons; search by name or meaning`} value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && first) onPick(first);
            if (e.key === 'Escape' && q) { e.stopPropagation(); setQ(''); }
          }} />
      </div>
      <div className="icongrid" ref={grid} role="radiogroup" aria-label="Icons">
        {folder.length > 0 && <div className="iconhead">From the look's folder</div>}
        {folder.map(tile)}
        {folder.length > 0 && builtIn.length > 0 && <div className="iconhead">Built in</div>}
        {builtIn.map(tile)}
        {!folder.length && !builtIn.length && <p className="muted small">No icon is called anything like “{q.trim()}”.</p>}
      </div>
    </div>
  );
}
