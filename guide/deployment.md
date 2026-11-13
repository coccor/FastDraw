# Deployment diagrams

Shows where software runs: which host or managed service, in which environment or network, in how many copies and at which version. An architecture diagram says what talks to what; this one says what is installed where. If you have no boundary, no copy count and no version to show, draw an architecture diagram.

## Three levels

```
text "Checkout service, production" at 40,52 style=h1

// 1. zone: a real boundary (an environment, a network, a region), never just a visual group
prod: zone "Prod / eu-west-1" at 40,96 232x304 dash=4,4 stroke=ink/0.2

// 2. host: a box with a type tag and no text of its own; icon and name sit as separate items
app: node tag="POD" at 56,268 200x116
icon at 68,296 20x20 icon=container                 // what kind of thing it is
text "app" at 96,311 weight=600                     // name: host top + 43
rect "x3" at 220,276 28x12 radius=2 fill=none stroke=ink/0.4 sw=0.8 title.font=mono title.size=8 title.weight=400 overlap=ok

// 3. chip: one per thing installed on the host, with its version
rect at 64,320 184x24 radius=4 fill=paper stroke=ink/0.25 overlap=ok
text "checkout-api" at 72,336
text "v2.4.1" at 240,336 style=small anchor=end
```

- Host: 200 wide. Height 84 with one chip, plus 32 for each further chip. `tag=` is the kind of host (POD, VM, CDN, MANAGED). Leave the host's own text empty, or it is centred on top of the chips.
- Icon: `icon=` names from `fastdraw sizes` (container, server, vm, database, bucket, gateway, cdn), a 20x20 `icon` shape at host x+12, top+28, one per host or none. The name starts at host x+40, baseline top+43. On a `focal` host the name is `color=#ffffff`.
- Chip: a `rect`, never `store` (that means data, and many looks draw it as a cylinder). 8px in from the host's sides, 24 high; the first starts 52px below the host's top, the next 32px lower. Name at chip x+8, version right-aligned at chip right−8, both with baseline 16px below the chip's top. Every chip has a version: the version is why it is drawn. `fill=paper` also reads on a `focal` host.
- Copies: one host with a badge in its top-right corner, not one box per copy: the `rect "x3"` above, at hostright−36,hosttop+8. It needs `overlap=ok`.
- Host styles: `node` for your own hosts, `cloud` for a hosted platform (managed databases and buckets too), `focal` for the one that matters (the single point of failure, or the new piece). Do not use `store` for a host: it means data, and in looks that draw it as a cylinder its tag is half hidden by the top.

## Composition

- Title at 40,52; zones start at y=96. Zones stand side by side in the order traffic passes through them, 80px apart (x = 40, 352, 664: 312 each), tops level. Canvas width = 312 × zones. A zone is 16px larger than its hosts on the sides and bottom and 32px at the top for its name (hosts start at y=128). A zone with one host is shorter than its neighbours; that is fine.
- Hosts in a zone stack vertically, at least 56px apart. Choose which goes on top so that each path between zones is a straight horizontal line: the two hosts it joins sit level (same centre y).
- Three zones, six hosts, nine chips, eight paths at most. More: one diagram per environment. Never two environments in one diagram without a zone between them.

## Paths

- Every path carries protocol and port as its label: `"HTTPS:443"`, `"TLS:5432"`.
- A path that crosses a zone border uses `style=link`; a path inside a zone is the default arrow; replication or anything asynchronous uses `style=return`.
- A path between neighbouring zones: put its label in the gap between the two zones with `lpos=<middle of the gap>,<line y − 10>`, so it does not sit on a zone border.
- A path that must pass a zone it does not touch (zone 1 to zone 3) goes under the zones: leave the bottom of the hosts, run it 24px below the lowest zone and come up into the bottom of the target: `app.bottom@120 -> bucket.bottom@780 "S3:443" style=return via=120,424;780,424 lpos=450,440`. `@` is an absolute x here, and must lie within the host's width. The label goes under the line.

## Legend

One `legend at 40,Y` 24px under the lowest path (or zone), with each host style and each path style used; canvas height = Y + 64. Say what the focal host is ("Single point of failure").
