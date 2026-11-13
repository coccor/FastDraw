# Line charts

Shows how a number changes over time or along an ordered scale: signups per week, latency per release. The reader looks at direction and steepness. Four variants at the end cover two-state comparisons (slopegraph), rank changes (bump), distributions (ridgeline) and a total with its parts (streamgraph).

## Building blocks

```
// Title at y=52, plot 96,96 to 960,412. The series the chart is about is written last, so it is drawn on top
title: text "Signups grew every week" at 40,52 style=h1
sig: chart at 96,96 864x316 x="W1,W2,W3,W4" y=0..240 step=40 key=0 ytitle="Signups per week"
  | line "Referral" 45 52 48 60 stroke=soft sw=1.5
  | line "Direct" 80 82 88 90 stroke=muted sw=1.5
  | area "Organic" 120 135 148 162 stroke=accent fill=accent/0.08 dots=1
text "Organic · 162" at 852,188 size=11 weight=600 color=accent anchor=end
text "Direct" at 852,283 size=10 color=muted anchor=end
text "Referral" at 852,323 size=10 color=soft anchor=end
legend at 40,464 line.accent="Organic" line.muted="Direct" line.soft="Referral"
```

## Composition

- Title at y=52, plot `at 96,96 864x316` (tick labels end near y=440), legend at y=464. Move the legend 20px lower if there is an `xtitle=`.
- Four to twelve points per line. With more, sum them into longer periods.
- Five lines at most. One is the subject: `stroke=accent`, default width, `dots=1`. The others are `stroke=muted`, `soft` or `ink/0.5` with `sw=1.5` and no dots.
- Use `area` instead of `line` for the subject only when the amount under the line means something (a volume, a count). Give it `fill=accent/0.08`; the default tint is heavy and dulls the lines under it.
- `y=0..N` when the size of the number matters. A range that starts above 0 is allowed only for a quantity with no natural zero, and then say so in `ytitle=`.
- A missing value is `_`, which breaks the line. Do not bridge it.
- The chart joins points with straight segments. Keep it so: a smoothed curve shows highs and lows between samples that nobody measured.

## Text

- Name each line at its right end, right-aligned to the last point: `anchor=end`, size 10 or 11, in the line's colour. The last point of n categories is at `x = 96 + 864 * (n - 0.5) / n` (852 for four, 906 for eight); its height is `y = 412 - value / ymax * 316`. Put the baseline 10px above that.
- Two lines that end closer than 14px (a few units, `14 / 316 * ymax`) would put their labels on top of each other. Keep the upper label 10px above its point and put the lower one below its point (baseline 16px under it). Do not move the lines. If three end together, name the third in the legend only.
- Write the latest value of the subject line in its label. Do not use `labels=1` with several lines; the numbers pile up.

## Slopegraph

Two states (before and after), four to ten things, one straight line each. The reader compares slopes. Use a chart with two categories and hide its own axes:

```
// y 100..550 over 320px: value v is at y = 416 - (v - 100) * 320 / 450. The two states are at x=350 and x=650
350,96 -- 350,416 stroke=ink/0.25 layer=back                 // the two state rules, behind the lines
650,96 -- 650,416 stroke=ink/0.25 layer=back
sl: chart at 200,96 600x320 x="Before,After" y=100..550 yaxis=0 grid=0 key=0 stroke=none tick.size=10
  | line 512 208 stroke=ink/0.7 sw=1.2 dots=1
  | line 238 431 stroke=accent sw=2.5 dots=1               // the subject last
text "Search" at 290,127 anchor=end size=11 color=ink         // name, then value, left of the left rule
text "512" at 338,127 anchor=end style=small color=muted
text "431" at 662,185 style=small color=muted                 // value, then name, right of the right rule
text "Recommender" at 694,185 size=11 weight=600 color=ink
```

- With two categories the points are a quarter and three quarters of the way across the chart box.
- Label both ends of every line with name and value, baseline 4px below the point. Where two labels on one side are closer than 14px, shift them apart evenly and leave the dots where they are.
- Both sides share one scale; that is why it is one chart. State the range in the legend heading when it does not start at 0 (`title="p95 in ms · scale 100 to 550"`).
- Keep each label wholly outside or wholly inside the chart box. A text that crosses its edge is reported as an overlap.

