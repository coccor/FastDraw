# FastDraw guide

FastDraw draws diagrams from a small text file (`.fdraw`). You place every element yourself, at exact coordinates. A separate look file (`.look`) decides how each named style is drawn. A person may later edit the same file in a visual editor, so keep it tidy.

## How to work

1. Run `fastdraw sizes <look file>` to see the styles you can use, their default sizes, and the look's own guidance. Follow that guidance. A diagram with no `look` line uses the built-in look: run `fastdraw sizes` with no file to see it.
2. To create or change a look (how styles are drawn), run `fastdraw guide look` instead of the steps below.
3. Run `fastdraw guide list` to see which kinds of diagram have their own guide. If yours is there, run `fastdraw guide <kind>` and follow it.
4. Plan the composition on paper first: canvas size, rows and columns, where the main thing sits.
5. Write the file.
6. Run `fastdraw check <file>`. Fix every error and warning. Read the hints and fix the ones that are real.
7. Run `fastdraw render <file>` and **look at the PNG**. Fix what looks wrong: cramped labels, uneven gaps, lopsided composition, a label sitting on a border. Repeat from 6 until it is clean and looks good.

When you change an existing diagram: do not move, resize or restyle anything that is already there unless asked. Place only what you add, in free space.

## The file

One statement per line. An indented line continues the statement above it. `//` starts a comment; so does a line starting with `# `.

```
look "./team.look"          // path relative to this file; leave the line out to use the built-in look
canvas 1000x480             // width x height in px

// shape:   id: style "text" at x,y WxH key=value ...
api: node "Orders API" sub="REST · :8080" tag="API" at 200,120
db:  store "Orders DB" at 440,120 160x64

// connector:   [id:] from -> to "label" key=value ...
api -> db "writes"

// free text:   [id:] text "words" at x,y style=name key=value ...
text "Legend" at 40,420 style=eyebrow
```

### Shapes

`id: style "text" at x,y WxH props`

- `id` is a short unique name followed by a colon. Give every box an id. Small decorative things (legend swatches) may omit it.
- `style` is a shape style from the look, or one of the plain built-ins `rect`, `ellipse`, `diamond`.
- `at x,y` is the **top-left corner**. No space after the comma.
- `WxH` is the size. Leave it out to get the style's default size.
- `"text"` is the main label and may be left out. Use `\n` for a line break. On a zone it is drawn as a small caption at the top.
- Use multiples of 4 for positions and sizes.

