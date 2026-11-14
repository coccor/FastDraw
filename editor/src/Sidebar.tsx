// The right sidebar: the look's components and the look picker, as two tabs. Collapsed, it is a
// slim rail. Picking Components or Look on the rail opens it for a moment: a click on the canvas
// (or Esc) folds it back. Only the open-sidebar button keeps it open, and that is remembered.
import React, { useState } from 'react';
import { Pin, PanelRightClose, PanelRightOpen, Palette, Shapes } from 'lucide-react';

export type SideTab = 'components' | 'look';
type Mode = 'closed' | 'peek' | 'pinned';
const KEY = 'fastdraw.sidebar';

function readSaved(): { tab: SideTab; mode: Mode } {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (v && (v.tab === 'components' || v.tab === 'look')) return { tab: v.tab, mode: v.pinned === true ? 'pinned' : 'closed' };
  } catch { /* storage blocked or bad value: use the default */ }
  return { tab: 'components', mode: 'closed' };
}

export function useSidebar() {
  const [state, setState] = useState(readSaved);
  const set = (tab: SideTab, mode: Mode) => {
    setState({ tab, mode });
    try { localStorage.setItem(KEY, JSON.stringify({ tab, pinned: mode === 'pinned' })); } catch { /* not kept, still works */ }
  };
  return {
    tab: state.tab,
    collapsed: state.mode === 'closed',
    pinned: state.mode === 'pinned',
    /** show a tab; a closed sidebar opens for a moment, an open one stays as it is */
    show: (tab: SideTab) => set(tab, state.mode === 'closed' ? 'peek' : state.mode),
    pin: () => set(state.tab, 'pinned'),
    collapse: () => set(state.tab, 'closed'),
    /** a click elsewhere: folds a sidebar that was only opened for a moment */
    dismiss: () => { if (state.mode === 'peek') set(state.tab, 'closed'); },
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
        <button className="iconbtn" title="Open sidebar" aria-label="Open sidebar" onClick={side.pin}><PanelRightOpen size={16} /></button>
        <span className="sep" />
        {TABS.map(([id, label, icon]) => (
          <button key={id} className="iconbtn" title={label} aria-label={label} onClick={() => side.show(id)}>{icon}</button>
        ))}
      </div>
    );
  }
  return (
    <aside className={'island sidebar' + (side.pinned ? '' : ' peek')} aria-label="Sidebar" onPointerDown={(e) => e.stopPropagation()}>
      <div className="sidehead" role="tablist">
        {TABS.map(([id, label, icon]) => (
          <button key={id} role="tab" aria-selected={side.tab === id} className={side.tab === id ? 'on' : ''} onClick={() => side.show(id)}>{icon}<span>{label}</span></button>
        ))}
        <span className="sideacts">
          {!side.pinned && <button className="iconbtn" title="Keep sidebar open" aria-label="Keep sidebar open" onClick={side.pin}><Pin size={15} /></button>}
          <button className="iconbtn" title="Collapse sidebar" aria-label="Collapse sidebar" onClick={side.collapse}><PanelRightClose size={16} /></button>
        </span>
      </div>
      <div className="sidebody" role="tabpanel">{side.tab === 'components' ? components : look}</div>
    </aside>
  );
}