## Bump chart

Ranks at three to six moments. The same construction with more categories. The y range must run upwards, so plot `ranks + 1 - rank` to put rank 1 on top:

```
bp: chart at 320,96 480x336 x="Q1,Q2,Q3,Q4" y=0.5..6.5 step=10 yaxis=0 grid=0 key=0 stroke=none tick.size=10
  | line 5 4 4 5 stroke=ink/0.6 sw=1.2 dots=1      // ranks 2, 3, 3, 2
  | line 6 5 3 1 stroke=accent sw=2.5 dots=1       // ranks 1, 2, 4, 6
```

- With `y=0.5..N+0.5`, rank r is at `plot y + plot height * (r - 0.5) / N`: 56px rows here.
- Left of the first column: the name (`anchor=end`, outside the chart box) and `#1`, `#2` ... in `small`. Right of the last column: the same in final order. Every rank at every moment is taken by exactly one line.
- Never bend a line off its row to make room for a label.

## Ridgeline

One distribution per row, rows overlapping, to compare shapes. Each row is its own small chart with one `area`; all share width, height and `y=` range, so heights compare:

```
// rows 56px apart, each 120px high, so a peak may reach into the row above but not two rows up
r1: chart at 320,96 384x120 y=0..50 yaxis=0 grid=0 key=0 stroke=none overlap=ok
  | area 0 22 30 18 9 5 2 1 0 0 0 0 0 stroke=ink/0.7 sw=1 fill=ink/0.1
r2: chart at 320,152 384x120 y=0..50 yaxis=0 grid=0 key=0 stroke=none overlap=ok
  | area 0 5 24 31 16 7 3 1 1 0 0 0 0 stroke=ink/0.7 sw=1 fill=ink/0.1
320,216 -- 704,216 stroke=ink/0.6 sw=1                       // the baseline of r1: its y + height
text "static-cdn" at 304,220 anchor=end size=11 color=ink
```

- Three to eight rows. The subject row takes `stroke=accent sw=2 fill=accent/0.15`.
- The rows end at the last row's y + 120 + 64 (its tick labels and the scale name); the legend goes 24px lower.
- Only the last chart has `x="0,,,120,,,240"`: one entry per bin, empty where no tick label is wanted. Name the scale in a `small` text under it.
- Order the rows by something you can state (median, peak position) and say it in the legend heading.

## Streamgraph

A total and its parts over many periods, drawn as bands around a centre line. Three to five layers. The chart does not stack areas, so give it the boundaries: for each period, add the layers up from the bottom, and shift each period so the stack is centred on the same level.

```
// boundaries from the top one down; each area paints over the ones before it; the last, in paper colour, clears below the stream
st: chart at 60,96 880x320 x="W01,W02,W03,W04" y=0..200 yaxis=0 grid=0 key=0 stroke=none
  | area 140 142 146 152 fill=soft   stroke=paper sw=1      // top of the top layer
  | area 130 133 138 143 fill=accent stroke=paper sw=1
  | area 120 120 118 116 fill=ink    stroke=paper sw=1
  | area 80 78 75 72     fill=muted  stroke=paper sw=1
  | area 60 58 54 48     fill=paper  stroke=paper sw=1      // bottom of the stream
```

- Bottom boundary of a period = `centre - total / 2`; each boundary above adds one layer's value. Keep `y=` starting at 0 and all boundaries above 0.
- Fills must be solid colours (`ink`, `muted`, `soft`, `accent`, a `#hex` grey). A see-through fill would mix with the layers painted under it.
- The largest layers go in the middle, the layer order never changes, and one layer takes the accent. A layer that is zero for a while pinches shut; leave it.
- There is no y axis: thickness is read, not position. Put totals in the legend entries (`swatch.accent="End-to-end · 688 min"`).

## Legend

`legend at 40,464` (24px under the lowest element) with one `line.COLOUR=` entry per line (`swatch.COLOUR=` for ridgeline and streamgraph). The subject comes first and its entry says why it matters.
