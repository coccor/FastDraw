// Which editor Open in Editor uses, as `fastdraw open` decides it: the `fastdraw.editor` setting when it names one,
// else the answer `fastdraw open` saved on this computer, else the person is asked (once; the answer goes into the
// setting). Kept apart from extension.ts so it can be tested without VS Code.
import { savedChoice, type EditorChoice } from '../../src/editorChoice.ts';

export type { EditorChoice };

/** The choice already made, or null when the person has to be asked. */
export function knownChoice(setting: string | undefined, saved: () => EditorChoice | null = savedChoice): EditorChoice | null {
  if (setting === 'hosted' || setting === 'local') return setting;
  return saved();
}

// What the picker shows: hosted first, as the recommended one, each with what it has.
export const CHOICES: { label: string; description?: string; detail: string; choice: EditorChoice }[] = [
  {
    label: 'Hosted editor', description: 'fastdraw.dev/edit, recommended', choice: 'hosted',
    detail: 'The full icon set (about 1,600), a dark theme, a look picker with looks from GitHub, and templates. Always the newest version. The diagram is read from this computer, not uploaded.',
  },
  {
    label: 'Local editor', description: 'served from this computer', choice: 'local',
    detail: 'Works offline and sends nothing to fastdraw.dev. 24 icons in its picker, light theme only, no look picker and no templates: to change the look, ask your agent.',
  },
];
