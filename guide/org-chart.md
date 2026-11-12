# Org charts

Shows who owns what: people, teams or agents, whom they report to, and how to reach them. For a hierarchy of things rather than owners, use the tree guide.

## Composition

- Build it like a tree (see `fastdraw guide tree`): leaves placed first, each parent centred over its own reports. Title at `40,52` (`style=h1`). Rows are 148px apart: top row y=104, middle row y=252, bottom row y=400. Write `WxH` on every box.
- Top row: the one owner or front door that takes work nobody else claims. It is the only `focal` box. Make it wide enough for its `sub=` (200 to 224 wide, 48 tall).
- Middle row: teams, pods or queues, as `node` boxes 160x48.
- Bottom row: the people or agents who do the work, as `cloud` boxes 136x56, 24px apart.
- An owner that is planned, vacant or not reachable yet is drawn with `optional` (dashed), in its place in the chart. Do not leave it out and do not draw it as if it were live: the gaps are what readers look for.
- Limits: 12 boxes, four rows, five reports under one parent. Count boxes, not heads: when the people are not the point, the bottom row holds squads or teams (one `cloud` box each, head count in `sub=`: "4 engineers"). If a parent has more reports, add a grouping row or split the chart.

## Text

- Main text is the name of the person, role or team.
- `sub=` (small sans) is how to reach them or what they cover: a handle, a queue, or two to four words of scope. Not a job description.
- Name each row at the left margin with an eyebrow text, and separate the rows with rule lines 28px under each row of boxes (`--`):

```
text "Command center" at 40,96 style=eyebrow    // 8px above the first row's top edge
40,180 -- 1000,180 style=rule                    // 28px under the row's boxes
text "Workstreams" at 40,204 style=eyebrow       // 24px under the rule
40,328 -- 1000,328 style=rule
text "Specialists" at 40,352 style=eyebrow
```

  The row name sits above the left end of its row. Keep every bus and drop line at least 8px away from it.

## Reporting lines

- Same construction as a tree: plain lines with square corners, no labels, no arrowheads. Write `--` with `style=relation`, and give every report the same start point on the parent: `athena.bottom@0.5 -- growth.top style=relation`. The bus draws itself half-way between the rows.
- A parent with one report gets a single straight line: `content.bottom -- rory.top style=relation`. Centre them on each other.
- Centre every parent over its reports (the mean of its first and last report's centre x), or its line jogs.

## Rules that are not reporting lines

Escalation paths, approval rules and known gaps are not boxes in the hierarchy. Put them in one strip under the chart, as wide as the bottom row, 32px below it:

```
gaps: optional "Setup gaps stay visible" sub="approval gates · name mismatches" at 52,488 936x48
```

Two such strips at most.

## Legend

One `legend at 40,Y` statement 32px under the last strip (Y=568), with an entry for each box style used. Say what dashed means. The canvas is Y + 70 tall.
