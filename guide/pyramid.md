# Pyramids and funnels

Shows a ranking as stacked layers that narrow. A pyramid points up: a broad base carries a small, rare top. A funnel points down: a wide intake shrinks to the few that come out. Use one or the other, never both in one diagram.

Each layer is a `polygon`: a trapezoid with four corners, measured from its `at` position. Title at `40,52` (`style=h1`) with an optional `caption` at `40,74`; the apex's top is y=96.

## Building blocks

```
// pyramid, centre x=500: each layer is 64 high and 64 narrower on each side than the one below
l3:   polygon "Essays" sub="weekly · 800–1,500 words" at 244,288 points=64,0;448,0;512,64;0,64 fill=ink/0.05 stroke=ink/0.12 sw=1
l4:   polygon "Short posts" sub="daily · ~200 words" at 180,352 points=64,0;576,0;640,64;0,64 fill=ink/0.05 stroke=ink/0.12 sw=1
apex: polygon at 372,96 points=128,0;256,128;0,128 fill=accent/0.08 stroke=accent sw=1
text "Flagship book" at 500,192 anchor=middle weight=600 color=ink

// funnel: the top edge of a layer is as wide as its count, the bottom edge as wide as the next count
f1: polygon "Visitors" sub="10,000" at 200,96 points=0,0;600,0;480,64;120,64 fill=ink/0.05 stroke=ink/0.12 sw=1
```

## Composition

- Four to six layers. With seven or more, merge neighbours or split the diagram.
- All layers have the same height, 56 to 72px, and share one centre x. Each sits exactly on the one below: its bottom edge equals the top edge of the next.
- Pyramid: the sides are two straight lines from the base corners to the tip, so every layer loses the same width on each side (its height, for 45° sides). With n layers in all (apex included) the base is `128(n+1)` wide: 640 for four, giving three trapezoids and a triangle 128 high on top. The apex's top is y=96, layer k (from the apex, k=1..n-1) has its top edge at `y = 224 + 64(k-1)`, and the base is at `96 + 128 + 64(n-1)` = 416 for four.
- Funnel with real numbers: pick a scale (say 600px for the largest count) and make every edge that wide. Uneven drops then show as uneven steps. Do not smooth them into a straight side. The last layer is a plain rectangle of its own width, at least 48px so its name fits.
- Leave 180px free on each side of the widest layer for side notes and an axis.
- Fill every plain layer the same (`fill=ink/0.05 stroke=ink/0.12`). One layer takes the accent (`fill=accent/0.08 stroke=accent`): the tip of a pyramid, the outcome of a funnel, or the step where most is lost. Never the base.
- Write the accent layer last in the file. Shapes are drawn in file order, and a neighbour written after it would cover the shared edge.

## Text

- The layer's name is its main text and a short detail is `sub=`. Both are centred in the layer.
- A triangle is the exception: text is centred in the triangle's box, which puts it up in the narrow part. Leave the triangle without text and place the name and detail yourself, with baselines 32px and 16px above its bottom edge.
- A name must be narrower than the top edge of its layer (the bottom edge in a funnel). If it is not, widen the whole figure.
- Side notes (a count, a drop such as "−40%") are `small` text level with the middle of the layer, starting 24px right of that layer's widest corner. Keep them outside the layer's bounding box or `check` reports an overlap.
- An arrow up the left side shows what the order means: `100,416 -> 100,104 stroke=ink/0.3 sw=1` (foot at the base's y, tip 8px under the apex's top). Label its two ends along the line with rotated `eyebrow` text, which reads upwards and may be two words; keep each under about 150px:
  `text "Common, high volume" at 84,416 style=eyebrow rotate=-90` (starts at the foot) and `text "Rare, high leverage" at 84,104 style=eyebrow rotate=-90 anchor=end` (ends at the tip). The 180px margin is never crossed.

## Legend

The layers are not styles of the look, but `legend` takes swatches: `legend at 40,464 swatch.accent/0.1="Apex: rarest" swatch.ink/0.1="Supporting layer"` (24px under the note that sits 32px under the base). If the widths follow real numbers, say so in the title's `caption` line.

## Traps

- A pyramid claims that each layer rests on the one below. If the items are only a list or a set of sizes, use a bar chart.
- Equal steps for unequal numbers mislead. Either use the real widths or say nowhere that width means quantity.
