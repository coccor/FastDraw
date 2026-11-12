# High-level diagrams

Shows a whole data stack on one page: phases across the top (sources, ingestion, storage, analysis, visualization), the components under the phase they belong to, the boundary of the cluster they run in, and the services that span all of it. It is an overview: one box per product, no internals.

## Composition

- Columns: four to six phases, each 224 wide, from x=40. Column n has its centre at `152 + 224*n`. Five phases need a 1200px canvas.
- Phase banner at y=88: one chevron per column, drawn as a polygon 232 wide and 32 high so that each tip reaches into the notch of the next.

```
p1: polygon "DATA SOURCES" at 40,88  points=0,0;216,0;232,16;216,32;0,32       fill=ink   stroke=none title.color=#ffffff title.font=mono title.size=8 overlap=ok
p2: polygon "INGESTION"    at 264,88 points=0,0;216,0;232,16;216,32;0,32;16,16 fill=muted stroke=none title.color=#ffffff title.font=mono title.size=8 overlap=ok
```

  The first has a flat left end, the last a flat right end (`points=0,0;224,0;224,32;0,32;16,16`). Alternate `fill=ink` and `fill=muted`. Never leave the banner out: it is what tells the reader what a column means.
- Every component is centred under its phase: a 144-wide box in column n is at `x = 80 + 224*n`. Two boxes in one phase stack, 64px apart.
- Sources are outside the cluster: a dashed zone under the first chevron, `zone "Sources" at 48,136 208xH dash=4,3`, holding a column of `external` boxes 160x56, 16 apart, the first 36px below the zone's top.
- The cluster is a solid zone over the other columns: `zone "Kubernetes cluster" at 272,136 888xH`, with the same height as the sources zone.
- An orchestrator or scheduler is a wide `cloud` box across the top of the cluster, 24px below its top edge and 16px in from its sides, 48 high. Components start 32px below it.
- A service that applies to everything (identity, monitoring) is a `cloud` box of the full canvas width, 48 high, 24px under the zones. It is outside the cluster and has no arrows. One row per service.
- Place the main row so that the busiest arrows are straight: the ingestion box level with the box it feeds, and a box fed by two others half-way between them.

## Arrows

- Data moves left to right: out of the right side, into the left side. No labels: the banner and the box names carry the meaning.
- One box, usually the storage hub, is `focal`. The arrows into and out of it use `style=primary` (two at most). Other data arrows are plain.
- From the orchestrator: a straight dashed drop onto the top of each box it triggers, `air.bottom@824 -> model.top@824 style=return`, where 824 is the centre x of the target. Give the x on both ends so the drop cannot bend.
- A read-back between two stacked boxes is one dashed two-way line: `trino <-> minio style=return`.
- Several sources into one box: give every arrow its own point, or they are drawn on top of each other. Send the upper ones into the left side (`web.right -> nifi.left@256`, `ftp.right -> nifi.left@272`, 16 apart, one of them level with its source so it is straight) and the lower ones up into the bottom (`dbc.right -> nifi.bottom@352`, `legacy.right -> nifi.bottom@400`).
- No box sends out more than three arrows. If one seems to need more, it is the hub: make it the focal box and route through it.

## Legend

`legend at 40,Y` 24px under the last full-width box: `external=`, `focal=`, `cloud=` ("spans every phase"), `primary=`, `arrow=`, `return=`. The zones and the banner explain themselves.
