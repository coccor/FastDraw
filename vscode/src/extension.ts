// FastDraw for VS Code: a live preview of .fdraw files, the checker's problems in the Problems panel, and a
// button that opens the diagram in the FastDraw web editor, as `fastdraw open` does.
import * as vscode from 'vscode';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { draw, problems, fetchAssets, fontFaces } from './core.ts';
import { bundledFonts } from '../../src/node.ts';
import { serveFolder, DEFAULT_EDITOR, type Served } from '../../src/serve.ts';
import type { Issue } from '../../src/look.ts';

const VIEW = 'fastdraw.preview';
const isDiagram = (d: vscode.TextDocument) => d.languageId === 'fastdraw';
// loadScene finds the look next to the file; an unsaved new file is read as if it sat in the first folder
const pathOf = (d: vscode.TextDocument) =>
  d.uri.scheme === 'file' ? d.uri.fsPath : resolve(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd(), 'untitled.fdraw');

// ---- Problems ------------------------------------------------------------------------------------------

const SEVERITY = { error: vscode.DiagnosticSeverity.Error, warn: vscode.DiagnosticSeverity.Warning, hint: vscode.DiagnosticSeverity.Information };

// A problem in the look the diagram uses goes on the look file when it is one on this computer; otherwise (a
// bundled or web look) it goes on the diagram's look line, saying where it is.
function toDiagnostics(doc: vscode.TextDocument, issues: Issue[]): Map<string, { uri: vscode.Uri; list: vscode.Diagnostic[] }> {
  const out = new Map<string, { uri: vscode.Uri; list: vscode.Diagnostic[] }>();
  const add = (uri: vscode.Uri, d: vscode.Diagnostic) => {
    const e = out.get(uri.toString()) ?? { uri, list: [] };
    e.list.push(d);
    out.set(uri.toString(), e);
  };
  const lineRange = (n: number) => (n >= 0 && n < doc.lineCount ? doc.lineAt(n).range : new vscode.Range(0, 0, 0, 0));
  const lookLine = () => { for (let n = 0; n < doc.lineCount; n++) if (/^\s*look\b/.test(doc.lineAt(n).text)) return n; return 0; };
  const file = pathOf(doc);
  for (const i of issues) {
    let uri = doc.uri, range = lineRange(Math.max(0, i.line - 1)), msg = i.msg;
    if (i.file && resolve(dirname(file), i.file) !== file) {
      const f = isAbsolute(i.file) ? i.file : resolve(dirname(file), i.file);
      if (/\.look$/i.test(f) && existsSync(f)) {
        uri = vscode.Uri.file(f);
        range = new vscode.Range(Math.max(0, i.line - 1), 0, Math.max(0, i.line - 1), 1000);
      } else {
        range = lineRange(lookLine());
        msg = `in the look ${i.file}${i.line ? `, line ${i.line}` : ''}: ${i.msg}`;
      }
    }
    const d = new vscode.Diagnostic(range, msg, SEVERITY[i.level]);
    d.source = 'fastdraw';
    add(uri, d);
  }
  return out;
}

class Problems implements vscode.Disposable {
  readonly coll = vscode.languages.createDiagnosticCollection('fastdraw');
  // what each diagram last put on other files (its look), to clear when it changes
  private owned = new Map<string, string[]>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  counts = new Map<string, { errors: number; warns: number }>();
  onChange = new vscode.EventEmitter<vscode.Uri>();

  lint(doc: vscode.TextDocument) {
    if (!isDiagram(doc)) return;
    const key = doc.uri.toString();
    let issues: Issue[];
    try { issues = problems(pathOf(doc), doc.getText()); }
    catch (e) { issues = [{ line: 0, level: 'error', msg: `fastdraw could not check this file: ${e instanceof Error ? e.message : e}` }]; }
    for (const u of this.owned.get(key) ?? []) if (u !== key) this.coll.delete(vscode.Uri.parse(u));
    const by = toDiagnostics(doc, issues);
    if (!by.has(key)) this.coll.set(doc.uri, []);
    for (const { uri, list } of by.values()) this.coll.set(uri, list);
    this.owned.set(key, [...by.keys()]);
    this.counts.set(key, { errors: issues.filter((i) => i.level === 'error').length, warns: issues.filter((i) => i.level === 'warn').length });
    this.onChange.fire(doc.uri);
  }

