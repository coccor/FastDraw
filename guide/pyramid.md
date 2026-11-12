# Pyramids and funnels

Shows a ranking as stacked layers that narrow. A pyramid points up: a broad base carries a small, rare top. A funnel points down: a wide intake shrinks to the few that come out. Use one or the other, never both in one diagram.

Each layer is a `polygon`: a trapezoid with four corners, measured from its `at` position.

## Building blocks

```
// pyramid, centre x=500: each layer is 64 high and 64 narrower on each side than the one below
l3:   polygon "Essays" sub="weekly · 800–1,500 words" at 244,216 points=64,0;448,0;512,64;0,64 fill=ink/0.05 stroke=ink/0.12 sw=1
l4:   polygon "Short posts" sub="daily · ~200 words" at 180,280 points=64,0;576,0;640,64;0,64 fill=ink/0.05 stroke=ink/0.12 sw=1
apex: polygon at 372,24 points=128,0;256,128;0,128 fill=accent/0.08 stroke=accent sw=1
text "Flagship book" at 500,120 anchor=middle weight=600 color=ink

// funnel: the top edge of a layer is as wide as its count, the bottom edge as wide as the next count
f1: polygon "Visitors" sub="10,000" at 200,40 points=0,0;600,0;480,64;120,64 fill=ink/0.05 stroke=ink/0.12 sw=1
```

## Composition

- Four to six layers. With seven or more, merge neighbours or split the diagram.
- All layers have the same height, 56 to 72px, and share one centre x. Each sits exactly on the one below: its bottom edge equals the top edge of the next.
- Pyramid: the sides are two straight lines from the base corners to the tip, so every layer loses the same width on each side (its height, for 45° sides). A base 640 wide with 64px layers gives three trapezoids and a triangle 128 high on top.
- Funnel with real numbers: pick a scale (say 600px for the largest count) and make every edge that wide. Uneven drops then show as uneven steps. Do not smooth them into a straight side. The last layer is a plain rectangle of its own width, at least 48px so its name fits.
- Leave 180px free on each side of the widest layer for side notes and an axis.
- Fill every plain layer the same (`fill=ink/0.05 stroke=ink/0.12`). One layer takes the accent (`fill=accent/0.08 stroke=accent`): the tip of a pyramid, the outcome of a funnel, or the step where most is lost. Never the base.
- Write the accent layer last in the file. Shapes are drawn in file order, and a neighbour written after it would cover the shared edge.

## Text

- The layer's name is its main text and a short detail is `sub=`. Both are centred in the layer.
- A triangle is the exception: text is centred in the triangle's box, which puts it up in the narrow part. Leave the triangle without text and place the name and detail yourself, with baselines 32px and 16px above its bottom edge.
- A name must be narrower than the top edge of its layer (the bottom edge in a funnel). If it is not, widen the whole figure.
- Side notes (a count, a drop such as "−40%") are `small` text level with the middle of the layer, starting 24px right of that layer's widest corner. Keep them outside the layer's bounding box or `check` reports an overlap.
- An arrow up the left side shows what the order means: `100,344 -> 100,28 stroke=ink/0.3 sw=1`, with one word at each end in `eyebrow` style (`anchor=end`, 16px left of the line). Text cannot be rotated, so do not try to write along the line.

## Legend

The layers are not styles of the look, so draw the legend by hand: a `rule` line, "Legend" in `eyebrow`, then a 16x12 `rect` with the accent fill and one with the plain fill, each with a `caption`. If the widths follow real numbers, say so in a third caption.

## Traps

- A pyramid claims that each layer rests on the one below. If the items are only a list or a set of sizes, use a bar chart.
- Equal steps for unequal numbers mislead. Either use the real widths or say nowhere that width means quantity.
