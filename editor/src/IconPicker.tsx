import React from 'react';
import { createPortal } from 'react-dom';
import type { Look } from '../../src/look.ts';
import { isIconUri } from '../../src/iconfiles.ts';
import { iconMatches, ICONS as BUILT_IN_ICONS } from '../../src/icons.ts';
import { ICON_BOX, isBuiltIn, iconLayers } from '../../src/iconStyle.ts';
import type { IconStyle } from '../../src/iconStyle.ts';
import { useRecentIcons, rememberIcon } from './recentIcons.ts';
import { useExtendedIcons } from './useExtendedIcons.ts';

// One icon drawn small, the way the diagram draws it: a built-in icon in the style asked for (outline,
// solid, or duotone with its tint), a look's own outline, or an icon file as an image.
export function IconGlyph({ look, name, size = 22, iconStyle = 'outline' }: { look: Look; name: string; size?: number; iconStyle?: IconStyle }) {
  const img = look.images.get(name);
  if (img) return isIconUri(img) ? <img src={img} width={size} height={size} alt="" draggable={false} /> : null;
  if (isBuiltIn(look, name)) {
    const { tint, front } = iconLayers(name, iconStyle);
    return (
      <svg width={size} height={size} viewBox={`0 0 ${ICON_BOX} ${ICON_BOX}`} fill="currentColor" aria-hidden="true">
        {iconStyle === 'duotone' && tint.map((d, i) => <path key={'t' + i} d={d} opacity={0.2} />)}
        {front.map((d, i) => <path key={i} d={d} />)}
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {(look.icons.get(name) ?? []).map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

// Every icon the look has, as tiles to click, with a search box, in three tabs: Outline (the look's folder
// and own icons first, then the built-in ones), Solid and Duotone (the built-in icons, which have both).
export function IconPicker({ look, value, iconStyle, onPick, autoFocus = false }: { look: Look; value: string | undefined; iconStyle: IconStyle; onPick: (name: string | null, style: IconStyle) => void; autoFocus?: boolean }) {
  const [q, setQ] = React.useState('');
  // open on the tab of the chosen icon; with none chosen, on outline
  const [tab, setTab] = React.useState<IconStyle>(iconStyle);
  React.useEffect(() => { if (value) setTab(iconStyle); }, [value, iconStyle]);
  const match = (n: string) => iconMatches(n, q);
  const plain = tab === 'outline';
  const folder = plain ? [...look.images.keys()].filter(match) : [];
  // a name that is the search word, then one that starts with it, then one that has it inside, and last the icons
  // that only have it among their search words; alphabetical within each
  const word = q.trim().toLowerCase().replace(/\s+/g, '-');
  const rank = (n: string) => (!word || n === word ? 0 : n.startsWith(word) ? 1 : n.includes(word) ? 2 : 3);
  const builtIn = [...look.icons.keys()].filter((n) => !look.images.has(n) && (plain || isBuiltIn(look, n))).filter(match).sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : 1));
  const first = folder[0] ?? builtIn[0];
  const on = (n: string) => value === n && iconStyle === tab;
  // keep the chosen icon in sight when the panel opens on a box that has one
  const grid = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const g = grid.current, el = g?.querySelector<HTMLElement>('.icontile.on');
    if (g && el) g.scrollTop = el.offsetTop - g.offsetTop - g.clientHeight / 2 + el.clientHeight / 2;
  }, [value, tab]);
  const tile = (n: string) => (
    <button key={n} type="button" className={'icontile' + (on(n) ? ' on' : '')} title={on(n) ? `${n} (click again to remove)` : n} role="radio" aria-label={n} aria-checked={on(n)} onClick={() => onPick(on(n) ? null : n, tab)}>
      <IconGlyph look={look} name={n} iconStyle={tab} />
    </button>
  );
  const count = plain ? new Set([...look.images.keys(), ...look.icons.keys()]).size : builtIn.length;
  return (
    <div className="iconpicker">
      <div className="seg icontabs" role="tablist" aria-label="Icon set">
        {([['outline', 'Outline'], ['solid', 'Solid'], ['duotone', 'Duotone']] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      <div className="iconsearch">
        <input type="search" autoFocus={autoFocus} aria-label="Search icons" placeholder="Search icons" title={`${count} icons; search by name or meaning`} value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && first) onPick(first, tab);
            if (e.key === 'Escape' && q) { e.stopPropagation(); setQ(''); }
          }} />
      </div>
      <div className="icongrid" ref={grid} role="radiogroup" aria-label={tab === 'solid' ? 'Solid icons' : tab === 'duotone' ? 'Duotone icons' : 'Icons'}>
        {folder.length > 0 && <div className="iconhead">From the look's folder</div>}
        {folder.map(tile)}
        {folder.length > 0 && builtIn.length > 0 && <div className="iconhead">Built in</div>}
        {builtIn.map(tile)}
        {!folder.length && !builtIn.length && <p className="muted small">No icon is called anything like “{q.trim()}”.</p>}
      </div>
    </div>
  );
}

