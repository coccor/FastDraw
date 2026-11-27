# Scatter plots

Shows how two measured numbers relate across a set of things: one dot per thing. The reader looks for a trend, clusters and outliers. Two variants: bubble (a third number as dot size) and beeswarm (one number, every item shown).

## Building blocks

```
// title at y=52, plot 96,96 to 960,412: 43.2pt per x unit, 13.17pt per y unit
title: text "Teams that deploy often wait least" at 40,52 style=h1
dora: chart at 96,96 864x316 x=0..20 xstep=4 y=0..24 step=6 grid=both key=0 xtitle="Deploys per week" ytitle="Lead time (days)"
  | line 1,20 20,1 stroke=ink/0.3 sw=1 dash=4,3                               // trend, written first so dots cover it
  | dots "Other teams" 2,20 4,18 4,16 6,14 8,12 fill=muted r=5 opacity=0.55
  | dots "Platform team" 18,3 fill=accent r=6                                 // the subject, written last
text "Platform" at 874,394 anchor=middle size=11 weight=600 color=accent
legend at 40,480 dot.accent="Platform team · ships most often" dot.muted/0.55="Other teams" line.soft="Trend"
```

- A numeric x axis (`x=lo..hi`) makes every point an `x,y` pair. `grid=both` draws grid lines both ways.
- The plot ends at y=412. Under it come the tick labels (28pt) and `xtitle=` (16pt more), so the legend goes at y=480.
- The legend dot for the plain dots takes the same opacity as the plotted ones: `dot.muted/0.55=`.

## Composition

- Five to thirty dots. With fewer, write a sentence instead. With more, use the beeswarm variant or group them.
- All dots but the subject are one series: `fill=muted r=5 opacity=0.55`. The see-through fill shows where two dots overlap.
- The subject is a series of its own with one point, `fill=accent r=6`. One accent dot, two at most.
- Four to six ticks on each axis (`xstep=`, `step=`). Both axes carry a title with the unit.
- Start an axis at 0 when the size of the number matters. When all values sit far from 0 in a narrow band, start near the smallest value and let the tick labels say so.
- A trend line is a two-point `line` series, dashed and faint. Add it only when the dots visibly line up; it must pass through the cloud, not along its edge.
- To split the plot into four fields, add two more dashed two-point lines at the medians and name each field with `eyebrow` text in its outer corner.

## Text

- Name the subject and at most two outliers. Not every dot.
- A value `(vx, vy)` is at `x = plot x + (vx - xmin) / (xmax - xmin) * plot width`, `y = plot bottom - (vy - ymin) / (ymax - ymin) * plot height`. Put the baseline 12pt above the dot or 22pt below it, `anchor=middle`, on the side where no line and no other dot is.

## Bubble

Three numbers per thing: position twice, and size. Use it only when the third number matters to the reading ("bad and big").

```
bb: chart at 96,96 864x316 x=0..600 xstep=100 xunit=" ms" y=0..5 step=1 unit="%" grid=both key=0 xtitle="p95 latency" ytitle="Error rate"
  | dots 180,1.2 r=42 fill=ink opacity=0.14        // one series per bubble, largest first
  | dots 240,3.8 r=38 fill=accent opacity=0.85
  | dots 420,0.8 r=24 fill=ink opacity=0.25
  | dots 520,2.1 r=11 fill=ink opacity=0.45
```

- With a numeric x axis the radius belongs to the series (`r=`), so each bubble is its own `dots` row.
- The area carries the value, not the radius: `r = K * sqrt(value)` with one K for the whole chart, chosen so the largest bubble is about 40pt. State the size scale in the legend heading (`title="Area = requests per second"`).
- Five to fifteen bubbles. Write the largest first so that small ones are drawn on top and stay visible.
- One accent bubble. The others are `fill=ink`, fainter the larger they are (0.14 for the largest up to 0.45 for the smallest), so that a big bubble does not drown the rest.
- Name the subject and two or three others, in the middle of the bubble if it is wider than the text, otherwise beside it.

## Beeswarm

One number per item and many items (20 to 300): every item is a dot at its true value on one horizontal axis, pushed up or down just far enough not to touch its neighbours. The thickness of the swarm shows where values crowd.

```
// r=4, so dots need 10pt: the plot is 300pt high and y runs 0..30, one unit per slot; the middle slot is 15
bee: chart at 96,96 864x300 x=0..800 xstep=200 xunit=" ms" y=0..30 step=100 yaxis=0 grid=both key=0 xtitle="Request latency"
  | dots 61,15 66,16 86,15 91,16 93,14 95,17 fill=ink r=4 opacity=0.55
  | dots 579,15 fill=accent r=4
```

- Place the dots in order of value. Each takes the slot nearest the middle (15, 16, 14, 17, 13 ...) in which it stays at least 10pt away from every dot already placed. For more than about 40 dots, work the slots out with a short script and paste the pairs.
- Never move a dot along the value axis to make it fit, and never drop one.
- `step=100 yaxis=0` hides the vertical scale, which means nothing here. Say so in the legend heading (`title="One dot per request · height has no meaning"`).
- All dots have the same size and the same fill; one may take the accent. Name it and up to five outliers with `small` text and a thin line to the dot.

## Legend

`legend at 40,480` (464 under the beeswarm, whose plot is 16pt shorter) with `dot.COLOUR=` entries (the opacity of the plotted dots after a slash: `dot.muted/0.55=`) for the subject and for the rest, and a `line.soft=` entry for a trend line.
