# User journeys

Shows how one person feels while moving through the stages of an experience, and what they do at each stage. The line of feeling is what makes it a journey; if you cannot say how the person feels at each stage, draw a process or a timeline. One person per diagram.

FastDraw has no journey elements. You build the grid from text and lines at exact coordinates, so first fix the column centres and row y-positions and reuse them everywhere.

## Composition

- Columns: one per stage, six at most, centres 216px apart. Leave 128px on the left for row names: the first centre is x=228, the grid lines run from x=128 to 40px before the right edge.
- Stage header, centred on each column: `text "Stage 1" at cx,100 style=eyebrow anchor=middle`, and 20px lower the stage name with `weight=600 anchor=middle`.
- Feeling band, 40px under the headers: three `style=rule` lines 80px apart for high, neutral and low, each named at the left with `text "High" at 112,<line y + 3> style=eyebrow anchor=end`. Feelings are words on five steps (the three lines and the two half-way heights), never numbers, never emoji.
- The curve: one dot per stage at the column centre, on the height of its level: `ellipse at cx-5,y-5 10x10 fill=muted stroke=none`. Join neighbours with straight lines given as points, `228,160 -- 444,240 sw=1.5`, so they meet in the middle of the dots. Write the lines before the dots.
- Rows under the band: a `style=rule` line 24px below the low line, then up to three rows, each closed by another rule. Row name at the left like the level names. Actions are plain `text` (one short line, `anchor=middle`, 28px under the rule); touchpoints (where it happens: a page, an email) use `style=small`. The actions row is 96px high so that two markers fit under the text; other rows 56px.

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

The `legend` statement only knows styles, and this diagram uses none, so draw it by hand 24px under the last row: a `style=rule` line, `text "Legend" style=eyebrow`, then for each entry a small copy of the mark (a 24px line with an 8px dot on it; a 16x10 marker box) followed by `text "..." style=caption`. Three entries: the curve, the lowest point, the marker.