Text properties a shape understands (if the look's style supports them):

| Property | Meaning |
|---|---|
| `sub="..."` | a second, smaller line under the main text (`\n` for more lines) |
| `tag="API"` | a 3–4 letter marker in the top-left corner |
| `ghost="01"` | a large faint number in the bottom-right corner |
| `title.align=left` | text against the left edge instead of centred (`right` too). On a zone, the caption moves to that corner |

### Polygons and arcs

Two built-in shapes draw anything a box, ellipse or diamond cannot.

`polygon` takes exact corners, measured from its `at` position (so the top-left of the outline is `0,0`):

```
top:   polygon "Vision"   at 140,40  points=60,0;120,80;0,80          // a triangle
mid:   polygon "Strategy" at 100,128 points=40,0;160,0;200,80;0,80    // a trapezoid
trend: polygon at 60,330 points=0,40;80,10;160,30;240,0 open=1 stroke=accent sw=2
```

- `open=1` leaves the outline unclosed and unfilled: a line through the points, for a trend or a series.
- `smooth=1` rounds the outline into a curve that passes through every point.
- Give `WxH` only to stretch the outline to another size.

`arc` is a slice of the circle (or ellipse) that fills its box. Angles are degrees, clockwise from the top:

```
won:  arc "42%" at 400,40 200x200 from=0   to=151 fill=accent
lost: arc "58%" at 400,40 200x200 from=151 to=360 fill=ink/0.1
ring: arc at 660,40 200x200 from=0 to=250 inner=0.7 fill=link stroke=none
```

- Slices of one circle all use the same `at` and `WxH`.
- `inner=0.7` cuts out the middle, leaving a ring segment (0.7 = the hole is 70% of the radius).
- `open=1` draws only the curved edge.
- Text sits in the middle of the slice.

Shapes that are meant to overlap (circles of a Venn diagram, faces of a 3D box) need `overlap=ok`, or `check` reports them. `overlap=ok` also works on text (a faint watermark behind labels).

A filled shape first paints a patch of paper colour under itself, so that lines behind it do not show through a tint. For see-through shapes that should blend where they overlap, add `mask=0`.

Text in a polygon is centred on the outline's area, so it sits in the wide part of a triangle.

### Charts

`chart` draws axes, tick labels and grid lines, and plots your numbers, so you never work out bar heights by hand. Its box (`at x,y WxH`) is the plot area. Tick labels are drawn outside it: leave about 56px free on the left, 28px below (44px with `xtitle=`) and 40px above.

```
rev: chart "Revenue by quarter" at 80,80 360x200 x="Q1,Q2,Q3,Q4" prefix="$" unit="k" labels=1
  | bars "2025" 42 61 75 93
  | line "Plan" 50 60 70 80 stroke=link dots=1
```

Each row is one series: `| kind "name" numbers... props`.

| Kind | Draws |
|---|---|
| `bars` | one bar per category. Several `bars` series stand side by side; `stack=1` on the chart stacks them. A pair `lo,hi` is a floating bar (a bridge step, a range) |
| `line` | a line through the values; `dots=1` marks each point, `dash=4,4` dashes it |
| `area` | a line with the space under it tinted |
| `dots` | points only. With a numeric x axis each point is `x,y`; with categories a pair is `value,radius` (a bubble) |

- `_` in place of a number leaves a gap.
- Colour a series with `fill=` or `stroke=` on its row. Without it the series take the accent first, then the link colour, then greys. Keep the accent for the series the chart is about.

Chart properties:

| Property | Meaning |
|---|---|
| `x="Q1,Q2,Q3"` | category names along the bottom |
| `x=0..100` | a numeric x axis instead (`xstep=20`, `xunit="s"`); series then give `x,y` points |
| `y=0..100` | the y range; left out, it runs from 0 to a round number above the largest value |
| `step=25` | distance between y ticks (worked out when left out) |
| `prefix="$"`, `unit="k"` | written around every y value |
| `labels=1` | write each value above its bar or point |
| `xtitle=`, `ytitle=` | axis titles |
| `grid=0`, `grid=both` | no grid lines; or vertical ones too (numeric x) |
| `key=0` | hide the series key (drawn top-right when there are two or more named series) |
| `yaxis=0` | hide the y tick labels (when `labels=1` already says it) |
| `bar.width=0.64` | share of each category's width that bars fill |

Anything the chart does not draw (a note, a threshold label, an arrow to one bar) you add as ordinary text and connectors at exact coordinates. The plot maps values linearly: value `v` is at `y + H - (v - ymin) / (ymax - ymin) * H`, and category `i` (from 0) is centred at `x + W * (i + 0.5) / n`.

### Tables

A table is a box with a header and rows, for entities, classes, database tables and grids of values. Write the box as usual, then one indented line per row, each starting with `|`:

```
users: table "users" at 40,100
  | id    "id"         "uuid"        "PK"
  | email "email"      "text"        "UK"
  |       "created_at" "timestamptz"
  | ---
  |       "note"       "soft-deleted rows stay"
```

- A row is `| id "cell" "cell" ...`: one quoted text per column. The row id is optional; give one to every row an arrow ends on. It cannot be `top`, `bottom`, `left` or `right`.
- `| ---` draws a full dividing line (between the attributes and the operations of a class, say).
- `|= "Role" "Read" "Write"` is a heading row, drawn bold on a tint. Use it for the column headings of a grid.
- The size works itself out: columns are as wide as their longest cell and the height follows the rows (32px header, 24px per row with the built-in look). To make a table wider, give a width: `at 40,100 240x0`. Spare width goes to the first column.
- A row can have its own tint: `| late "Shipping" "3 days" fill=accent/0.1`.
- `align=center grid=1` on the table centres every column after the first and draws column lines, for a matrix.
- Rows come last in the statement. Properties of the table itself go on the first line.

An arrow can end on a row: `orders.user_id -- users.id`. It attaches to the left or right edge of the table, level with that row, on the side facing the other end; `users.id.left` forces a side.

Any appearance property can be overridden on one element: `fill=`, `stroke=`, `sw=` (stroke width), `dash=4,3`, `radius=`. Colours are `#hex`, a colour name from the look, or either followed by `/opacity` (`ink/0.3`). Prefer the look's styles; override only with a reason.

### Connectors

`from -> to "label" props`

| Operator | Draws |
|---|---|
| `->` | arrow with a head at `to` |
| `<->` | heads at both ends |
| `--` | plain line, no head |

`style=name` picks a line style from the look. Without it, `->` uses `arrow` and `--` uses `line`.

`head=` and `tail=` put a marker of your choice on the `to` end and the `from` end. They work with any operator; with `--` they are the only markers drawn.

| Marker | Looks like | Usual meaning |
|---|---|---|
| `arrow` | filled arrowhead | the default head |
| `open` | two strokes, not filled | a dependency, an asynchronous message |
| `triangle` | hollow triangle | inherits from / implements (points at the parent) |
| `diamond`, `diamond-solid` | hollow or filled diamond | aggregation, composition (sits on the owner) |
| `dot`, `circle` | filled or hollow circle | a start point, a provided interface |
| `one`, `only-one` | one bar, two bars | exactly one |
| `many`, `one-many` | crow's foot, crow's foot and bar | many, one or more |
| `zero-one`, `zero-many` | circle and bar, circle and crow's foot | optional one, optional many |
| `none` | nothing | removes a head the operator would draw |

Example: `orders.user_id -- users.id tail=many head=only-one style=relation` reads "many orders, exactly one user".

An end can be:

| Form | Meaning |
|---|---|
| `api` | the shape; FastDraw picks the side that faces the other end |
| `api.right` | a side: `top`, `bottom`, `left`, `right` |
| `api.right@0.25` | a point along that side, as a fraction (0 = top or left end) |
| `api.right@172` | a point along that side at absolute coordinate 172 (y for left/right, x for top/bottom) |
| `400,300` | a free point |
| `+0,260` | a point relative to the other end (only one end may be relative) |
| `users.email` | a row of a table: the edge of the table level with that row. `users.email.left` picks the side |
| `life1@176` | a point on another line: where line `life1` has coordinate 176 (y on a vertical line, x on a horizontal one); a value ≤ 1 is a fraction along it |

Routing: arrows turn at right angles with rounded corners, and go around a box that is in the way without being told. Two ends that line up give a straight line. Otherwise the arrow leaves the first shape sideways and enters the second from above or below, or uses a mid-way step. When several arrows share a side, they are spread along it automatically. Lay boxes out so the important arrows are straight; a detour is a fallback, not a design. To steer a route yourself:

- name the sides: `a.bottom -> b.left`
- add waypoints: `via=300,200` or `via=300,200;300,360`
- draw it as a smooth curve: `route=curve`. It leaves and arrives square to the sides it is attached to. `bend=40` instead bows it 40px to the left of its direction of travel (negative: to the right), which is how to draw the arcs of a cycle. `via=x,y;x,y` makes the curve pass through those points. Curves do not avoid boxes; you place them. `route=straight` gives one straight line
- a line that is meant to run behind boxes (a grid line, a guide) takes `layer=back`, and `check` stops reporting the boxes it crosses
- several lines may share one trunk, as in a tree: give them the same start point (`root.bottom@0.5 -> a.top`, `root.bottom@0.5 -> b.top`) or the same end point. Lines that overlap anywhere else are reported
- for a loop back to the same side (`x.right@190 -> x.right@220`), `loop=36` sets how far it sticks out

Labels are drawn in small caps on a paper-coloured patch, above a horizontal line or to the right of a vertical one, at the middle of the longest segment. Keep them to about 14 characters. To move one: `lside=below` (or `left` for vertical lines), or `lpos=x,y` (centre x, text baseline y; the default baseline is 10px above a horizontal line, or 18px below it with `lside=below`). `label.caps=0` keeps the label's own letter case, for paths and header names.

### Text

`text "words" at x,y style=name` — `at` is the left end of the text baseline. `anchor=middle` or `anchor=end` changes that. `rotate=-90` turns the text to read upwards about its `at` point (`rotate=90`: downwards), for a label along a vertical axis. Overrides: `size=`, `color=`, `weight=`, `font=sans|mono|serif`, `italic=1`.

### Legend

One statement draws a whole legend: a rule line, a heading, and one entry per style, spaced and wrapped for you.

```
legend at 40,404 focal="The service this is about" store="Holds data" primary="Main path" return="Response"
```

- Each `style="what it means"` pair is an entry, in the order written. Use only the styles the diagram uses.
- It spans the canvas width minus the left margin on both sides; give `WxH` to set another width (the height is always worked out).
- `title="Key"` changes the heading; `title=none` removes it.
- For a mark that is not a style of the look, write `swatch.COLOUR="meaning"` (a small filled square), `dot.COLOUR="meaning"` or `line.COLOUR="meaning"`, where COLOUR is a colour name from the look: `legend at 40,400 dot.accent="Shipped" swatch.muted="Planned" line.link="Depends on"`.
- Put it 24px under the lowest element and leave about 70px of canvas for it.

### Groups

`group=name` on several elements makes the editor select and move them together. It does not change how they are drawn.

### Drawing order

Shapes whose style is marked "drawn behind everything" (zones) come first, then all connectors, then connector labels, then shapes, then free text. Within each group, file order.

## Composition rules

These are what make a diagram look designed. `check` enforces the mechanical ones; the rest are yours.

- **Fewer elements.** Aim for nine boxes or fewer and twelve arrows or fewer. If two boxes always go together, make them one. If an arrow says nothing the layout doesn't already say, remove it.
- **One focus.** Use the look's accent style on one or two things only.
- **A grid you can name.** Pick column x-positions and row y-positions and reuse them. Boxes in a row share a top edge and height; boxes in a column share a left edge or centre.
- **Even gaps.** Use the same gap between neighbours along a row (48–56px between boxes that an arrow with a label connects; at least 40px otherwise).
- **Margins.** Keep 40px clear on the left and right of the canvas and above the first row.
- **Straight arrows where possible.** Line things up so the main path is straight lines. Use elbows for branches.
- **No arrow through a box, no arrow on top of another, no label touching a box or another line.** `check` reports these.
- **Labels fit their line.** A horizontal arrow needs to be longer than its label. Make the gap wider or the label shorter.
- **Centre the composition.** The drawing should sit balanced in the canvas, not hug one corner. Size the canvas to the content.
- **Legend.** End with a `legend` statement listing only the styles you used.
