# Data flow diagrams

Shows a data pipeline as a grid: steps run left to right, roles are bands from top to bottom, and each box says who does what at which step and what kind of data goes in and comes out. For a business process with no typed data, draw a swimlane instead.

FastDraw has no lane or chip elements. Build them from `zone`, `rect` and `text` as below.

## Composition

- Limits: 4 roles and 6 steps. More than that is two diagrams.
- Columns: the first 168px (x 40 to 208) hold the role names. Step n has its box at `x = 224 + 172*n`, 144 wide, so boxes in one lane are 28px apart and the column centre is `296 + 172*n`.
- Step headers sit above the lanes, centred on the column: a pill `rect "01" at cx-20,88 40x20 radius=10 fill=ink/0.08 stroke=none`, and the step name under it as `text "Ingest" at cx,124 style=eyebrow anchor=middle`.
- Lanes: one `zone at 40,Y 1032x120 radius=0` per role, with no text, touching each other, the first at y=136. Alternate `fill=ink/0.03` and `fill=ink/0.015` so the bands can be told apart. Use `zone`, not `rect`: a rect counts as a box and every arrow and label on it is reported.
- Role name: `text "Data\nengineer" at 124,Y+58 style=eyebrow anchor=middle` (two lines), and one `208,136 -- 208,BOTTOM style=rule` to close the name column.
- Boxes: 144x88 at lane top + 16. Main text is the action ("Clean & Model"), `sub=` the tool, `tag=` a three-letter code for the role.
- A role that does nothing at a step gets nothing in that cell. No placeholder box.
- Read left to right and downwards: each hand-off goes to the next column, in the same lane or a lower one.

## Data-type chips

Each box carries two chips: bottom-left is what comes in, bottom-right is what goes out. A source has no left chip and a sink no right one.

```
rect "DB" at X+8,Y+68   28x12 radius=3 fill=#5e7a9b stroke=none title.color=#ffffff title.size=7 overlap=ok
rect "TB" at X+108,Y+68 28x12 radius=3 fill=#b8915a stroke=none title.color=#ffffff title.size=7 overlap=ok
```

(X,Y is the box's `at`.) Use one two-letter code and one quiet colour per kind of data, four kinds at most, and never the accent. `overlap=ok` is needed because the chip sits on its box.

## Arrows

- Same lane: `a -> b`, a short straight arrow with no label.
- Into a lower lane: `a.right -> b.top`. It runs along the lane and drops into the next column with one bend.
- Exactly one arrow is the hand-off the diagram is about, usually where the data changes role. It gets `style=primary` and the only arrow label, the payload ("raw table").
- An arrow that leaves the pipeline for its consumers uses `style=link`.

## Focus

One box (the one that receives the primary arrow) uses `focal`. Its step header takes the accent too: `fill=accent/0.18` on the pill and `color=accent` on the name. Nothing else is accented, and no lane is tinted in a colour.

## Legend

`legend at 40,Y` 24px under the last lane, for the box and arrow styles. The chips need their own row 78px below that, built by hand: `text "Data type" at 40,Y+78 style=eyebrow`, then for each kind the same chip rect (without `overlap=ok`) at y = Y+68 and its name as `text ... style=caption` 36px to the right of the chip's left edge, and at the end the caption "left chip = what comes in · right chip = what goes out". Leave 104px of canvas below Y.
