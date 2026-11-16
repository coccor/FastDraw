// Whether npm has a newer fastdraw than the one running. Asked at most once a day, with a short timeout, and the
// answer kept in the user's cache folder; skipped on CI and when FASTDRAW_NO_UPDATE_CHECK is set. Run through
// `npx fastdraw` the running copy is normally the newest already; this is for one installed on the PATH.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { compareVersions } from './setup.ts';

const DAY = 24 * 60 * 60 * 1000;
const URL = 'https://registry.npmjs.org/fastdraw/latest';

export function cacheFile(env = process.env, home = homedir(), platform = process.platform): string {
  const base = platform === 'win32' ? env.LOCALAPPDATA ?? join(home, 'AppData', 'Local')
    : platform === 'darwin' ? join(home, 'Library', 'Caches') : env.XDG_CACHE_HOME ?? join(home, '.cache');
  return join(base, 'fastdraw', 'latest.json');
}

type Options = { file?: string; now?: number; env?: NodeJS.ProcessEnv; fetchLatest?: () => Promise<string> };

async function fromRegistry(): Promise<string> {
  const r = await fetch(URL, { signal: AbortSignal.timeout(1500), headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`npm answered ${r.status}`);
  return (await r.json() as { version: string }).version;
}

// The newer version, or null when this one is the newest, the check is off, or npm could not be asked.
export async function newerVersion(current: string, o: Options = {}): Promise<string | null> {
  const env = o.env ?? process.env, now = o.now ?? Date.now(), file = o.file ?? cacheFile(env);
  if (env.FASTDRAW_NO_UPDATE_CHECK || env.CI) return null;
  let cached: { checked: number; latest: string | null } | null = null;
  try { cached = JSON.parse(readFileSync(file, 'utf8')); } catch { /* not asked yet */ }
  let latest = cached?.latest ?? null;
  if (!cached || !(now - cached.checked < DAY)) {
    try { latest = await (o.fetchLatest ?? fromRegistry)(); } catch { latest = null; }
    // a failed ask is remembered too, so an offline machine waits a day instead of a timeout on every run
    try { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify({ checked: now, latest })); } catch { /* no cache folder */ }
  }
  return latest && compareVersions(latest, current) > 0 ? latest : null;
}
