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

- Three to five tiers in one row, left to right in the order data is promoted. All tops at y=176, all 208 wide, 24 apart: `x = 40 + 232*n`. Five tiers need a 1216px canvas.
- Keep every value to 21 characters or fewer. A longer cell makes that table wider than the 208 you gave and it runs into its neighbour (`check` reports the overlap).
- Always end with a "Holds" block under a `| ---` line: two concrete examples of what is in the tier. Without it the diagram is abstract.
- One tier, the one consumers query, is the focus: `stroke=accent fill=accent/0.08` on its table. An archive or retention tier is dashed and greyed: `dash=4,3 fill=ink/0.05`. No other tier is styled.
- Optional row of one or two wide boxes under the tiers (48px below the tallest table, 64 high) for the ways data is written between tiers: `cloud "Trino INSERT INTO … SELECT" sub="filter · join · aggregate" tag="SQL"`. Together they span the full width with a 24px gap. They describe methods, not tiers.

## Arrows

- A promotion is an arc over the top, from the top centre of one tier to the top centre of the next: `raw.top@0.5 -> anon.top@0.5 "mask ids" route=curve`. Write `@0.5` on both ends; without it the arrows that share a top edge are spread apart and the arcs come out uneven.
- The arcs rise about 70px and the label sits above the arc, so leave 96px clear above the tiers (title baseline at y=60, tiers at y=176).
- Labels are one verb or two short words, 14 characters at most: "aggregate", not "calculate and summarize".
- The promotion into the focal tier uses `style=primary`. A move done by a retention or lifecycle rule uses `style=return`. The rest are plain arrows.
- Promotions only go left to right, to the next tier. If data flows back, this is the wrong kind of diagram.

## Legend

`legend at 40,Y` 24px under the lowest element: `focal=` for the focal tier, `optional=` for the archive tier (their swatches match the overrides above), `arrow=`, `primary=`, `return=`, and `cloud=` if you drew method boxes.
