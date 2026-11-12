# Treemaps

Shows how one total divides into parts: each part is a rectangle whose area is its share. The reader sees what dominates and by how much. The marimekko variant splits the total two ways at once.

FastDraw has no treemap element. Each cell is a plain `rect` at coordinates you work out, with its labels as free text on top.

## Building blocks

```
// canvas 1000x580, title at y=52. Whole = 916x380 at 40,96. Asia: 59% of the area = the full height and 59% of the width, less the gap
title: text "Asia holds 59% of the world's people" at 40,52 style=h1
asia: rect at 40,96 532x380 radius=2 fill=accent/0.16 stroke=accent sw=1.5
text "Asia" at 56,124 size=14 weight=600 color=ink                      // 16px in from the left, baseline 28px down
text "4.78B · 59% of world" at 56,144 style=small color=muted          // 20px below the name

africa: rect at 576,96 252x252 radius=2 fill=ink/0.16 stroke=ink/0.3
text "Africa" at 592,124 size=13 weight=600 color=ink
text "1.48B · 18%" at 592,144 style=small color=muted

legend at 40,500 swatch.accent/0.16="Asia · more than the rest together" swatch.ink/0.16="Other continents" title="Area = population · 8.09B in total"
```

## Composition

- Canvas 1000x580. The whole is a rectangle of 916x380 at 40,96; the legend goes at y=500.
- Four to eight cells. Merge a long tail into one cell called "Other" and say in the legend what is in it. Never drop a part: the picture claims to be the whole.
- Layout, largest first, in strips. The free rectangle starts as the whole. Lay each strip along the shorter side of the free rectangle: a column at its left edge when it is wider than tall, a row at its top otherwise. Put the next part in the strip, and keep adding parts while the cells get closer to square (usually one to three per strip).
  - Strip thickness = (strip's share / share of everything still free) x the free rectangle's length across the strip.
  - A cell's length along the strip = (its share / strip's share) x the strip's length.
  - Then the strip leaves the free rectangle; repeat in what is left until the last part fills it.
  - Gap: take 4px off the right and bottom of every cell, never off the outer edge of the whole. The next strip starts at the previous cell's edge plus 4.
- Cells will not land on multiples of 4. `check` hints at this; leave those hints: areas must follow the data.
- Check the arithmetic after placing: each cell's `width x height` divided by the sum of all cell areas must be within a few percent of its share. The smallest cell is the one that goes wrong; check it first.
- Long thin stripes cannot be compared by eye. Never enlarge a cell to make its label fit.

## Colour

- One cell, the one the diagram is about, is `fill=accent/0.16 stroke=accent sw=1.5`. It need not be the largest.
- All others are `stroke=ink/0.3` with `fill=ink/OPACITY` stepping down by rank from 0.16 (largest) to 0.04 (smallest). Not above 0.16: the value text is `muted` and gets hard to read on a darker cell. No colour per cell.

## Text

- Labels sit in the top-left corner of the cell. Name: `size=14 weight=600 color=ink` (13 or 12 in smaller cells). Under it, in `small`: the amount and the share.
- Cells at least 120px wide and 60px high carry name and value. A smaller cell that still fits a short word carries the name only. A sliver (under about 40px either way) gets no text: put a small dot in it (`ellipse 8x8 fill=ink stroke=none`) and explain the dot in the legend with the part's name and value (`dot.ink="Oceania · 0.05B, 0.6%"`).
- Work out the width of every name (about 8px per character at size 13) and make sure it ends at least 12px before the cell's right edge.

## Marimekko

Two splits at once: column width is one share (pipeline), the segments inside a column are the other (runner type).

```
// column "web": 31% of the total, so 31% of the width less the 4px gap; segments = share within the column of 380px
w1: rect at 40,96 280x258 radius=2 fill=ink/0.16 stroke=ink/0.3        // Linux, 68% of 380
w2: rect at 40,354 280x46 radius=2 fill=ink/0.10 stroke=ink/0.3        // macOS, 12%
w3: rect at 40,400 280x76 radius=2 fill=ink/0.05 stroke=ink/0.3        // Windows, 20%
text "web · 31%" at 180,492 style=small color=muted anchor=middle      // under the column: name and share of the whole
```

- Three to eight columns, two to five segments. Every column has the full height. Columns are 4px apart; segments in a column touch.
- The segment order is the same in every column, largest overall on top, and each kind of segment has one fill everywhere (`ink/0.16`, `0.10`, `0.05`), so the legend needs one entry per kind. One segment takes the accent.
- A kind that does not occur in a column is left out there, not drawn with zero height.
- Each segment at least 56px high carries its name and `amount · share of column`; from 32px, the same on a tighter pitch (baselines 20 and 34px down); below that, nothing or a dot.
- Segment heights follow the data and will not be multiples of 4. `check` hints at this; leave those hints.

## Legend

One `legend` statement, 24px under the lowest element: `legend at 40,500 swatch.accent/0.16="Asia · more people than the rest together" swatch.ink/0.16="Other continents · a stronger tint is a larger share" dot.ink="Oceania · 0.05B, too small to label" title="Area = population · 8.09B in total"`. The heading says what area means and the total. For the marimekko the column names sit lower: legend at y=512 and canvas 590. The tint after the slash is the fill of the cells.
