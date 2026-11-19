import { useEffect, useMemo, useRef, useState } from 'react';
import { useEscape } from './useEscape.ts';
import type { Scene } from '../../src/scene.ts';
import { renderSvg } from '../../src/render.ts';
import { embedSvg, embedPng, type Payload } from '../../src/embed.ts';
import { fontCss } from './fonts.ts';
import * as files from './files.ts';
import { Copy, Download } from 'lucide-react';

export type ExportOpts = { format: 'png' | 'svg'; scale: number; background: boolean; embed: boolean };
const DEFAULTS: ExportOpts = { format: 'png', scale: 2, background: true, embed: true };
const SCALES = [1, 2, 3, 4];
const KEY = 'fastdraw.export';

// The last choices, kept per browser so the next export starts where this one left off.
function remembered(): ExportOpts {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return {
      format: o.format === 'svg' ? 'svg' : 'png',
      scale: SCALES.includes(o.scale) ? o.scale : DEFAULTS.scale,
      background: typeof o.background === 'boolean' ? o.background : DEFAULTS.background,
      embed: typeof o.embed === 'boolean' ? o.embed : DEFAULTS.embed,
    };
  } catch { return DEFAULTS; }
}

// The exported file as a blob: SVG text, or a PNG drawn from it at `scale`.
export async function exportBlob(scene: Scene, payload: Payload, o: ExportOpts): Promise<Blob> {
  const opts = { background: o.background };
  const svg = renderSvg(scene, await fontCss(renderSvg(scene, undefined, opts)), opts);
  if (o.format === 'svg') return new Blob([o.embed ? embedSvg(svg, payload) : svg], { type: 'image/svg+xml' });
  const img = new Image();
  await new Promise<void>((ok, fail) => { img.onload = () => ok(); img.onerror = () => fail(new Error('the diagram could not be drawn')); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
  const c = document.createElement('canvas');
  c.width = Math.round(scene.w * o.scale); c.height = Math.round(scene.h * o.scale);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  const b = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/png'));
  if (!b) throw new Error('the image is too large for this browser; try a smaller scale');
  const png = new Uint8Array(await b.arrayBuffer());
  return new Blob([(o.embed ? embedPng(png, payload) : png).buffer as ArrayBuffer], { type: 'image/png' });
}

export function ExportDialog({ scene, payload, base, onClose, onDone }: {
  scene: Scene; payload: Payload; base: string; onClose: () => void; onDone: (msg: string) => void;
}) {
  const [o, setO] = useState<ExportOpts>(remembered);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (p: Partial<ExportOpts>) => setO((cur) => { const n = { ...cur, ...p }; try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* private window */ } return n; });
  const preview = useMemo(() => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(renderSvg(scene, undefined, { background: o.background })), [scene, o.background]);
  useEscape(onClose);
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => card.current?.focus(), []); // keys go to the dialog, not to the canvas behind it

  const size = o.format === 'png' ? `${Math.round(scene.w * o.scale)} × ${Math.round(scene.h * o.scale)} px` : `${scene.w} × ${scene.h}, scales freely`;
  const fileName = `${base}.${o.format}`;
  const canCopy = o.format === 'svg' ? !!navigator.clipboard?.writeText : typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write;

  const run = async (to: 'file' | 'clipboard') => {
    setBusy(true); setErr('');
    try {
      if (to === 'file') {
        files.download(fileName, await exportBlob(scene, payload, o));
        onDone(`exported ${fileName}`);
      } else if (o.format === 'svg') {
        await navigator.clipboard.writeText(await (await exportBlob(scene, payload, o)).text());
        onDone('copied the SVG to the clipboard');
      } else {
        // the blob is handed over as a promise so Safari keeps the click's permission while it is drawn
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': exportBlob(scene, payload, o) })]);
        onDone('copied the image to the clipboard');
      }
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  return (
    <div className="modal" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card exportcard" role="dialog" aria-label="Export image" tabIndex={-1} ref={card}>
        <h3>Export image</h3>
        <div className={'exportpreview' + (o.background ? '' : ' checker')}><img src={preview} alt="Preview of the exported image" /></div>
        <div className="exportopts">
          <span>Format</span>
          <div className="seg" role="group" aria-label="Format">
            <button className={o.format === 'png' ? 'on' : ''} aria-pressed={o.format === 'png'} onClick={() => set({ format: 'png' })}>PNG</button>
            <button className={o.format === 'svg' ? 'on' : ''} aria-pressed={o.format === 'svg'} onClick={() => set({ format: 'svg' })}>SVG</button>
          </div>
          <span>Scale</span>
          <div className="seg" role="group" aria-label="Scale">
            {SCALES.map((s) => <button key={s} disabled={o.format === 'svg'} className={o.format === 'png' && o.scale === s ? 'on' : ''} aria-pressed={o.format === 'png' && o.scale === s} onClick={() => set({ scale: s })}>{s}×</button>)}
          </div>
          <span>Background</span>
          <label className="check"><input type="checkbox" checked={o.background} onChange={(e) => set({ background: e.target.checked })} />Page colour and dots; off leaves it see-through</label>
          <span>Diagram inside</span>
          <label className="check"><input type="checkbox" checked={o.embed} onChange={(e) => set({ embed: e.target.checked })} />Carry the diagram, so the image opens again for editing</label>
        </div>
        <p className="muted exportsize">{fileName} · {size}</p>
        {err && <p className="exporterr">{err}</p>}
        <div className="startbtns">
          <button className="primary" disabled={busy} onClick={() => run('file')}><Download size={16} />Download</button>
          {canCopy && <button disabled={busy} onClick={() => run('clipboard')}><Copy size={16} />Copy to clipboard</button>}
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
