# Dependency graphs

Shows what depends on what among packages, modules or services. Draw it when the data has something a tree cannot show: a box that several others depend on, or a cycle. If every box has one parent and nothing points back, draw a tree.

## Composition

- Rank the boxes first. Rank 0 is what nothing depends on (the apps); a box sits one rank below the lowest thing that depends on it. Four ranks at most, nine boxes at most, fourteen arrows at most. Over that, fold a group of leaves into one box named "+6 leaves".
- Ranks are rows, rank 0 on top (first row at y=96, under the title `text "..." at 40,52 style=h1`): boxes `160x64` (write the size on every box; the default is 144x64), rows 144px apart (80px of free space between rows, for bends). Name each row at the left margin: `text "Rank 0" at 40,<row y + 36> style=eyebrow`.
- Columns: three, 240px apart (x = 180, 420, 660 on a 1000px canvas). A box goes in the column of the thing it mostly depends on or is depended on by, so that as many arrows as possible are straight vertical lines. Leave a cell empty rather than force a bend; a straight arrow may pass through an empty cell.
- The box that most others depend on goes in the middle column, with the boxes that use it on both sides above it. That box is `focal`.
- One box per package or service, never per file. `sub=` is its path (`packages/ui-kit`) or, for a third-party one, version and registry (`v3.23 · npm`). `tag=` is its kind (APP, SVC, PKG, EXT).
- Styles: `node` for your own, `cloud` for third party, `focal` for the most used. Nothing else: a box that depends on nothing is shown by sitting on the lowest rank, not by a style (`store` means data, and many looks draw it as a cylinder).
- Icons are optional here; `icon=` on the kind (`pod` or `service` for SVC, `bucket` for PKG, `cloud` for EXT) only if every box gets one.
- Every box shows how many depend on it, in its top-right corner, including "0 in" on the apps: `rect "4 in" at <box right − 36>,<box top + 8> 28x12 radius=2 fill=none stroke=ink/0.4 sw=0.8 title.font=mono title.size=8 title.weight=400 overlap=ok`. These counts are why the diagram exists; do not leave them out. `overlap=ok` is needed because the chip sits on its box. On the `focal` box an outlined chip is unreadable: write the count as plain text instead, `text "4 in" at <box right − 22>,<box top + 17> style=small size=8 color=#ffffff anchor=middle`.

## Arrows

An arrow points from the dependent to what it depends on: downward, or sideways within a rank. Never upward, except the one cycle.

Do not let FastDraw choose the sides here. With several arrows on one side it spreads them, and a straight arrow gets a kink. Name the side and the x of every end:

```
web.bottom@260 -> api.top@260                              // straight: same x at both ends
web.bottom@300 -> uikit.top@680 via=300,188;680,188        // bend at y=188
admin.bottom@700 -> api.top@300 via=700,212;300,212        // crosses it; bends at y=212, 24px lower
```

- The straight arrow uses the centre of the box. A bent one leaves 40px to the side of the centre, on the side it is heading for, and arrives 40 to 60px from the centre of its target.
- Two bent arrows in the same gap between rows bend at different heights, at least 24px apart, unless their horizontal parts do not share any x. Two arrows may cross once at a right angle; they may never run along each other. No two ends within 20px of each other on one side.
- No labels on ordinary arrows. The direction is the meaning.

## The cycle

Show one cycle at most, the one that matters. Draw its back arrow with `style=primary` and label it: `utils.top@540 -> shared.bottom@540 "cycle" style=primary`. When the two boxes are stacked, run it beside the forward arrow, 40px to its right. Otherwise take it round the outside of the graph with `via=`, never between other boxes. With `focal` on the most-used box, that is both uses of the accent.

## Legend

One `legend at 40,Y` 24px under the last row (the box bottom + 24 = 616): each box style used, `arrow="Depends on"`, `primary="Closes a cycle"`. Canvas height = Y + 72.
