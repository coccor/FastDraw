# Deployment diagrams

Shows where software runs: which host or managed service, in which environment or network, in how many copies and at which version. An architecture diagram says what talks to what; this one says what is installed where. If you have no boundary, no copy count and no version to show, draw an architecture diagram.

## Three levels

```
// 1. zone: a real boundary (an environment, a network, a region), never just a visual group
prod: zone "Prod / eu-west-1" at 384,92 232x304 dash=4,4 stroke=ink/0.2

// 2. host: a box with a type tag and no text of its own; its name is a text 40px below its top
app: node tag="POD" at 400,264 200x116
text "app" at 500,304 weight=600 anchor=middle

// 3. chip: one per thing installed on the host, with its version
store at 408,316 184x24 radius=4
text "checkout-api" at 416,332
text "v2.4.1" at 584,332 style=small anchor=end
```

- Host: 200 wide. Height 84 with one chip, plus 32 for each further chip. `tag=` is the kind of host (POD, VM, CDN, MANAGED). Leave the host's own text empty, or it is centred on top of the chips.
- Chip: 8px in from the host's sides, 24 high; the first starts 52px below the host's top, the next 32px lower. Name at chip x+8, version right-aligned at chip right−8, both with baseline 16px below the chip's top. Every chip has a version: the version is why it is drawn.
- Copies: one host with a badge in its top-right corner, not one box per copy: `rect "x3" at hostright-36,hosttop+8 28x12 radius=2 fill=none stroke=ink/0.4 sw=0.8 title.font=mono title.size=8 title.weight=400`.
- Host styles: `node` for your own hosts, `cloud` for a hosted platform, `store` for a data host, `focal` for the one that matters (the single point of failure, or the new piece).

## Composition

- Zones stand side by side in the order traffic passes through them, 80px apart, tops level. A zone is 16px larger than its hosts on the sides and bottom and 32px at the top for its name. A zone with one host is shorter than its neighbours; that is fine.
- Hosts in a zone stack vertically, 56px apart. Choose which goes on top so that each path between zones is a straight horizontal line: the two hosts it joins sit level (same centre y).
- Three zones, six hosts, nine chips, eight paths at most. More: one diagram per environment. Never two environments in one diagram without a zone between them.

## Paths

- Every path carries protocol and port as its label: `"HTTPS:443"`, `"TLS:5432"`.
- A path that crosses a zone border uses `style=link`; a path inside a zone is the default arrow; replication or anything asynchronous uses `style=return`.
- A path between zones: put its label in the gap between the two zones with `lpos=<middle of the gap>,<line y − 10>`, so it does not sit on a zone border.

## Legend

One `legend at 40,Y` 24px under the lowest zone, with each host style and each path style used. Say what the focal host is ("Single point of failure").
