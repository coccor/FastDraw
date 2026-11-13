// Picking a template for a new diagram: every kind drawn small, with what it is for.
import React, { useMemo, useState } from 'react';
import { buildScene } from '../../src/scene.ts';
import { renderBody } from '../../src/render.ts';
import { TEMPLATES, type Template } from './templates.ts';

function Preview({ t }: { t: Template }) {
  const view = useMemo(() => {
    const sc = buildScene(t.text, null);
    return { body: renderBody(sc), x: sc.x, y: sc.y, w: sc.w, h: sc.h };
  }, [t]);
  return <svg viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} preserveAspectRatio="xMidYMid meet" className="tplthumb" aria-hidden="true" dangerouslySetInnerHTML={{ __html: view.body }} />;
}

export function TemplateDialog({ onClose, onPick }: { onClose: () => void; onPick: (t: Template) => void }) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return TEMPLATES.filter((t) => words.every((w) => (t.title + ' ' + t.about + ' ' + t.kind).toLowerCase().includes(w)));
  }, [q]);
  return (
    <div className="modal" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card tplcard" role="dialog" aria-label="New from a template">
        <div className="tplhead">
          <div>
            <h3>New from a template</h3>
            <p className="muted">Each one is a finished example in the built-in look. Change the words and numbers, move things, delete what you do not need.</p>
          </div>
          <input autoFocus type="search" placeholder="Search: flow, chart, team…" value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') onClose(); if (e.key === 'Enter' && shown.length) onPick(shown[0]); }} />
        </div>
        <div className="tplgrid">
          {shown.map((t) => (
            <button key={t.kind} className="tpl" onClick={() => onPick(t)} title={t.about}>
              <Preview t={t} />
              <b>{t.title}</b>
              <span>{t.about}</span>
            </button>
          ))}
          {!shown.length && <p className="muted">No template matches “{q}”.</p>}
        </div>
        <div className="startbtns"><button onClick={onClose}>Cancel</button></div>
      </div>
    </div>
  );
}
