// The icons every look starts with, from Phosphor Icons (https://phosphoricons.com, MIT licence, copyright
// (c) 2023 Phosphor Icons): filled shapes in a 256x256 box, in iconSet.ts with their other styles. This is the
// regular weight. A look adds or replaces icons with its own `icon` statements: outlines in a 24x24 box,
// drawn with a line, as before.
import { ICON_WEIGHTS } from './iconSet.ts';
export const ICONS: Record<string, string[]> = ICON_WEIGHTS.regular;

// Other words people reach for, so a search for "email" finds mail and "k8s" finds pod.
// Search only: the icon's name in a diagram is still the one above.
export const ICON_WORDS: Record<string, string> = {
  "active-directory": "ad identity directory ldap", admin: "administrator superuser", alert: "warning danger", api: "endpoint rest interface",
  backup: "save snapshot", bucket: "object storage blob s3", cache: "fast redis memcached", cdn: "edge", cloud: "saas hosted",
  container: "docker image", database: "db store table postgres mysql", deployment: "release launch rocket", desktop: "pc computer monitor",
  dns: "domain name", file: "document", firewall: "security waf", gateway: "proxy entry", ingress: "entry inbound", internet: "web globe www",
  key: "secret credential vault", "load-balancer": "lb balancer traffic", lock: "secure private auth", log: "logs logging audit",
  monitoring: "metrics observability graph", node: "cluster graph mesh", phone: "mobile smartphone device", pipeline: "ci cd build workflow",
  pod: "kubernetes k8s", queue: "messages broker kafka rabbitmq sqs topic", request: "send outbound", response: "reply return",
  robot: "bot agent automation", server: "host machine rack", service: "microservice backend", sql: "query", sync: "replicate refresh",
  terminal: "cli shell console", test: "lab experiment qa", user: "person customer actor account", users: "people group customers",
  vm: "virtual machine instance compute", volume: "disk storage ssd", vpn: "tunnel private network",
  mail: "email inbox smtp letter envelope", message: "sms notification", chat: "conversation messages talk", bell: "notification alert alarm",
  settings: "config configuration gear preferences", cpu: "processor chip compute", function: "lambda serverless faas",
  code: "source developer", browser: "web frontend website", app: "application window frontend", webhook: "callback hook event",
  calendar: "date schedule", clock: "time cron", scheduler: "cron job timer", folder: "directory files", archive: "cold storage",
  chart: "analytics bar graph", dashboard: "panel overview", report: "analytics bi", shield: "security protection defense",
  certificate: "tls ssl cert", fingerprint: "biometric identity", id: "identity badge card", password: "credential login secret",
  cart: "shop checkout ecommerce basket", payment: "card billing checkout", money: "cost price coin finance", building: "office company",
  store: "shop retail", factory: "manufacturing plant", warehouse: "inventory depot", bank: "finance", home: "house",
  location: "map pin place geo", wifi: "wireless", router: "network switch", network: "lan topology", plug: "connector integration",
  printer: "print", camera: "photo", antenna: "iot signal radio", ai: "brain ml model llm intelligence", sparkles: "magic ai new",
  package: "artifact npm library", box: "product", truck: "delivery shipping logistics van lorry", broadcast: "stream publish pubsub event",
  "git-merge": "merge", "git-commit": "commit version", "git-pull-request": "pr review", hierarchy: "tree org structure",
  table: "grid spreadsheet", list: "items", filter: "funnel", upload: "import", download: "export", check: "ok success done",
  error: "fail failure x", info: "about help", question: "help faq unknown", plugin: "extension addon puzzle", tool: "wrench maintenance",
  eye: "view watch visible", star: "favourite favorite rating", flag: "feature toggle", route: "path routing workflow",
  audit: "inspect search review", document: "doc text page", image: "picture photo", video: "media stream", notebook: "jupyter notes",
  book: "docs documentation wiki", tablet: "ipad device", team: "group people org", support: "helpdesk customer service headset",
  idea: "bulb lightbulb insight", target: "goal objective", trend: "growth increase",
};

// Does the icon called `name` answer to `word`, by its name or the words above?
export function iconMatches(name: string, word: string): boolean {
  const w = word.trim().toLowerCase().replace(/\s+/g, '-');
  if (!w || name.includes(w)) return true;
  const words = ICON_WORDS[name];
  return !!words && words.split(' ').some((x) => x.startsWith(w) || x === w.replace(/-/g, ''));
}

// The built-in icon drawn in place of an icon file that could not come along: a link shared without it, or
// a page that cannot read the look's icon folder. It is the closest of the first set by name and search
// words ("virtual-machine" -> vm, "azure-sql-database" -> database), and box when nothing is close. Only the
// first set is searched, so the choice is the same whether or not the rest of the icons have loaded.
const FIRST = Object.keys(ICONS);
const VENDOR_WORDS = new Set(['icon', 'icons', 'service', 'services', 'azure', 'aws', 'amazon', 'gcp', 'google', 'microsoft', 'ms', 'the', 'and', 'for', 'of']);
export function standInIcon(name: string): string {
  if (FIRST.includes(name)) return name;
  const words = name.split('-').filter((w) => w.length > 1 && !VENDOR_WORDS.has(w) && !/^\d+$/.test(w));
  // a two-letter word ("db") only counts when it is one of an icon's search words; "s" is dropped from plurals
  const hit = (n: string, w: string) => (w.length > 2 ? iconMatches(n, w) || (w.endsWith('s') && n === w.slice(0, -1)) : !!ICON_WORDS[n]?.split(' ').includes(w));
  let best = 'box', score = 0;
  for (const n of FIRST) {
    let s = iconMatches(n, name) && name.length > 2 ? 4 : 0;
    for (const w of words) s += n === w ? 3 : hit(n, w) ? 1 : 0;
    if (s > score) { best = n; score = s; }
  }
  return best;
}
