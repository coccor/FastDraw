# High-level diagrams

Shows a whole data stack on one page: phases across the top (sources, ingestion, storage, analysis, visualization), the components under the phase they belong to, the boundary of the cluster they run in, and the services that span all of it. It is an overview: one box per product, no internals.

## Composition

- Title at 40,52 (`style=h1`); the banner below it. Columns: four to six phases, each 224 wide, from x=40. Column n (from 0) has its centre at `152 + 224*n`. The columns end at `x = 40 + 224*phases`: 1160 for five.
- Phase banner at y=88: one chevron per column, drawn as a polygon 232 wide and 32 high so that each tip reaches into the notch of the next.

```
p1: polygon "DATA SOURCES" at 40,88  points=0,0;216,0;232,16;216,32;0,32       fill=accent/0.14 stroke=none title.color=accent title.font=mono title.size=8 overlap=ok
p2: polygon "INGESTION"    at 264,88 points=0,0;216,0;232,16;216,32;0,32;16,16 fill=ink/0.06 stroke=none title.color=muted title.font=mono title.size=8 overlap=ok
```

  The first has a flat left end, the last a flat right end (`points=0,0;224,0;224,32;0,32;16,16`). Alternate a tint of the accent (`fill=accent/0.14 title.color=accent`) and a light grey (`fill=ink/0.06 title.color=muted`); never a solid dark fill. Never leave the banner out: it is what tells the reader what a column means.
- Every component is a 144x64 `node` (write the size when it differs) centred under its phase: `x = 80 + 224*n`. Boxes in one phase stack with 48px between them (pitch 112): rows at y=240 and 352 under an orchestrator, 176 and 288 without one.
- Sources are outside the cluster: a dashed zone under the first chevron, `zone "Sources" at 48,136 208xH dash=4,3`, holding a column of `external` boxes 160x56 at x=72 (zone x + 24), 16 apart, the first 36px below the zone's top: `y = 172 + 72*i`. Size the zone to the last box plus 36.
- The cluster is a zone over the other columns, `dash=none` to make it solid: `zone "Kubernetes cluster" at 272,136 888xH dash=none`, `W = 224*(phases-1) - 8`, the same height as the sources zone (the taller of the two sets).
- An orchestrator or scheduler is a wide `cloud` box across the top of the cluster, 24px below its top edge and 16px in from its sides, 48 high. Components start 32px below it. With no orchestrator they start 40px below the zone's top (y=176).
- A service that applies to everything (identity, monitoring) is a `cloud` box as wide as all the columns (`WxH` 1120x48 for five), 24px under the zones. It is outside the cluster and has no arrows. One row per service, 24px apart.
- Place the main row so that the busiest arrows are straight: the ingestion box level with the box it feeds, and a box fed by two others half-way between them.

## Arrows

- Data moves left to right: out of the right side, into the left side. No labels: the banner and the box names carry the meaning.
- One box, usually the storage hub, is `focal`. The arrows into and out of it use `style=primary` (two at most). Other data arrows are plain.
- From the orchestrator: a straight dashed drop onto the top of each box it triggers, `air.bottom@824 -> model.top@824 style=return`, where 824 is the centre x of the target. Give the x on both ends so the drop cannot bend.
- A read-back between two stacked boxes is one dashed two-way line: `trino <-> minio style=return`.
- Several sources into one box: they are spread along the side for you, but then bend unevenly; give every arrow its own point. Send the upper ones into the left side (`web.right -> nifi.left@256`, `ftp.right -> nifi.left@272`, 16 apart, one of them level with its source so it is straight) and the lower ones up into the bottom (`dbc.right -> nifi.bottom@352`, `legacy.right -> nifi.bottom@400`).
- No box sends out more than three arrows. If one seems to need more, it is the hub: make it the focal box and route through it.

## Icons

One icon per component says what kind of thing it is (`icon=queue` broker, `icon=database` store, `icon=pipeline`, `icon=monitoring`, `icon=user`), on every box of the diagram or none. The `sub=` line then carries the product. In a 144-wide box the name must stay under about 12 characters beside an icon, or the box takes `icon.pos=top` and 80 high.

## Legend

`legend at 40,Y` 24px under the last full-width box: `external=`, `focal=`, `cloud=` ("spans every phase"), `primary=`, `arrow=`, `return=`, and `node=`/`store=` if you used them as different things. The zones and the banner explain themselves.
