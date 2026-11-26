// Whether a diagram is really inside its workspace folder. A .fdraw in the workspace can be a link to a file
// elsewhere; Open in editor shares only files inside the workspace, so such a diagram is not opened.
import { realpathSync } from 'node:fs';
import { sep } from 'node:path';

/** False when `file`, with every link resolved, is not inside `workspace` (also resolved). No workspace: true. */
export function insideWorkspace(file: string, workspace: string | undefined): boolean {
  if (!workspace) return true;
  try {
    const f = realpathSync(file), w = realpathSync(workspace);
    return f.startsWith(w.endsWith(sep) ? w : w + sep);
  } catch { return false; }
}
