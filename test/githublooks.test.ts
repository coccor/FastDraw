import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGitHubPlace, listGitHubLooks, rawLookUrl, webLookLabel, lookTitle } from '../src/githublooks.ts';
import { isWebLook, movedLookUrl, MOVED_LOOKS, BUNDLED_LOOK_NAMES } from '../src/look.ts';

test('what is typed in the editor names a place on GitHub', () => {
  assert.deepEqual(parseGitHubPlace('coccor/fastdraw-looks'), { owner: 'coccor', repo: 'fastdraw-looks', path: '' });
  assert.deepEqual(parseGitHubPlace(' https://github.com/coccor/fastdraw-looks.git '), { owner: 'coccor', repo: 'fastdraw-looks', path: '' });
  assert.deepEqual(parseGitHubPlace('github.com/acme/app/tree/dev/docs/looks/'), { owner: 'acme', repo: 'app', ref: 'dev', path: 'docs/looks' });
  assert.deepEqual(parseGitHubPlace('https://github.com/acme/app/blob/v2/team.look?plain=1'), { owner: 'acme', repo: 'app', ref: 'v2', path: 'team.look' });
  assert.deepEqual(parseGitHubPlace('https://raw.githubusercontent.com/acme/app/main/a/b.look'), { owner: 'acme', repo: 'app', ref: 'main', path: 'a/b.look' });
  assert.deepEqual(parseGitHubPlace('acme/app/looks'), { owner: 'acme', repo: 'app', path: 'looks' });
  for (const bad of ['', 'acme', 'https://evil.example/acme/app', 'file:///etc/passwd', 'acme/../app', 'acme/app/../../x', 'acme/a b', 'github.com/acme/app/tree/']) assert.equal(parseGitHubPlace(bad), null, bad);
});

test('a repository is listed once, and only its .look files are offered, by their raw address', async () => {
  const asked: string[] = [];
  const get = async (url: string) => {
    asked.push(url);
    if (url.endsWith('/repos/acme/app')) return { default_branch: 'main' };
    if (url.includes('/git/trees/main')) return { tree: [
      { path: 'README.md', type: 'blob' }, { path: 'looks', type: 'tree' }, { path: 'looks/team.look', type: 'blob' },
      { path: 'looks/dark night.look', type: 'blob' }, { path: 'other/x.look', type: 'blob' }, { path: 'evil.look', type: 'commit' },
    ] };
    throw new Error('unexpected ' + url);
  };
  const all = await listGitHubLooks({ owner: 'acme', repo: 'app', path: '' }, get);
  assert.deepEqual(all.map((l) => l.name), ['team', 'dark night', 'x']);
  assert.equal(all[1]!.url, 'https://raw.githubusercontent.com/acme/app/main/looks/dark%20night.look');
  assert.ok(all.every((l) => isWebLook(l.url)));
  await listGitHubLooks({ owner: 'ACME', repo: 'app', path: '' }, get);
  assert.equal(asked.length, 2); // kept for the page's life
  const folder = await listGitHubLooks({ owner: 'acme', repo: 'app', ref: 'main', path: 'looks' }, get);
  assert.deepEqual(folder.map((l) => l.path), ['looks/team.look', 'looks/dark night.look']);
  // one file with its branch needs no listing
  const one = await listGitHubLooks({ owner: 'acme', repo: 'app', ref: 'v2', path: 'team.look' }, async () => { throw new Error('asked'); });
  assert.deepEqual(one, [{ name: 'team', path: 'team.look', url: 'https://raw.githubusercontent.com/acme/app/v2/team.look' }]);
  // a listing that fails is asked again next time
  let tries = 0;
  const flaky = async () => { tries++; throw new Error('down'); };
  await assert.rejects(listGitHubLooks({ owner: 'x', repo: 'y', path: '' }, flaky));
  await assert.rejects(listGitHubLooks({ owner: 'x', repo: 'y', path: '' }, flaky));
  assert.equal(tries, 2);
});

test('looks named by address, and the looks that moved out of FastDraw', () => {
  assert.ok(isWebLook('https://raw.githubusercontent.com/coccor/fastdraw-looks/main/engraved.look'));
  assert.ok(isWebLook('https://cdn.jsdelivr.net/gh/acme/app@v1/team.look?x=1'));
  for (const bad of ['http://example.com/a.look', 'https://example.com/a.look.txt', './team.look', 'https://example.com/"a.look', 'https://example.com/a?.look']) assert.ok(!isWebLook(bad), bad);
  for (const n of MOVED_LOOKS) {
    assert.ok(!BUNDLED_LOOK_NAMES.includes(n), n);
    assert.equal(movedLookUrl(n), rawLookUrl('coccor', 'fastdraw-looks', 'main', `${n}.look`));
  }
  assert.equal(movedLookUrl('sketch'), undefined);
  assert.equal(webLookLabel('https://raw.githubusercontent.com/coccor/fastdraw-looks/main/engraved.look'), 'Engraved · coccor/fastdraw-looks');
  assert.equal(webLookLabel('https://example.com/x/team-brand.look'), 'Team-brand');
  assert.equal(webLookLabel('https://raw.githubusercontent.com/coccor/fastdraw-looks/main/aws.look'), 'AWS · coccor/fastdraw-looks');
  assert.equal(lookTitle('gcp'), 'GCP');
  assert.equal(lookTitle('azure'), 'Azure');
});
