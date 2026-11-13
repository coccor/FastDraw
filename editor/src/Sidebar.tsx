// The right sidebar: the look's components and the look picker, as two tabs. It collapses to a
// slim rail of the two tab icons; which tab is open, and whether it is collapsed, is remembered.
import React, { useState } from 'react';
import { PanelRightClose, PanelRightOpen, Palette, Shapes } from 'lucide-react';

export type SideTab = 'components' | 'look';
const KEY = 'fastdraw.sidebar';

type Saved = { tab: SideTab; collapsed: boolean };
function readSaved(): Saved {
  const fallback: Saved = { tab: 'components', collapsed: typeof window !== 'undefined' && window.innerWidth < 900 };
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (v && (v.tab === 'components' || v.tab === 'look') && typeof v.collapsed === 'boolean') return v;
  } catch { /* storage blocked or bad value: use the default */ }
  return fallback;
}

export function useSidebar() {
  const [state, setState] = useState<Saved>(readSaved);
  const set = (next: Saved) => {
    setState(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* not kept, still works */ }
  };
  return {
    ...state,
    open: (tab: SideTab) => set({ tab, collapsed: false }),
    collapse: () => set({ ...state, collapsed: true }),
  };
}

const TABS: [SideTab, string, React.ReactNode][] = [
  ['components', 'Components', <Shapes size={16} />],
  ['look', 'Look', <Palette size={16} />],
];

export function Sidebar({ side, components, look }: { side: ReturnType<typeof useSidebar>; components: React.ReactNode; look: React.ReactNode }) {
  if (side.collapsed) {
    return (
      <div className="island siderail" role="toolbar" aria-label="Sidebar" onPointerDown={(e) => e.stopPropagation()}>
        <button className="iconbtn" title="Expand sidebar" aria-label="Expand sidebar" onClick={() => side.open(side.tab)}><PanelRightOpen size={16} /></button>
        <span className="sep" />
        {TABS.map(([id, label, icon]) => (
          <button key={id} className="iconbtn" title={label} aria-label={label} onClick={() => side.open(id)}>{icon}</button>
        ))}
      </div>
    );
  }
  return (
    <aside className="island sidebar" aria-label="Sidebar" onPointerDown={(e) => e.stopPropagation()}>
      <div className="sidehead" role="tablist">
        {TABS.map(([id, label, icon]) => (
          <button key={id} role="tab" aria-selected={side.tab === id} className={side.tab === id ? 'on' : ''} onClick={() => side.open(id)}>{icon}<span>{label}</span></button>
        ))}
        <button className="iconbtn collapse" title="Collapse sidebar" aria-label="Collapse sidebar" onClick={side.collapse}><PanelRightClose size={16} /></button>
      </div>
      <div className="sidebody" role="tabpanel">{side.tab === 'components' ? components : look}</div>
    </aside>
  );
}
