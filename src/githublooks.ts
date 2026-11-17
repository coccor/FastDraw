// Looks kept in a GitHub repository, as the editor finds them: the person types `owner/repo` (or pastes a link to
// the repository, a folder in it or one .look file), and gets every .look file there with the address a diagram
// names it by: look "https://raw.githubusercontent.com/owner/repo/branch/path.look". Only public repositories
// can be read; nothing is sent but the requests for the listing and the files. Browser-safe: fetch only.
import { isWebLook } from './look.ts';

/** Where to look: a repository, a branch or tag in it (its default branch when absent), and a folder or one file. */
export type GitHubPlace = { owner: string; repo: string; ref?: string; path: string };
export type GitHubLook = { name: string; path: string; url: string };

// GitHub's rules for owner and repository names, near enough: letters, digits, '-', '_' and '.', not '.' or '..'
const NAME = /^(?!\.\.?$)[A-Za-z0-9_.-]{1,100}$/;
const RAW = 'https://raw.githubusercontent.com/';
// no more .look files than this are listed from one repository
export const MAX_LISTED = 60;

/**
 * Reads what was typed: `owner/repo`, `owner/repo/folder`, `owner/repo/file.look`, a github.com link to the
 * repository, a folder (tree/branch/...) or a file (blob/branch/...), or a raw.githubusercontent.com link.
 * A branch in a link is taken to be one segment. null when it is none of those.
 */
export function parseGitHubPlace(input: string): GitHubPlace | null {
  let s = input.trim().replace(/[?#].*$/, '').replace(/\/+$/, '').replace(/\.git$/i, '');
  let raw = false;
  const m = /^(?:https?:\/\/)?(?:www\.)?(github\.com|raw\.githubusercontent\.com)\/(.*)$/i.exec(s);
  if (m) { raw = m[1]!.toLowerCase() !== 'github.com'; s = m[2]!; }
  else if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return null;
  const parts = s.split('/');
  const [owner, repo] = parts;
  if (!owner || !repo || !NAME.test(owner) || !NAME.test(repo)) return null;
  if (parts.some((p) => p === '' || p === '.' || p === '..')) return null;
  let ref: string | undefined, rest = parts.slice(2);
  if (raw) { ref = rest[0]; rest = rest.slice(1); if (!ref) return null; }
  else if (rest[0] === 'tree' || rest[0] === 'blob') { ref = rest[1]; rest = rest.slice(2); if (!ref) return null; }
  return { owner, repo, ...(ref ? { ref } : {}), path: rest.join('/') };
}

/** The address a diagram names a look in a repository by. */
export const rawLookUrl = (owner: string, repo: string, ref: string, path: string): string =>
  RAW + [owner, repo, ref, ...path.split('/')].map(encodeURIComponent).join('/');

export type FetchJson = (url: string) => Promise<unknown>;
const fetchJson: FetchJson = async (url) => {
  const r = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', headers: { Accept: 'application/vnd.github+json' } });
  if (r.status === 404) throw new Error('not found, or not public');
  if (r.status === 403 || r.status === 429) throw new Error('GitHub has had too many requests from this address for now; try again in a while, or paste the link to one .look file');
  if (!r.ok) throw new Error(`GitHub answered ${r.status}`);
  return r.json();
};

const listed = new Map<string, Promise<GitHubLook[]>>();

/**
 * The .look files at a place on GitHub, by name. A place that is one .look file is that look alone, with no
 * request made. Listings are kept for the page's life; one that fails is forgotten so the next try asks again.
 */
export function listGitHubLooks(place: GitHubPlace, get: FetchJson = fetchJson): Promise<GitHubLook[]> {
  if (/\.look$/i.test(place.path) && place.ref) {
    const url = rawLookUrl(place.owner, place.repo, place.ref, place.path);
    return Promise.resolve(isWebLook(url) ? [{ name: lookName(place.path), path: place.path, url }] : []);
  }
  const key = `${place.owner}/${place.repo}@${place.ref ?? ''}/${place.path}`.toLowerCase();
  let p = listed.get(key);
  if (!p) {
    p = listFrom(place, get);
    listed.set(key, p);
    p.catch(() => listed.delete(key));
  }
  return p;
}

async function listFrom(place: GitHubPlace, get: FetchJson): Promise<GitHubLook[]> {
  const api = `https://api.github.com/repos/${encodeURIComponent(place.owner)}/${encodeURIComponent(place.repo)}`;
  const ref = place.ref ?? String(((await get(api)) as { default_branch?: unknown }).default_branch ?? '');
  if (!ref) throw new Error('the repository has no default branch');
  const tree = (await get(`${api}/git/trees/${encodeURIComponent(ref)}?recursive=1`)) as { tree?: { path?: unknown; type?: unknown }[] };
  const file = /\.look$/i.test(place.path);
  const inside = (p: string) => (file ? p === place.path : !place.path || p.startsWith(place.path + '/'));
  return (tree.tree ?? [])
    .filter((e): e is { path: string; type: string } => typeof e.path === 'string' && e.type === 'blob' && /\.look$/i.test(e.path) && inside(e.path))
    .slice(0, MAX_LISTED)
    .map((e) => ({ name: lookName(e.path), path: e.path, url: rawLookUrl(place.owner, place.repo, ref, e.path) }))
    .filter((l) => isWebLook(l.url));
}

const lookName = (path: string) => path.replace(/^.*\//, '').replace(/\.look$/i, '');

/** A short name for a look named by its address: the file's name, and the repository when it is on GitHub. */
export function webLookLabel(url: string): string {
  const m = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/[^/]+\/(?:.*\/)?([^/]+)\.look$/i.exec(url);
  if (m) return `${lookTitle(decodeURIComponent(m[3]!))} · ${decodeURIComponent(m[1]!)}/${decodeURIComponent(m[2]!)}`;
  try { return lookTitle(decodeURIComponent(new URL(url).pathname.replace(/^.*\//, '').replace(/\.look$/i, ''))); } catch { return url; }
}
/** A look's name from its file name: capitalised, and a short one (aws, gcp) in capitals, as such names are written. */
export const lookTitle = (name: string): string => (/^[a-z]{1,3}$/i.test(name) ? name.toUpperCase() : name.charAt(0).toUpperCase() + name.slice(1));
