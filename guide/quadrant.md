# Quadrant diagrams

Shows items placed against two measures at once (impact and effort, reach and frequency), so the reader sees which corner each one falls in.

FastDraw has no quadrant element. You build one from two lines, small circles and text.

## Building blocks

```
// tint behind the one quadrant that matters; a zone is drawn behind the axes
zone at 120,80 380x172 fill=accent/0.03 stroke=none radius=0

// axes cross in the middle; the arrowhead is at the high end
xaxis: 120,252 -> 880,252 stroke=ink/0.45 sw=1
yaxis: 500,424 -> 500,80 stroke=ink/0.45 sw=1

// an item: a dot at its position, its name 16px to the right
p2: ellipse at 316,196 8x8 fill=ink stroke=none
text "Update changelog" at 332,204 size=11 color=muted
```

## Composition

- A canvas 1000x500 with axes from x=120 to 880 and y=80 to 424 gives four quadrants of 380x172. Keep both axes the same distance from the canvas centre.
- Name each end of each axis with one or two words in `eyebrow` style, beside the tip and never on the line: under the x axis at its two ends (baseline 16px below, `anchor=end` on the right), and 12px to the right of the y axis at its top and bottom. No arrow characters in the text; the arrowhead already says which way is more. Do not label the middle of an axis.
- Name each quadrant in its outer corner, 20px in from the axis ends: `eyebrow` with `size=9`, `anchor=end` for the two on the right.
- A dot is an `ellipse` 8x8 placed at `x-4, y-4`. Its name starts 16px right of the dot centre with its baseline 4px below the centre.
- Place a dot by its values, not to look tidy. Work out x and y from the two measures and write the scale in a comment.
- Keep every dot at least 24px from both axes, and check that no name runs across an axis. If a name would, put it to the left of its dot with `anchor=end`.
- Twelve items at most. If there are more, merge the ones that sit together or draw two diagrams.

## Focus

- One item, the one to act on, is a 12x12 dot in the accent colour with its name in `weight=600 color=ink`. Its quadrant gets the tint and its corner name gets `color=accent weight=600`.
- Do not fill the four quadrants in four colours. Position carries the meaning.

## Legend

The dots are not styles of the look, so draw the legend by hand: a `rule` line 32px under the y axis, "Legend" in `eyebrow`, then the accent dot and the plain dot each with a `caption`.

## Variant: four named scenarios

When the four cells are futures or options rather than a cloud of items, draw four equal boxes instead of dots: `store` boxes of 280x160 with 24px between a box and each axis, one of them `focal`. Each holds a name (main text) and one line of description (`sub=`). Put heads on both ends of both axes (`<->`) because each axis is then a range between two named poles.
