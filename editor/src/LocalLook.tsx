// The look tab of the local editor, which has no look picker: it names the look the diagram uses, says how to
// change it, and leads to the editor at fastdraw.dev, which has the picker.
import React from 'react';
import { ExternalLink } from 'lucide-react';

export function LocalLook({ name, onSite }: { name: string | null; onSite: () => void }) {
  return (
    <div className="locallook">
      <p>This diagram is drawn in {name ? <code>{name}</code> : 'the built-in look'}.</p>
      <p className="muted">The local editor draws the look the file names. For another look, ask your agent to change the diagram's <code>look</code> line, or to write a look for it.</p>
      <p className="muted">The editor at fastdraw.dev has a look picker with every look that ships with FastDraw and looks from GitHub.</p>
      <button className="linkbtn" onClick={onSite}>Open this diagram on fastdraw.dev<ExternalLink size={13} /></button>
    </div>
  );
}