// The icon row in the sidebar: the chosen icon and its name, and a button that opens every icon in a dialog
// with search. The full grid is too long for the sidebar, so it only lives in the dialog.
// Under it, the last few icons chosen (here or with the Icon tool), to pick again with one click.
export function IconField({ look, value, iconStyle, onPick }: { look: Look; value: string | undefined; iconStyle: IconStyle; onPick: (name: string | null, style: IconStyle) => void }) {
  const [open, setOpen] = React.useState(false);
  const remembered = useRecentIcons();
  useExtendedIcons(remembered.some((r) => !BUILT_IN_ICONS[r.name])); // a recent icon from the rest of Phosphor needs them
  const recent = remembered.filter((r) => look.icons.has(r.name) || look.images.has(r.name));
  const name = value && value !== 'none' ? value : undefined;
  const choose = (n: string | null, s: IconStyle) => { if (n) rememberIcon({ name: n, style: s }); onPick(n, s); };
  return (
    <div className="iconbox">
      <div className="iconfield">
        <button type="button" className="iconchoose" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
          <span className="iconpreview">{name ? <IconGlyph look={look} name={name} iconStyle={iconStyle} /> : null}</span>
          <span className="iconname">{name ?? 'No icon'}</span>
          <span className="iconopen">Choose…</span>
        </button>
        {name && <button type="button" className="iconclear" aria-label="Remove icon" title="Remove icon" onClick={() => onPick(null, iconStyle)}>×</button>}
        {open && createPortal(<IconDialog look={look} value={value} iconStyle={iconStyle} onClose={() => setOpen(false)} onPick={(n, s) => { choose(n, s); setOpen(false); }} />, document.body)}
      </div>
      {recent.length > 0 && (
        <div className="iconrecent" role="group" aria-label="Recent icons">
          {recent.map((r) => {
            const on = value === r.name && iconStyle === r.style;
            return (
              <button key={r.name} type="button" className={'icontile' + (on ? ' on' : '')} title={r.name} aria-label={`Recent icon ${r.name}`} aria-pressed={on} onClick={() => choose(r.name, r.style)}>
                <IconGlyph look={look} name={r.name} iconStyle={r.style} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Every icon of the look in a dialog, with search: picking one applies it and closes the dialog.
export function IconDialog({ look, value, iconStyle, onPick, onClose }: { look: Look; value: string | undefined; iconStyle: IconStyle; onPick: (name: string | null, style: IconStyle) => void; onClose: () => void }) {
  const ready = useExtendedIcons(true); // opening the dialog is what asks for every icon
  return (
    <div className="modal" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card icondialog" role="dialog" aria-label="Choose an icon" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
        <div className="icondialoghead">
          <div>
            <h3>Choose an icon</h3>
            <p className="muted small">{ready ? 'Search by name or meaning, then click one. Click the chosen icon again to remove it.' : 'Loading the rest of the icons…'}</p>
          </div>
          <button type="button" className="iconclose" aria-label="Close" title="Close" onClick={onClose}>×</button>
        </div>
        <IconPicker look={look} value={value} iconStyle={iconStyle} onPick={onPick} autoFocus />
      </div>
    </div>
  );
}
