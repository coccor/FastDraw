// Icons and fonts a look names by https:// address. Nothing here touches the network: fetching goes through a
// stand-in that answers from a table.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLook, isWebUrl, fontFamily } from '../src/look.ts';
import { loadExtendedIcons } from '../src/extendedIcons.ts';
import { buildScene } from '../src/scene.ts';
import { renderSvg } from '../src/render.ts';
import { withIconImages } from '../src/iconfiles.ts';
import { iconAddresses, hasWebIcons, localIconDirs, fetchWebIcons, webFaces, faceRule, inlineWebFaces, weightsDrawn, isPrivateHost, webFetch, hostOf } from '../src/webassets.ts';
import type { Fetch } from '../src/webassets.ts';

const SVG = (fill: string) => new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="${fill}"/></svg>`);
// a server: a file per address, null for "not there", and hosts that cannot be reached
const server = (files: Record<string, Uint8Array | null>, down: string[] = []): Fetch & { asked: string[] } => {
  const asked: string[] = [];
  const f = async (url: string) => {
    asked.push(url);
    if (down.some((h) => url.startsWith(`https://${h}/`))) throw new Error('unreachable');
    return files[url] ?? null;
  };
  return Object.assign(f, { asked });
};

const LOOK = `icondir "https://a.example/set@1.0.0/{name}.svg"
icondir "https://b.example/other@2.0.0/svg/"
icondir "./local"
icon lambda "https://c.example/aws@3.3.0/AWSLambda.svg"
font sans "Inter" "https://f.example/inter@5.3.0/latin-{weight}-{style}.ttf"
font mono "Code" "https://f.example/code.woff2"`;

test('a look names icons and fonts by https:// address', () => {
  const look = parseLook(LOOK);
  assert.deepEqual(look.issues, []);
  assert.deepEqual(look.iconDirs, ['https://a.example/set@1.0.0/{name}.svg', 'https://b.example/other@2.0.0/svg/', './local']);
  assert.deepEqual([...look.iconUrls], [['lambda', 'https://c.example/aws@3.3.0/AWSLambda.svg']]);
  assert.deepEqual([...look.fontUrls], [['Inter', 'https://f.example/inter@5.3.0/latin-{weight}-{style}.ttf'], ['Code', 'https://f.example/code.woff2']]);
  assert.equal(look.fonts.get('sans'), 'Inter');
  assert.ok(hasWebIcons(look));
  assert.deepEqual(localIconDirs(look), ['./local']);
  // the font-family list still names the shipped font after it, for while it loads or if it cannot
  assert.equal(fontFamily(look, 'sans'), "'Inter', 'Geist', sans-serif");
  // where an icon is looked for: its own line first, then each address in order
  assert.deepEqual(iconAddresses(look, 'lambda'), ['https://c.example/aws@3.3.0/AWSLambda.svg', 'https://a.example/set@1.0.0/lambda.svg', 'https://b.example/other@2.0.0/svg/lambda.svg']);
  assert.ok(!hasWebIcons(parseLook('icondir "./icons"')));
});

test('only https addresses with nothing that could break out of quotes are taken', () => {
  for (const ok of ['https://cdn.jsdelivr.net/npm/x@1/icons/{name}.svg', 'https://h.example/Virtual-Machines-(Classic).svg', 'HTTPS://h.example/a.svg']) assert.ok(isWebUrl(ok), ok);
  for (const bad of ['http://h.example/a.svg', 'https://', 'https://h.example/a b.svg', 'https://h.example/a".svg', "https://h.example/a'.svg", 'https://h.example/<a>.svg', 'https://h.example/a\\b', 'https://h.example/a`b', 'https://h.example/\x1b[31m.svg', 'https://h.example/\x00', `https://h.example/${'a'.repeat(500)}`, 'javascript:alert(1)', 'file:///etc/passwd']) assert.ok(!isWebUrl(bad), JSON.stringify(bad));
  const look = parseLook(`icondir "http://h.example/{name}.svg"
icondir "file:///etc"
icon remote "ftp://h.example/a.svg"
font sans "Inter" "./fonts/inter.ttf"
icondir "./still-a-folder"`);
  assert.deepEqual(look.issues.map((i) => i.msg.split(' ').slice(0, 3).join(' ')), ['icondir takes a', 'icondir takes a', 'icon remote takes', 'font sans "Inter"']);
  assert.deepEqual(look.iconDirs, ['./still-a-folder']);
  assert.equal(look.iconUrls.size + look.fontUrls.size, 0);
});

