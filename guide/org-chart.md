# Org charts

Shows who owns what: people, teams or agents, whom they report to, and how to reach them. For a hierarchy of things rather than owners, use the tree guide.

## Composition

- Build it like a tree (see `fastdraw guide tree`): rows 148px apart, leaves placed first, each parent centred over its own people.
- Top row: the one owner or front door that takes work nobody else claims. It is the only `focal` box. Make it wide enough for its `sub=` (200 to 224).
- Middle row: teams, pods or queues, as `node` boxes 160x48.
- Bottom row: the people or agents who do the work, as `cloud` boxes 136x56, 24px apart.
- An owner that is planned, vacant or not reachable yet is drawn with `optional` (dashed), in its place in the chart. Do not leave it out and do not draw it as if it were live: the gaps are what readers look for.
- Limits: 12 boxes, four rows, five reports under one parent. If a parent has more, add a grouping row or split the chart.

## Text

- Main text is the name of the person, role or team.
- `sub=` is how to reach them or what they cover: a handle, a queue, or two to four words of scope. Not a job description.
- Name each row at the left margin with an eyebrow text, and separate the rows with rule lines 28px under each row of boxes:

```
text "Command center" at 40,88 style=eyebrow
40,172 -- 1000,172 style=rule
text "Workstreams" at 40,196 style=eyebrow      // 24px under the rule
```

  The row name sits above the left end of its row. Keep every bus and drop line at least 8px away from it.

## Reporting lines

- Same construction as a tree: a trunk from the parent, a horizontal bus, one drop per report, all plain lines with square corners. Put the bus 36px above the row it feeds, under the rule line.
- A parent with one report gets a single straight line: `content.bottom -- rory.top`.
- Reporting lines carry no labels and no arrowheads.

## Rules that are not reporting lines

Escalation paths, approval rules and known gaps are not boxes in the hierarchy. Put them in one strip under the chart, as wide as the bottom row, 32px below it:

```
gaps: optional "Setup gaps stay visible" sub="approval gates · name mismatches" at 52,480 936x48
```

Two such strips at most.

## Legend

One `legend at 40,Y` statement 32px under the last strip, with an entry for each box style used. Say what dashed means.
