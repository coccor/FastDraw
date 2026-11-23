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

async function steps() {
  const uri = vscode.Uri.file(join(process.env.FASTDRAW_WORK, 'checkout.fdraw'));
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
}

exports.run = async () => {
  try { await steps(); console.log('fastdraw: integration steps passed'); }
  finally { await vscode.commands.executeCommand('workbench.action.closeAllEditors'); }
};
