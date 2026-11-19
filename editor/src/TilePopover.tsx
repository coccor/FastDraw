import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type TileChoice = { key: string; label: string; about: string };

// Every choice of a picker (page patterns, line ends) in a popover beside the menu or panel it was opened from, laid out
// as the colour popover is: a grid of tiles under a heading per group, each with its key when `keys` gives one
// (q w e r t / a s ...). Below them, the name of the tile under the pointer, else the chosen one, and what it is for.
// It stays open while choices are tried; Escape or a click outside closes it.
export function TilePopover({ anchor, label, groups, current, tile, keys = '', className = 'pattern', cards = false, info = true, onPick, onClose }: {
  anchor: HTMLElement; label: string; groups: { title: string; choices: TileChoice[] }[]; current: string;
  tile: (key: string) => React.ReactNode; keys?: string; className?: string; cards?: boolean; // cards: two wide tiles a row
  info?: boolean; // false leaves out the name and use of the tile under the pointer
  onPick: (key: string) => void; onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  const all = groups.flatMap((g) => g.choices);
  const shown = all.find((p) => p.key === (hover ?? current));
  const [pos, setPos] = useState({ left: 0, top: 0 });
  useLayoutEffect(() => {
    const a = anchor.getBoundingClientRect(), side = (anchor.closest('.panel, .dropdown') ?? anchor).getBoundingClientRect();
    const w = box.current!.offsetWidth, h = box.current!.offsetHeight;
    const left = side.right + 8 + w <= innerWidth - 8 ? side.right + 8 : Math.max(8, side.left - 8 - w);
    setPos({ left, top: Math.min(Math.max(8, a.top - 12), innerHeight - h - 8) });
  }, [anchor]);
  useEffect(() => { box.current?.focus(); }, []);
  useEffect(() => {
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose(); };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [anchor, onClose]);
  const press = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') { onClose(); anchor.focus(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    const i = keys.indexOf(e.key.toLowerCase());
    if (i >= 0 && all[i]) { e.preventDefault(); onPick(all[i]!.key); }
  };
  let n = 0; // the tile's place among all the groups', for its key
  return createPortal(
    <div ref={box} tabIndex={-1} className={'colorpop island' + (cards ? ' cards' : '')} role="dialog" aria-label={label} style={pos}
      onPointerDown={(e) => e.stopPropagation()} onKeyDown={press}>
      {groups.map((g) => (
        <section key={g.title}>
          <h5>{g.title}</h5>
          <div className="pgrid" role="radiogroup" aria-label={groups.length > 1 ? g.title : label}>
            {g.choices.map((p) => {
              const key = keys[n++];
              return (
                <button key={p.key} type="button" role="radio" aria-checked={current === p.key} aria-label={p.label}
                  title={key ? `${p.label} (${key.toUpperCase()})` : p.label}
                  className={`pswatch ${className}` + (current === p.key ? ' on' : '')} onClick={() => onPick(p.key)}
                  onPointerEnter={() => setHover(p.key)} onPointerLeave={() => setHover(null)}>
                  {tile(p.key)}
                  {key && <kbd>{key}</kbd>}
                </button>
              );
            })}
          </div>
        </section>
      ))}
      {info && shown && (
        <section className="patterninfo" aria-live="polite">
          <h5>{shown.label}</h5>
          <p>{shown.about}</p>
        </section>
      )}
    </div>,
    document.body,
  );
}
