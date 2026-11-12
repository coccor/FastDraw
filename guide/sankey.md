# Sankey diagrams

Shows where an amount goes as it splits and merges across three stages: a budget into uses, uses into outcomes. The width of every band is the amount. If the reader does not need to compare amounts, draw a process diagram; if nothing splits or merges, draw a funnel (see `pyramid`).

FastDraw has no Sankey element. Bars are thin rects and each band is a `rect` with its own outline: `shape=path path="..."`.

## Building blocks

```
// canvas 1000x624, title at y=52. Scale: 0.02px per minute (12,000 min = 240px) · bars 12 wide at x = 120, 500, 880
title: text "Where the CI minutes go" at 40,52 style=h1
text "TEST STAGE" at 506,108 style=eyebrow anchor=middle

// a band from y 332..412 on the left to y 312..392 on the right
rect at 132,312 368x100 shape=path path="M0,0.2 C0.5,0.2 0.5,0 1,0 L1,0.8 C0.5,0.8 0.5,1 0,1 Z" fill=muted/0.18 stroke=none overlap=ok mask=0

e2e: rect at 500,312 12x80 fill=ink stroke=none radius=0
rect "E2E" sub="4,000 min" at 448,272 116x36 fill=paper stroke=none radius=0 overlap=ok title.weight=600     // label on a paper patch, 4px above the bar
legend at 40,552 swatch.muted/0.18="Flow" swatch.accent/0.28="The story" swatch.ink="Bar · stage total"
```

## Composition

- Exactly three columns of bars, left to right, at most eight bars and twelve bands. For a fourth stage, draw a second diagram.
- Choose one scale for the whole diagram (px per unit) and write it in a comment. Every bar height and band width is `amount * scale`. Choose it so heights land on multiples of 4, and round nothing by more than 4px: a bar that disagrees with the number beside it destroys the diagram's one claim.
- Bars: `rect ... 12xH fill=ink stroke=none radius=0`, at x=120, 500 and 880. The middle column has the most bars, so lay it out first: first bar top at y=168, 40px between bars (the label patch goes there; 8px in the last column). Then centre the other columns on the same line: `top = middle top + (middle stack height - stack height) / 2`. A single total bar in column 1 is the simple case: its stack is just its height. Canvas height = bottom of the middle stack + 96 (legend 24px under it, 70px for the legend): 624 for four middle bars of 240px.
- Every column adds up to the same total. If not, the data has a leak; fix the data, not the picture.
- A bar's bands leave it stacked top to bottom with no gaps, in the order of the bars they go to; they arrive stacked in the order of the bars they come from. Work out each band's top and bottom y at both ends before writing anything (a short script is the safe way).
- Order the bars in each column so bands cross as little as possible. A band thinner than 4px cannot be seen: merge it into an "other" band.

## Bands

A band runs from the right edge of one bar (x0, from y a to b) to the left edge of the next (x1, from y c to d). Its box is `at x0,top` with size `(x1 - x0) x (bottom - top)`, where top is the smaller of a and c and bottom the larger of b and d. The outline is written in fractions of that box. With `A = (a - top)/height`, and B, C, D likewise:

```
path="M0,A C0.5,A 0.5,C 1,C L1,D C0.5,D 0.5,B 0,B Z"
```

- Keep both control points at 0.5. That makes the band leave and arrive level, so it plugs squarely into the bars. Three decimals are enough.
- Every band needs `stroke=none overlap=ok mask=0`: bands overlap each other's boxes and must show through where they cross.
- Plain bands are `fill=muted/0.18`. The one path the diagram is about is `fill=accent/0.28`; it may be several bands if they are one story. No other colours. Write the accent bands after the plain ones and the bars after all bands.
- No arrowheads. Left to right is the direction.

## Text

- Column headings in `eyebrow`, typed in capitals, centred over each column, baseline at y=108.
- Each bar has a name (`weight=600 color=ink`) and its amount 16px below in `small`. First column: to the left of the bar, `anchor=end`, 16px clear, name baseline 4px above the bar's middle. Last column: to the right, 16px clear, the same. Bars under 20px tall still fit this.
- Middle column: bands pass through the gap above every bar except the first, so a label written there lies on them. The clear way is a paper patch: `rect "Name" sub="amount" at 448,BARTOP-40 116x36 fill=paper stroke=none radius=0 overlap=ok title.weight=600`, centred on the bar, drawn after the bands. It hides the bands for about 56px either side of the bar and nothing else; each band's width is still read at the bars. Without the patch, ink on a pale band is readable but busy.
- Do not write amounts on the bands.

## Legend

One `legend` statement, 24px under the lowest bar: `swatch.muted/0.18="Flow" swatch.accent/0.28="The story" swatch.ink="Bar · stage total"`. Its `title=` may state the point of the accent path in one sentence.