test('icons are fetched from the first address that has them; a missing one is left out, an unreachable host noted', async () => {
  const look = parseLook(LOOK);
  const get = server({
    'https://c.example/aws@3.3.0/AWSLambda.svg': SVG('orange'),
    'https://b.example/other@2.0.0/svg/vault.svg': SVG('blue'),
    'https://a.example/set@1.0.0/database.svg': SVG('green'),
    'https://a.example/set@1.0.0/bad.svg': new TextEncoder().encode('<html>not an icon</html>'),
  });
  const got = await fetchWebIcons(look, ['lambda', 'vault', 'database', 'nowhere', 'bad', 'lambda', 'Not A Name'], get);
  assert.deepEqual(Object.keys(got.uris).sort(), ['database', 'lambda', 'vault']);
  assert.match(got.uris.lambda!, /^data:image\/svg\+xml;base64,/);
  assert.equal(got.done, true);
  assert.deepEqual(got.unreachable, []);
  assert.ok(!get.asked.some((u) => u.includes('Not A Name')));
  // a host that cannot be reached: the icon stays out and the fetch is not done
  const down = await fetchWebIcons(look, ['vault2'], server({}, ['a.example']));
  assert.deepEqual(down, { uris: {}, done: false, unreachable: ['a.example'] });
});

test('until the icons are fetched the closest built-in one stands in; once fetched they are drawn; one found nowhere is an error', async () => {
  await loadExtendedIcons();
  const look = parseLook(LOOK);
  const src = 'a: rect "Fn" at 20,20 160x60 icon=lambda\nb: rect "Vault" at 220,20 160x60 icon=key-vaults\nc: rect "DB" at 420,20 160x60 icon=database\n';
  const before = buildScene(src, look);
  assert.deepEqual(before.issues.filter((i) => i.level === 'error'), []);
  const warns = before.issues.filter((i) => i.level === 'warn').map((i) => i.msg);
  assert.ok(warns.some((m) => m.startsWith('icon lambda is one of the look\'s icon files (https://c.example/aws@3.3.0/AWSLambda.svg)') && m.endsWith('the built-in icon function is drawn in its place')), warns.join('\n'));
  assert.ok(warns.some((m) => m.startsWith('icon key-vaults') && m.includes('built-in icon key ')));
  // database is a built-in icon: no stand-in for it
  assert.ok(!warns.some((m) => m.startsWith('icon database')));
  const got = await fetchWebIcons(look, ['lambda', 'key-vaults', 'database'], server({ 'https://c.example/aws@3.3.0/AWSLambda.svg': SVG('orange'), 'https://a.example/set@1.0.0/key-vaults.svg': SVG('blue') }));
  const after = buildScene(src, withIconImages(look, [], got.uris, got.done));
  assert.deepEqual(after.issues.filter((i) => i.level !== 'hint'), []);
  assert.equal((renderSvg(after).match(/<image /g) ?? []).length, 2);
  // fetched in full, and an icon none of the addresses has is a mistake
  const none = await fetchWebIcons(look, ['nowhere'], server({}));
  const sc = buildScene('a: rect "x" at 20,20 160x60 icon=nowhere\n', withIconImages(look, [], none.uris, none.done));
  assert.ok(sc.issues.some((i) => i.level === 'error' && i.msg.startsWith('there is no icon called "nowhere"')));
});

