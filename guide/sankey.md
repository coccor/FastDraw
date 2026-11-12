# Sankey diagrams

Shows where an amount goes as it splits and merges across three stages: a budget into uses, uses into outcomes. The width of every band is the amount. If the reader does not need to compare amounts, draw a process diagram; if nothing splits or merges, draw a funnel (see `pyramid`).

FastDraw has no Sankey element. Bars are thin rects and each band is a `rect` with its own outline: `shape=path path="..."`.

## Building blocks

```
// scale: 0.02px per minute (12,000 min = 240px) · bars 12 wide at x = 120, 500, 880
text "TEST STAGE" at 506,76 style=eyebrow anchor=middle

// a band from y 224..304 on the left to y 256..336 on the right
rect at 132,224 368x112 shape=path path="M0,0 C0.5,0 0.5,0.286 1,0.286 L1,1 C0.5,1 0.5,0.714 0,0.714 Z" fill=muted/0.18 stroke=none overlap=ok mask=0

e2e: rect at 500,256 12x80 fill=ink stroke=none radius=0
text "E2E" at 506,236 anchor=middle weight=600 color=ink
text "4,000 min" at 506,250 style=small anchor=middle
```

## Composition

- Exactly three columns of bars, left to right, at most eight bars and twelve bands. For a fourth stage, draw a second diagram.
- Choose one scale for the whole diagram (px per unit) and write it in a comment. Every bar height and band width is `amount * scale`. Choose it so heights land on multiples of 4, and round nothing by more than 4px: a bar that disagrees with the number beside it destroys the diagram's one claim.
- Bars: `rect ... 12xH fill=ink stroke=none radius=0`. Numbers that work on a 1000x560 canvas: columns at x=120, 500 and 880, the first bar's top at y=120. Stack the bars of a column with a gap between them: 32px in the middle column (a label goes there), 8px in the last.
- Every column adds up to the same total. If not, the data has a leak; fix the data, not the picture.
- A bar's bands leave it stacked top to bottom with no gaps, in the order of the bars they go to; they arrive stacked in the order of the bars they come from. Work out each band's top and bottom y at both ends before writing anything.
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

- Column headings in `eyebrow`, centred over each column, 44px above the first bar.
- Each bar has a name (`weight=600 color=ink`) and its amount 14 to 16px below in `small`. First column: to the left of the bar, `anchor=end`, 16px clear, level with its middle. Last column: to the right, 16px clear. Middle column: centred over the bar in the gap above it (name baseline 20px above the bar, amount 6px above), where no band passes. If a label has no clear place, the column has too many bars.
- Do not write amounts on the bands.

## Legend

Draw it by hand, because a `legend` swatch cannot show a tint: a `rule` line 32px under the lowest bar, "Legend" in `eyebrow`, then 16x8 rects (`fill=muted/0.18 stroke=muted`, `fill=accent/0.28 stroke=accent`, `fill=ink`) each with a `caption`. A last caption may state the point of the accent path in one sentence.