  later(doc: vscode.TextDocument, ms = 300) {
    const key = doc.uri.toString();
    clearTimeout(this.timers.get(key));
    this.timers.set(key, setTimeout(() => { this.timers.delete(key); this.lint(doc); }, ms));
  }

  forget(doc: vscode.TextDocument) {
    const key = doc.uri.toString();
    clearTimeout(this.timers.get(key));
    for (const u of this.owned.get(key) ?? [key]) this.coll.delete(vscode.Uri.parse(u));
    this.owned.delete(key);
    this.counts.delete(key);
  }

  dispose() { for (const t of this.timers.values()) clearTimeout(t); this.coll.dispose(); this.onChange.dispose(); }
}

// ---- The web editor ------------------------------------------------------------------------------------

// One small server per folder, kept while VS Code runs: the web editor reads and writes the files through it.
const served = new Map<string, Promise<Served>>();

async function openInEditor(doc: vscode.TextDocument) {
  if (doc.uri.scheme !== 'file') { vscode.window.showWarningMessage('Save the diagram to a file first; the FastDraw editor works on files.'); return; }
  // the editor reads the file from disk, so it has to see what is on screen
  if (doc.isDirty && !(await doc.save())) return;
  const folder = dirname(doc.uri.fsPath);
  const editor = vscode.workspace.getConfiguration('fastdraw').get<string>('editorUrl') || DEFAULT_EDITOR;
  const key = `${editor} ${folder}`;
  let s = served.get(key);
  if (!s) { s = serveFolder(folder, { editor }); served.set(key, s); s.catch(() => served.delete(key)); }
  try {
    // the server's link names no file; each diagram in the folder is opened through the same server
    const url = new URL((await s).url);
    url.searchParams.set('open', basename(doc.uri.fsPath));
    await vscode.env.openExternal(vscode.Uri.parse(url.href));
  } catch (e) {
    vscode.window.showErrorMessage(`FastDraw could not serve ${folder} to the editor: ${e instanceof Error ? e.message : e}`);
  }
}

// ---- Preview -------------------------------------------------------------------------------------------

const wantsDark = () => {
  const t = vscode.workspace.getConfiguration('fastdraw').get<string>('preview.theme', 'auto');
  if (t !== 'auto') return t === 'dark';
  const k = vscode.window.activeColorTheme.kind;
  return k === vscode.ColorThemeKind.Dark || k === vscode.ColorThemeKind.HighContrast;
};

class Preview implements vscode.Disposable {
  private timer?: ReturnType<typeof setTimeout>;
  private fetched = false;
  // font rules: the bundled fonts' once per panel, the look's again only when its files change
  private bundledFaces?: string;
  private lookFaces = { key: '', css: '' };
  private subs: vscode.Disposable[] = [];
  readonly onDispose = new vscode.EventEmitter<void>();

  constructor(readonly panel: vscode.WebviewPanel, public doc: vscode.TextDocument, private ext: vscode.ExtensionContext, private probs: Problems) {
    const media = vscode.Uri.joinPath(ext.extensionUri, 'media');
    panel.webview.options = { enableScripts: true, localResourceRoots: [media, vscode.Uri.joinPath(ext.extensionUri, 'fonts')] };
    panel.iconPath = vscode.Uri.joinPath(media, 'icon.svg');
    panel.webview.html = this.html();
    this.title();
    this.subs.push(
      panel.webview.onDidReceiveMessage((m) => this.message(m)),
      panel.onDidDispose(() => this.dispose()),
    );
  }

  private title() { this.panel.title = `Preview ${basename(this.doc.uri.path)}`; }

