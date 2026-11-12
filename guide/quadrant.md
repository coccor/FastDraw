# Quadrant diagrams

Shows items placed against two measures at once (impact and effort, reach and frequency), so the reader sees which corner each one falls in.

FastDraw has no quadrant element. You build one from two lines, small circles and text. Title at `40,52` (`style=h1`); the quadrants start at y=96.

## Building blocks

```
// tint behind the one quadrant that matters; a zone is drawn behind the axes
// (stroke=none: the built-in zone has a dashed outline)
zone at 120,96 380x172 fill=accent/0.03 stroke=none radius=0

// axes cross in the middle; the arrowhead is at the high end
xaxis: 120,268 -> 880,268 stroke=ink/0.45 sw=1
yaxis: 500,440 -> 500,96 stroke=ink/0.45 sw=1

// an item: a dot at its position, its name 16px to the right
p2: ellipse at 316,212 8x8 fill=ink stroke=none
text "Update changelog" at 332,220 size=11 color=muted
```

## Composition

- A canvas 1000x540 with axes from x=120 to 880 and y=96 to 440 gives four quadrants of 380x172, crossing at 500,268. Keep the crossing at the centre of the plot, so the four quadrants are equal.
- Name each end of each axis with one or two words in `eyebrow` style, beside the tip and never on the line: under the x axis at its two ends (baseline 16px below, `anchor=end` on the right), and 12px to the right of the y axis at its top (baseline 100) and bottom (baseline 440). No arrow characters in the text; the arrowhead already says which way is more. Do not label the middle of an axis.
- Name each quadrant in its outer corner, 20px in from the axis ends: `eyebrow` with `size=9`, `anchor=end` for the two on the right (baselines 120 above, 428 below).
- A dot is an `ellipse` 8x8 placed at `x-4, y-4`. Its name starts 16px right of the dot centre with its baseline 4px below the centre.
- Place a dot by its values, not to look tidy. Work out x and y from the two measures and write the scale in a comment.
- Keep every dot at least 24px from both axes, and check that no name runs across an axis. If a name would, put it to the left of its dot with `anchor=end`.
- Twelve items at most. If there are more, merge the ones that sit together or draw two diagrams.

## Focus

- One item, the one to act on, is a 12x12 dot in the accent colour with its name in `weight=600 color=ink`. Its quadrant gets the tint and its corner name gets `color=accent weight=600`.
- Do not fill the four quadrants in four colours. Position carries the meaning.

## Legend

The dots are not styles of the look, but `legend` takes dot entries: `legend at 40,472 dot.accent="Start tomorrow" dot.ink="Candidate project"` (32px under the y axis; it draws its own rule, so write no rule line of your own). The canvas is 70px taller than the legend's y. The axes themselves are written with `->` (head at the high end); any plain rule you add elsewhere is `--`, because `->` grows an arrowhead.

## Variant: four named scenarios

When the four cells are futures or options rather than a cloud of items, draw four equal boxes instead of dots: `node` boxes written `280x160` (never `store`: in the built-in look it is a cylinder) with 24px between a box and each axis, one of them `focal`. Each holds a name (main text) and one line of description (`sub=`). Put heads on both ends of both axes (`<->`) because each axis is then a range between two named poles.