test('font faces: 400 to 700 for {weight}, an italic for {style}, one file at every weight otherwise', async () => {
  const look = parseLook(LOOK + '\nfont serif "Bad\'Name" "https://f.example/x.ttf"');
  const faces = webFaces(look);
  assert.deepEqual(faces.map((f) => `${f.family} ${f.weight} ${f.style} ${f.url}`), [
    'Inter 400 normal https://f.example/inter@5.3.0/latin-400-normal.ttf',
    'Inter 500 normal https://f.example/inter@5.3.0/latin-500-normal.ttf',
    'Inter 600 normal https://f.example/inter@5.3.0/latin-600-normal.ttf',
    'Inter 700 normal https://f.example/inter@5.3.0/latin-700-normal.ttf',
    'Inter 400 italic https://f.example/inter@5.3.0/latin-400-italic.ttf',
    'Code 0 normal https://f.example/code.woff2',
  ]);
  assert.equal(faceRule(faces[0]!), `@font-face{font-family:'Inter';font-weight:400;font-style:normal;src:url("https://f.example/inter@5.3.0/latin-400-normal.ttf") format('truetype');}`);
  assert.match(faceRule(faces[5]!), /font-weight:100 900;.*format\('woff2'\)/);
  // an export carries only the faces its text uses
  const svg = `<text font-family="'Inter', 'Geist', sans-serif" font-weight="600">a</text><text font-family="'Inter', 'Geist', sans-serif">b</text>`;
  assert.deepEqual([...weightsDrawn(svg)].sort(), [400, 600]);
  const get = server({ 'https://f.example/inter@5.3.0/latin-400-normal.ttf': new Uint8Array([1, 2, 3]), 'https://f.example/inter@5.3.0/latin-600-normal.ttf': new Uint8Array([4, 5, 6]) });
  const css = await inlineWebFaces(look, new Set(['Inter']), svg, get);
  assert.equal((css.match(/@font-face/g) ?? []).length, 2);
  assert.match(css, /font-weight:600;font-style:normal;src:url\("data:font\/ttf;base64,BAUG"\)/);
  assert.deepEqual(get.asked.sort(), ['https://f.example/inter@5.3.0/latin-400-normal.ttf', 'https://f.example/inter@5.3.0/latin-600-normal.ttf']);
});

test('nothing on the machine or the local network is fetched, and nothing over the size limit is kept', async () => {
  for (const h of ['localhost', 'api.localhost', 'printer.local', '127.0.0.1', '10.0.0.8', '172.16.0.1', '172.31.255.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '[::1]', 'fd12::1', 'fe80::1', '::ffff:127.0.0.1', 'intranet', 'localhost.', 'LOCALHOST', 'printer.local.', '[::7f00:1]', '[::127.0.0.1]', '[64:ff9b::7f00:1]']) assert.ok(isPrivateHost(h), h);
  for (const h of ['cdn.jsdelivr.net', 'raw.githubusercontent.com', '8.8.8.8', '172.32.0.1', '[2606:4700::1]']) assert.ok(!isPrivateHost(h), h);
  await assert.rejects(webFetch('https://127.0.0.1/x.svg', 1000), /not a public https address/);
  await assert.rejects(webFetch('https://169.254.169.254/latest/meta-data', 1000), /not a public https address/);
  const real = globalThis.fetch;
  try {
    // a server that says nothing about the length and keeps sending
    globalThis.fetch = (async () => new Response(new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(4096)); } }), { status: 200 })) as typeof fetch;
    await assert.rejects(webFetch('https://h.example/big.svg', 10_000), /file too large/);
    globalThis.fetch = (async () => new Response('x', { status: 404 })) as typeof fetch;
    assert.equal(await webFetch('https://h.example/missing.svg', 10_000), null);
    let opts: RequestInit | undefined;
    globalThis.fetch = (async (_u: unknown, o: RequestInit) => { opts = o; return new Response('<svg/>', { status: 200 }); }) as typeof fetch;
    assert.equal((await webFetch('https://h.example/ok.svg', 10_000))!.length, 6);
    assert.equal(opts!.redirect, 'error');
    assert.equal(opts!.credentials, 'omit');
    assert.equal(opts!.referrerPolicy, 'no-referrer');
  } finally { globalThis.fetch = real; }
  assert.equal(hostOf('not a url'), 'an address in the look');
  // fonts are loaded by the browser itself, so a private address never becomes a face
  assert.deepEqual(webFaces(parseLook('font sans "A" "https://192.168.1.10/a-{weight}.ttf"\nfont mono "B" "https://localhost/b.ttf"\nfont serif "C" "https://f.example/c.ttf"')).map((f) => f.family), ['C']);
  // a placeholder in the host is filled in before the check, so it cannot make a private address
  assert.deepEqual(webFaces(parseLook('font sans "D" "https://1{weight}.0.0.1/d.ttf"\nfont mono "E" "https://cdn.example.com/e-{weight}.ttf"')).map((f) => `${f.family} ${f.weight}`), ['E 400', 'E 500', 'E 600', 'E 700']);
});

