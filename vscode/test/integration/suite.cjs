// Runs inside VS Code: the extension's commands, Problems and preview, through VS Code's own API.
const vscode = require('vscode');
const assert = require('node:assert/strict');
const { join } = require('node:path');

const pause = () => new Promise((r) => setTimeout(r, +process.env.FASTDRAW_PAUSE * 1000));
const wait = async (what, ok, ms = 10000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await ok();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 100));
  }
};
const previewTabs = () => vscode.window.tabGroups.all.flatMap((g) => g.tabs)
  .filter((t) => t.input instanceof vscode.TabInputWebview && t.input.viewType.endsWith('fastdraw.preview'));

const tabs = () => vscode.window.tabGroups.all.flatMap((g) => g.tabs);

async function opensAsDiagram(uri) {
  // a .fdraw file opens as the diagram, not its text
  await vscode.commands.executeCommand('vscode.open', uri);
  const tab = await wait('the diagram tab', () => tabs().find((t) => t.input instanceof vscode.TabInputCustom && t.input.viewType === 'fastdraw.diagram'));
  assert.equal(tab.input.uri.toString(), uri.toString());
  assert.ok(!tabs().some((t) => t.input instanceof vscode.TabInputText));
  // its problems are checked without the text open
  await wait('the problems', () => vscode.languages.getDiagnostics(uri).some((d) => d.source === 'fastdraw'));
  // an icon past the first ~130 (house) is known, as on the command line
  assert.deepEqual(vscode.languages.getDiagnostics(uri).filter((d) => d.severity === vscode.DiagnosticSeverity.Error).map((d) => d.message), []);
  await pause();
  // Show Source puts the text beside it
  await vscode.commands.executeCommand('fastdraw.showSource', uri);
  await wait('the text beside', () => vscode.window.visibleTextEditors.some((e) => e.document.uri.toString() === uri.toString()));
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  // and the text editor is the default again with VS Code's own setting
  const assoc = vscode.workspace.getConfiguration('workbench');
  await assoc.update('editorAssociations', { '*.fdraw': 'default' }, vscode.ConfigurationTarget.Global);
  await vscode.commands.executeCommand('vscode.open', uri);
  await wait('the text tab', () => tabs().find((t) => t.input instanceof vscode.TabInputText));
  assert.ok(!tabs().some((t) => t.input instanceof vscode.TabInputCustom));
  await assoc.update('editorAssociations', undefined, vscode.ConfigurationTarget.Global);
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
}

async function steps() {
  const uri = vscode.Uri.file(join(process.env.FASTDRAW_WORK, 'checkout.fdraw'));
  // a file with an overlap, so the check has something to say
  const other = vscode.Uri.file(join(process.env.FASTDRAW_WORK, 'other.fdraw'));
  await vscode.workspace.fs.writeFile(other, Buffer.from('a: node "A" at 40,40 icon=house\nb: node "B" at 60,50\n'));
  await opensAsDiagram(other);

  const doc = await vscode.workspace.openTextDocument(uri);
  assert.equal(doc.languageId, 'fastdraw');
  const ed = await vscode.window.showTextDocument(doc);
  // held on screen for screenshots: give the preview the room the sidebar takes
  if (+process.env.FASTDRAW_PAUSE) await vscode.commands.executeCommand('workbench.action.closeSidebar');

  // a clean diagram has no errors or warnings
  await wait('the first check', () => vscode.languages.getDiagnostics(uri).length >= 0);
  assert.deepEqual(vscode.languages.getDiagnostics(uri).filter((d) => d.severity <= vscode.DiagnosticSeverity.Warning), []);

  await vscode.commands.executeCommand('fastdraw.showPreviewToSide');
  await wait('the preview tab', () => previewTabs().length === 1);
  assert.equal(previewTabs()[0].label, 'Preview checkout.fdraw');
  await pause();

  // an unsaved edit that puts a box on top of another: a warning on its line, without saving
  await ed.edit((e) => e.insert(new vscode.Position(doc.lineCount, 0), 'cache: store "Cache" at 300,64\n'));
  const line = doc.lineCount - 2;
  const warn = await wait('the overlap warning', () => vscode.languages.getDiagnostics(uri).find((d) => d.severity === vscode.DiagnosticSeverity.Warning));
  assert.equal(warn.range.start.line, line);
  assert.match(warn.message, /cache overlaps api/);
  assert.equal(warn.source, 'fastdraw');
  ed.selection = new vscode.Selection(line, 0, line, 0);
  await pause();

  // a second Open Preview shows the same preview, not another
  await vscode.commands.executeCommand('fastdraw.showPreviewToSide');
  assert.equal(previewTabs().length, 1);

  // the dark theme draws the look's dark version
  await vscode.workspace.getConfiguration('workbench').update('colorTheme', 'Default Dark Modern', vscode.ConfigurationTarget.Global);
  await pause();
  await vscode.workspace.getConfiguration('workbench').update('colorTheme', 'Default Light Modern', vscode.ConfigurationTarget.Global);

  // undoing the edit clears the warning
  await vscode.commands.executeCommand('undo');
  await wait('the warning to clear', () => !vscode.languages.getDiagnostics(uri).some((d) => d.severity === vscode.DiagnosticSeverity.Warning));
  assert.equal(doc.isDirty, false);
  await opensInLocalEditor(uri);
}

// Open in editor with the local choice: the extension serves its own copy of the local editor on 127.0.0.1, which
// answers with the editor's page, and the address names the diagram after the #. The setting is put back after.
async function opensInLocalEditor(uri) {
  const cfg = vscode.workspace.getConfiguration('fastdraw');
  await cfg.update('editor', 'local', vscode.ConfigurationTarget.Global);
  try {
    const api = vscode.extensions.getExtension('coccor.fastdraw').exports;
    // not awaited: the command waits on VS Code's browser opener, which may never answer under xvfb
    void vscode.commands.executeCommand('fastdraw.openInEditor', uri);
    const link = new URL(await wait('the editor link', () => api.lastEditorLink()));
    assert.equal(link.hostname, '127.0.0.1');
    assert.match(link.pathname, /\/edit\/$/);
    assert.equal(new URLSearchParams(link.hash.slice(1)).get('open'), 'checkout.fdraw');
    const page = await fetch(link.origin + link.pathname);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<div id="root">/);
  } finally { await cfg.update('editor', undefined, vscode.ConfigurationTarget.Global); }
}

exports.run = async () => {
  try { await steps(); console.log('fastdraw: integration steps passed'); }
  finally { await vscode.commands.executeCommand('workbench.action.closeAllEditors'); }
};
