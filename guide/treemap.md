# Treemaps

Shows how one total divides into parts: each part is a rectangle whose area is its share. The reader sees what dominates and by how much. The marimekko variant splits the total two ways at once.

FastDraw has no treemap element. Each cell is a plain `rect` at coordinates you work out, with its labels as free text on top.

## Building blocks

```
// whole = 916x380 at 40,40. Asia: 59% of the area = the full height and 59% of the width, less the gap
asia: rect at 40,40 532x380 radius=2 fill=accent/0.16 stroke=accent sw=1.5
text "Asia" at 56,68 size=14 weight=600 color=ink                      // 16px in from the left, baseline 28px down
text "4.78B · 59% of world" at 56,88 style=small color=muted           // 20px below the name

africa: rect at 576,40 252x252 radius=2 fill=ink/0.16 stroke=ink/0.3
text "Africa" at 592,68 size=13 weight=600 color=ink
text "1.48B · 18%" at 592,88 style=small color=muted
```

## Composition

- Canvas 1000x520. The whole is a rectangle of 916x380 at 40,40; the legend rule goes at y=444.
- Four to eight cells. Merge a long tail into one cell called "Other" and say in the legend what is in it. Never drop a part: the picture claims to be the whole.
- Layout, largest first: the largest part takes a strip across the short side of the free rectangle (its full height, and a width equal to its share of the area). Repeat in the rectangle that is left, each time filling a row or column along its shorter side with the next few parts so that cells stay close to square. Long thin stripes cannot be compared by eye.
- Leave 4px between cells. Take the gap out of the cells, not out of the whole.
- Check the arithmetic after placing: each cell's `width x height` divided by the sum of all cell areas must be within a few percent of its share. The smallest cell is the one that goes wrong; check it first.
- Never enlarge a cell to make its label fit.

## Colour

- One cell, the one the diagram is about, is `fill=accent/0.16 stroke=accent sw=1.5`. It need not be the largest.
- All others are `stroke=ink/0.3` with `fill=ink/OPACITY` stepping down by rank from 0.16 (largest) to 0.04 (smallest). Not above 0.16: the value text is `muted` and gets hard to read on a darker cell. No colour per cell.

## Text

- Labels sit in the top-left corner of the cell. Name: `size=14 weight=600 color=ink` (13 or 12 in smaller cells). Under it, in `small`: the amount and the share.
- Cells at least 120px wide and 60px high carry name and value. A smaller cell that still fits a short word carries the name only. A sliver (under about 40px either way) gets no text: put a small dot in it (`ellipse 8x8 fill=ink stroke=none`) and explain the dot in the legend with the part's name and value.
- Work out the width of every name (about 8px per character at size 13) and make sure it ends at least 12px before the cell's right edge.

## Marimekko

Two splits at once: column width is one share (pipeline), the segments inside a column are the other (runner type).

```
// column "web": 31% of the total, so 31% of the width less the 4px gap; segments = share within the column of 380px
w1: rect at 40,40 280x258 radius=2 fill=ink/0.16 stroke=ink/0.3        // Linux, 68% of 380
w2: rect at 40,298 280x46 radius=2 fill=ink/0.10 stroke=ink/0.3        // macOS, 12%
w3: rect at 40,344 280x76 radius=2 fill=ink/0.05 stroke=ink/0.3        // Windows, 20%
text "web · 31%" at 180,440 style=small color=muted anchor=middle      // under the column: name and share of the whole
```

- Three to eight columns, two to five segments. Every column has the full height. Columns are 4px apart; segments in a column touch.
- The segment order is the same in every column, largest overall on top, and each kind of segment has one fill everywhere (`ink/0.16`, `0.10`, `0.05`), so the legend needs one entry per kind. One segment takes the accent.
- A kind that does not occur in a column is left out there, not drawn with zero height.
- Each segment at least 56px high carries its name and `amount · share of column`; from 32px, the same on a tighter pitch (baselines 20 and 34px down); below that, nothing or a dot.
- Segment heights follow the data and will not be multiples of 4. `check` hints at this; leave those hints.

## Legend

By hand, because the cells are not styles of the look: a `rule` line at y=444; "Legend" in `eyebrow` at y=464 and, right-aligned on the same line, what area means and the total (`"Area = population · 8.09B in total"`); at y=478 a 20x12 rect in the focal fill and one in the plain fill, each with a `caption`, then the dot with the name and value of any part too small to label.