test("a set on jsDelivr is listed from jsDelivr's file list; a set elsewhere lists its names in the look", async () => {
  const { setListing, listWebIcons } = await import('../src/webassets.ts');
  const az = setListing('https://cdn.jsdelivr.net/gh/benc-uk/icon-collection@e33ee71/azure-docs/{name}.svg')!;
  assert.equal(az.url, 'https://data.jsdelivr.com/v1/packages/gh/benc-uk/icon-collection@e33ee71?structure=flat');
  assert.equal(az.nameOf('/azure-docs/key-vault.svg'), 'key-vault');
  for (const p of ['/azure-docs/api_bing_search.svg', '/azure-docs/Key-Vault.svg', '/azure-icons/key-vault.svg', '/azure-docs/sub/key-vault.svg']) assert.equal(az.nameOf(p), null, p);
  assert.equal(setListing('https://cdn.jsdelivr.net/npm/@tabler/icons@3.52.0/icons/outline/{name}.svg')!.url, 'https://data.jsdelivr.com/v1/packages/npm/@tabler/icons@3.52.0?structure=flat');
  // a folder address, and a name used twice in the path
  assert.equal(setListing('https://cdn.jsdelivr.net/npm/simple-icons@16.38.0/icons/')!.nameOf('/icons/github.svg'), 'github');
  const dev = setListing('https://cdn.jsdelivr.net/gh/devicons/devicon@v2.16.0/icons/{name}/{name}-original.svg')!;
  assert.equal(dev.nameOf('/icons/react/react-original.svg'), 'react');
  assert.equal(dev.nameOf('/icons/react/vue-original.svg'), null);
  // not on jsDelivr, or no version to list
  assert.equal(setListing('https://raw.githubusercontent.com/k/c/abc/icons/{name}.svg'), null);
  assert.equal(setListing('https://cdn.jsdelivr.net/npm/simple-icons/icons/{name}.svg'), null);

  const look = parseLook(`icondir "https://cdn.jsdelivr.net/npm/set@1.0.0/svg/{name}.svg"
icondir "https://raw.example.com/k8s/abc/{name}.svg" names="pod deploy svc"
icon lambda "https://c.example/aws@3.3.0/AWSLambda.svg"`);
  assert.deepEqual(look.issues, []);
  assert.deepEqual([...look.iconSetNames], [['https://raw.example.com/k8s/abc/{name}.svg', ['pod', 'deploy', 'svc']]]);
  const list = JSON.stringify({ files: [{ name: '/svg/lambda.svg' }, { name: '/svg/queue.svg' }, { name: '/svg/Big.svg' }, { name: '/README.md' }, { name: 7 }] });
  const get = server({ 'https://data.jsdelivr.com/v1/packages/npm/set@1.0.0?structure=flat': new TextEncoder().encode(list) });
  // sorted, and a name with its own icon line is that one, not the set's
  assert.deepEqual(await listWebIcons(look, get), ['deploy', 'pod', 'queue', 'svc']);
  // a list that cannot be read leaves the set working by name
  assert.deepEqual(await listWebIcons(look, server({}, ['data.jsdelivr.com'])), ['deploy', 'pod', 'svc']);
  // names= is for addresses, in small letters
  const bad = parseLook('icondir "./icons" names="a b"\nicondir "https://h.example/{name}.svg" names="Bad Name"');
  assert.deepEqual(bad.issues.map((i) => i.msg.slice(0, 22)), ['names= lists the icons', 'icondir names= lists i']);
  assert.equal(bad.iconSetNames.size, 0);
});
