// The diagram drawn in every look there is, to try one on. Hovering a look shows it on the
// canvas; clicking one applies it at once (one undo step), and the picker stays open to try more.
import React, { useMemo, useState } from 'react';
import type { Look } from '../../src/look.ts';
import { BUNDLED_LOOK_NAMES } from '../../src/look.ts';
import { buildScene } from '../../src/scene.ts';
import { renderBody } from '../../src/render.ts';
import { setLook } from './ops.ts';

// null is the built-in look (no look line); any other value is what the look line says.
export type LookChoice = string | null;
export type FileLook = { path: string; look: Look } | null;

const LABEL: Record<string, string> = { headline: 'Headline', reference: 'Reference', sketch: 'Sketch', whiteboard: 'Whiteboard' };
export const lookLabel = (v: LookChoice, file: FileLook) => (v === null ? 'Built-in' : file && v === file.path ? 'This diagram’s look file' : LABEL[v] ?? v);

function Thumb({ src, value, file }: { src: string; value: LookChoice; file: FileLook }) {
  const view = useMemo(() => {
    const sc = buildScene(setLook(src, value), file && value === file.path ? file.look : null);
    return { body: renderBody(sc), box: `${sc.x} ${sc.y} ${sc.w} ${sc.h}` };
  }, [src, value, file]);
  return <svg viewBox={view.box} preserveAspectRatio="xMidYMid meet" className="lookthumb" dangerouslySetInnerHTML={{ __html: view.body }} />;
}

export function LookPicker({ src, current, file, onPreview, onApply }: {
  src: string; current: LookChoice; file: FileLook;
  onPreview: (v: LookChoice | undefined) => void; onApply: (v: LookChoice) => void;
}) {
  const choices: LookChoice[] = [null, ...BUNDLED_LOOK_NAMES, ...(file ? [file.path] : [])];
  const show = (v: LookChoice) => onPreview(v === current ? undefined : v);
  return (
    <div className="island lookpicker" role="dialog" aria-label="Choose a look" onPointerDown={(e) => e.stopPropagation()}>
      <div className="lookgrid" onPointerLeave={() => onPreview(undefined)}>
        {choices.map((v) => (
          <button key={v ?? '(built-in)'} className={'lookcard' + (v === current ? ' on' : '')} aria-pressed={v === current} aria-label={lookLabel(v, file) + (v === current ? ' (in use)' : '')} title={v === null ? 'The built-in look' : `look ${v}`}
            onPointerEnter={() => show(v)} onClick={() => { onPreview(undefined); if (v !== current) onApply(v); }}>
            <Thumb src={src} value={v} file={file} />
            <span>{lookLabel(v, file)}{v === current && <em> · in use</em>}</span>
          </button>
        ))}
      </div>
      <div className="lookactions"><span className="muted">Hover a look to see it on the canvas, click to use it. Undo goes back.</span></div>
    </div>
  );
}