  refresh(ms = 150) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.drawNow(), ms);
  }

  // web icons and fonts once per preview, and again when the look changes
  refetch() { this.fetched = false; this.lookFaces = { key: '', css: '' }; this.refresh(0); }

  private async drawNow() {
    const file = pathOf(this.doc), wv = this.panel.webview;
    let notes: string[] = [];
    if (!this.fetched) { this.fetched = true; try { notes = await fetchAssets(file); } catch { /* drawn with built-in icons */ } }
    try {
      const d = draw(file, this.doc.getText(), { dark: wantsDark() });
      this.bundledFaces ??= fontFaces(bundledFonts(), (f) => wv.asWebviewUri(vscode.Uri.file(f)).toString());
      const key = d.fontFiles.join('\n');
      if (key !== this.lookFaces.key) this.lookFaces = { key, css: fontFaces(d.fontFiles, (f) => `data:font/${/\.otf$/i.test(f) ? 'otf' : 'ttf'};base64,${readFileSync(f).toString('base64')}`) };
      const faces = this.bundledFaces + '\n' + this.lookFaces.css;
      const counts = this.probs.counts.get(this.doc.uri.toString()) ?? { errors: 0, warns: 0 };
      const note = [...notes, d.note && `Drawn in the light look: ${d.note}`].filter(Boolean).join(' · ');
      wv.postMessage({ type: 'draw', uri: this.doc.uri.toString(), svg: d.svg, hits: d.hits, faces, problems: counts, note, dark: d.dark });
    } catch (e) {
      wv.postMessage({ type: 'failed', message: `Could not draw this diagram: ${e instanceof Error ? e.message : e}` });
    }
  }

  cursor(line: number) { this.panel.webview.postMessage({ type: 'cursor', line }); }

  counts() { this.panel.webview.postMessage({ type: 'problems', ...(this.probs.counts.get(this.doc.uri.toString()) ?? { errors: 0, warns: 0 }) }); }

  private async message(m: { type: string; line?: number }) {
    if (m.type === 'ready') this.refresh(0);
    else if (m.type === 'reveal' && m.line) await reveal(this.doc, m.line, this.panel.viewColumn);
    else if (m.type === 'openEditor') await openInEditor(this.doc);
    else if (m.type === 'problems') await vscode.commands.executeCommand('workbench.actions.view.problems');
  }

  private html(): string {
    const wv = this.panel.webview, nonce = randomBytes(16).toString('base64');
    const media = (f: string) => wv.asWebviewUri(vscode.Uri.joinPath(this.ext.extensionUri, 'media', f));
    // the SVG carries a style element of its own, and look fonts arrive as data: addresses
    const csp = `default-src 'none'; img-src ${wv.cspSource} data:; font-src ${wv.cspSource} data:; style-src ${wv.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';`;
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${media('preview.css')}">
<style id="faces"></style>
</head><body>
<div class="bar" role="toolbar" aria-label="Preview">
  <button id="out" title="Zoom out" aria-label="Zoom out">−</button>
  <button id="zoom" title="Actual size">100%</button>
  <button id="in" title="Zoom in" aria-label="Zoom in">+</button>
  <button id="fit" title="Fit the diagram in the view">Fit</button>
  <span id="note" hidden></span>
  <span class="sep"></span>
  <button id="problems" hidden title="Show the Problems panel"></button>
  <button id="edit" title="Open this diagram in the FastDraw editor in the browser; edits there save to the file">Open in editor</button>
</div>
<div id="stage"><div id="canvas"></div></div>
<script nonce="${nonce}" src="${media('preview.js')}"></script>
</body></html>`;
  }

  dispose() {
    clearTimeout(this.timer);
    for (const s of this.subs) s.dispose();
    this.onDispose.fire();
    this.onDispose.dispose();
    this.panel.dispose();
  }
}

// Put the cursor on a line of the diagram, in an editor already showing it if there is one.
async function reveal(doc: vscode.TextDocument, line: number, besides?: vscode.ViewColumn) {
  const shown = vscode.window.visibleTextEditors.find((e) => e.document === doc);
  const column = shown?.viewColumn ?? (besides === vscode.ViewColumn.One ? vscode.ViewColumn.Two : vscode.ViewColumn.One);
  const ed = await vscode.window.showTextDocument(doc, { viewColumn: column, preserveFocus: false });
  const n = Math.min(Math.max(0, line - 1), doc.lineCount - 1);
  const at = new vscode.Position(n, doc.lineAt(n).firstNonWhitespaceCharacterIndex);
  ed.selection = new vscode.Selection(at, at);
  ed.revealRange(new vscode.Range(at, at), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

// ---- Wiring --------------------------------------------------------------------------------------------

export function activate(ext: vscode.ExtensionContext) {
  const probs = new Problems();
  const previews = new Map<string, Preview>();
  ext.subscriptions.push(probs);

  const forDoc = (doc: vscode.TextDocument) => previews.get(doc.uri.toString());

  const attach = (panel: vscode.WebviewPanel, doc: vscode.TextDocument) => {
    const p = new Preview(panel, doc, ext, probs);
    const key = doc.uri.toString();
    previews.set(key, p);
    p.onDispose.event(() => { if (previews.get(key) === p) previews.delete(key); });
    probs.lint(doc);
    return p;
  };

  const show = async (uri: vscode.Uri | undefined, beside: boolean) => {
    const doc = uri ? await vscode.workspace.openTextDocument(uri) : vscode.window.activeTextEditor?.document;
    if (!doc || !isDiagram(doc)) { vscode.window.showInformationMessage('Open a .fdraw diagram to preview it.'); return; }
    const column = beside ? vscode.ViewColumn.Beside : vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.Active;
    const open = forDoc(doc);
    if (open) { open.panel.reveal(column, beside); return; }
    const panel = vscode.window.createWebviewPanel(VIEW, `Preview ${basename(doc.uri.path)}`, { viewColumn: column, preserveFocus: beside }, { enableScripts: true, retainContextWhenHidden: false });
    attach(panel, doc);
  };

  ext.subscriptions.push(
    vscode.commands.registerCommand('fastdraw.showPreview', (uri?: vscode.Uri) => show(uri instanceof vscode.Uri ? uri : undefined, false)),
    vscode.commands.registerCommand('fastdraw.showPreviewToSide', (uri?: vscode.Uri) => show(uri instanceof vscode.Uri ? uri : undefined, true)),
    vscode.commands.registerCommand('fastdraw.openInEditor', async (uri?: vscode.Uri) => {
      const doc = uri instanceof vscode.Uri ? await vscode.workspace.openTextDocument(uri) : vscode.window.activeTextEditor?.document;
      if (doc && isDiagram(doc)) await openInEditor(doc);
      else vscode.window.showInformationMessage('Open a .fdraw diagram first.');
    }),

    // a preview left open is put back when VS Code restarts
    vscode.window.registerWebviewPanelSerializer(VIEW, {
      async deserializeWebviewPanel(panel, state: { uri?: string } | undefined) {
        const uri = state?.uri;
        if (!uri) { panel.dispose(); return; }
        try { attach(panel, await vscode.workspace.openTextDocument(vscode.Uri.parse(uri))); }
        catch { panel.dispose(); }
      },
    }),

    vscode.workspace.onDidOpenTextDocument((d) => probs.lint(d)),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (!isDiagram(e.document)) return;
      probs.later(e.document);
      forDoc(e.document)?.refresh();
    }),
    vscode.workspace.onDidCloseTextDocument((d) => { if (isDiagram(d) && !forDoc(d)) probs.forget(d); }),
    // a look is shared by the diagrams next to it: redraw and re-check them all when one is saved
    vscode.workspace.onDidSaveTextDocument((d) => {
      if (!/\.look$/i.test(d.uri.path)) return;
      for (const doc of vscode.workspace.textDocuments) if (isDiagram(doc)) probs.lint(doc);
      for (const p of previews.values()) p.refetch();
    }),
    // counts in the preview's bar follow the Problems panel
    probs.onChange.event((uri) => previews.get(uri.toString())?.counts()),
    vscode.window.onDidChangeTextEditorSelection((e) => forDoc(e.textEditor.document)?.cursor(e.selections[0].active.line + 1)),
    vscode.window.onDidChangeActiveColorTheme(() => { for (const p of previews.values()) p.refresh(0); }),
    vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration('fastdraw.preview')) for (const p of previews.values()) p.refresh(0); }),
    { dispose: () => { for (const p of previews.values()) p.dispose(); } },
    { dispose: () => { for (const s of served.values()) s.then((x) => x.close(), () => {}); served.clear(); } },
  );

  for (const d of vscode.workspace.textDocuments) probs.lint(d);
}

export function deactivate() {}
