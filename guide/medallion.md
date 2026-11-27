# Medallion diagrams

Shows the tiers a dataset is stored in, from raw landing to curated marts to cold archive: what each tier holds, who writes it with what tool and format, and how data is promoted from one tier to the next. For the systems around the storage, draw a high-level diagram instead.

## Composition

- Each tier is a `table`: the tier name is its header, and its rows are the same facts in the same order for every tier, so the reader can compare across.

```
agg: table "Aggregated" at 736,176 208x0 stroke=accent fill=accent/0.08
  | "Bucket" "analytics-marts"
  | "Tool"   "Trino INSERT"
  | "Format" "Iceberg · metrics"
  | "Writer" "Data Scientist"
  | ---
  | "Holds"  "daily conversion rate"
  | ""       "revenue by channel"
```

- Title at 40,52 (`style=h1`). Three to five tiers in one row, left to right in the order data is promoted. All tops at y=176, all 208 wide, 24 apart: `x = 40 + 232*n` for tier n from 0. The tiers end at `x = 16 + 232*tiers`: 712 for three, 944 for four, 1176 for five.
- Keep every value to 21 characters or fewer. A longer cell makes that table wider than the 208 you gave and it runs into its neighbour (`check` reports the overlap).
- Always end with a "Holds" block under a `| ---` line: two concrete examples of what is in the tier. Without it the diagram is abstract.
- One tier, the one consumers query, is the focus: `stroke=accent fill=accent/0.08` on its table. An archive or retention tier is dashed and greyed: `dash=4,3 fill=ink/0.05`. No other tier is styled.
- A table is 32 high for its header plus 24 per row (the `| ---` line adds none): four facts and two "Holds" rows make 32 + 6*24 = 176, so the tiers end at y=352. Tiers with the same row count end together.
- Optional row of one or two wide boxes under the tiers, 48pt below their bottom edge (y=400 for the table above), 64 high, for the ways data is written between tiers: `cloud "Trino INSERT INTO … SELECT" sub="filter · join · aggregate" tag="SQL" at 40,400 WxH`. For m boxes the width is `(T - 24*(m-1)) / m`, where T = `232*tiers - 24` is the width of the tier row: 440 each for two under four tiers. They describe methods, not tiers.

## Arrows

- A promotion is an arc over the top, from the top of one tier to the top of the next: `raw.top@0.65 -> anon.top@0.35 "mask ids" route=curve`. Give every arc its own points: leave at `@0.65` of the tier it starts from and arrive at `@0.35` of the next A middle tier then has its arriving arc left of centre and its leaving arc right of it, and they do not pinch together. The first tier may leave and the last arrive at `@0.5`.
- The arcs rise about 70pt and the label sits above the arc, so the tiers start at y=176 with the title at y=52 above them.
- Labels are one verb or two short words, 14 characters at most: "aggregate", not "calculate and summarize".
- The promotion into the focal tier uses `style=primary`. A move done by a retention or lifecycle rule uses `style=return`. The rest are plain arrows.
- Promotions only go left to right, to the next tier. If data flows back, this is the wrong kind of diagram.

## Legend

`legend at 40,Y` 24pt under the lowest element (y=488 under the method boxes, 376 under the tiers): `swatch.accent/0.1=` for the focal tier (its tint matches the table; `focal=` would show a solid swatch), `optional=` for the archive tier, `arrow=`, `primary=`, `return=`, and `cloud=` if you drew method boxes.
