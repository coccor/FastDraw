# User journeys

Shows how one person feels while moving through the stages of an experience, and what they do at each stage. The line of feeling is what makes it a journey; if you cannot say how the person feels at each stage, draw a process or a timeline. One person per diagram.

FastDraw has no journey elements. You build the grid from text and lines at exact coordinates, so first fix the column centres and row y-positions and reuse them everywhere.

## Composition

- Title: `text "..." at 40,52 style=h1`. The stage headers start at y=100.
- Columns: one per stage, six at most, centres 216px apart. Leave 128px on the left for row names: the first centre is x=228, the grid lines run from x=128 to the right edge of the last column (last centre + 108).
- Stage header, centred on each column: `text "Stage 1" at cx,100 style=eyebrow anchor=middle`, and 20px lower the stage name with `weight=600 anchor=middle`.
- Feeling band, 40px under the headers: three `style=rule` lines (written with `--`) at y=160, 240, 320 for high, neutral and low, each named at the left with `text "High" at 112,<line y + 3> style=eyebrow anchor=end`. Feelings are words on five steps (the three lines and the two half-way heights, 200 and 280), never numbers, never emoji.
- The curve: one dot per stage at the column centre, on the height of its level: `ellipse at cx-5,y-5 10x10 fill=muted stroke=none`. Join neighbours with straight lines given as points, `228,160 -- 444,240 sw=1.5`, so they meet in the middle of the dots. Write the lines before the dots.
- Rows under the band: a `style=rule` line at y=344 (24px below the low line), then up to three rows, each closed by another rule, the last row by none (the legend's own line closes it). Row name at the left like the level names, baseline 3px under the row's text baseline. The actions row is 96px high (rules at 344 and 440) so that two markers fit under the text; other rows 56px.
- Actions are plain `text`, `anchor=middle`, baseline 28px under the rule (y=372). Touchpoints (where it happens: a page, an email) use `style=small`, baseline 32px under their rule (y=472). Markers: first at y=384, second at y=408.

## Emphasis

The accent marks the lowest point, twice: its dot and the line falling into it (`fill=accent`, `stroke=accent`), and one or two markers under that stage's action saying what goes wrong:

```
rect "NO WARNING AT 80%" at cx-92,384 184x16 radius=2 fill=accent/0.08 stroke=accent/0.5 sw=0.8 dash=3,3
    title.font=mono title.size=8 title.weight=400 title.color=accent title.spacing=0.1
```

Mark only the low stage. A marker on every stage says nothing.

## Text

- Row and level names are horizontal, in the left margin. Keep an action under 26 characters, a marker under 30, so neighbours do not touch.
- No boxes around stages or cells: the grid lines and the alignment are enough.

## Legend

`legend at 40,Y line.muted="How the user feels" dot.accent="Lowest point" swatch.accent/0.15="What hurts there"`, Y = the bottom of the last row + 24 (520 for the rows above). Draw no rule of your own above it: the legend has one, and a second rule under a row that is already closed looks like an empty row.
