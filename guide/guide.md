# FastDraw guide

FastDraw draws diagrams from a small text file (`.fdraw`). You place every element yourself, at exact coordinates. A separate look file (`.look`) decides how each named style is drawn. A person may later edit the same file in a visual editor, so keep it tidy.

## How to work

1. To create or change a look (how styles are drawn), run `fastdraw guide look` instead of the steps below.
2. When the diagram is of something in the code (a system, a request, a pipeline), first learn it as described in "Know the system first" below. Do not pick a kind from the request's wording alone.
3. Choose the kind of diagram and its scope as described in "Choosing the kind" below (`fastdraw guide list` says what each kind shows), and agree them with the person before drawing. If the kind has its own guide, run `fastdraw guide <kind>` and follow it; where it differs from the general rules in this guide, the kind's guide wins.
4. Run `fastdraw sizes <look file>` to see the styles you can use, their default sizes, and the look's own guidance. Follow that guidance. A diagram with no `look` line uses the built-in look: run `fastdraw sizes` with no file to see it.
5. Plan the composition on paper first: rows and columns, where the main thing sits.
6. Write the file. A new diagram goes in `docs/diagrams/` (create the folder) unless the person names another place or the repo already keeps its `.fdraw` files somewhere. Never put it at the top of the repo: `fastdraw open` lends the diagram's whole folder to the editor.
7. Run `fastdraw check <file>`. Fix every error and warning. Read the hints and fix the ones that are real.
8. Run `fastdraw render <file>` and **look at the PNG**. Fix what looks wrong: cramped labels, uneven gaps, lopsided composition, a label sitting on a border. Repeat from 7 until it is clean and looks good.
9. When the diagram is done, tell the person where the file is and **ask what they want to do next**, with these three choices (use your tool for asking a question if you have one). Always ask; do not stop without it.
   - **Open in fastdraw.dev**: run `fastdraw open <file>` in the background. It opens the web editor at the diagram, with its look, and saves their edits into the same file. Read its output and give the person the link it prints, in case no browser window appeared. Read the file again before you change it after that.
   - **Preview as PNG**: open the PNG from `fastdraw render` in their image viewer (`xdg-open <file.png>` on Linux, `wslview` or `explorer.exe` under WSL, `open` on macOS, `start ""` on Windows).
   - **Nothing**: stop there.

   Do not open anything before they choose.

When you change an existing diagram: do not move, resize or restyle anything that is already there unless asked. Place only what you add, in free space.

When the diagram has to go where people use draw.io (a Confluence page with the draw.io app, say), run `fastdraw render <file> -o <name>.drawio` once it is checked. It writes a draw.io file whose boxes, lines and texts draw.io edits. Tell the person to open it in draw.io, or, on the page, to edit the draw.io diagram and use File → Import from → Device (or open the file in a text editor, copy all of it and paste it onto the draw.io page). Keep the `.fdraw` file: it stays the one you change, and you export again after a change.

## Know the system first

A diagram of a real system is only as good as your knowledge of it. Before choosing a kind, read enough of the code to list:

- **The parts.** Every project, service, app, worker, job and store involved, and what each is for. A repo with several projects (a `src/` per service, a solution with many projects, a monorepo's `apps/` and `packages/`) means several parts: open each one, not only the first.
- **How they talk.** For each connection: who calls whom, and how (HTTP or gRPC client, queue or topic, shared database, file, webhook, SDK of an outside service). Find it in the code that sends: HTTP clients and their base URLs, message publishers and subscribers, connection strings, configuration and deployment files.
- **The paths through it.** Where a request or event enters, which parts it passes in which order, and where it ends. A system usually has several (a user request, a background job, an incoming webhook); note each one.

If you can hand work to helpers that read code, give each project to one. Keep the list in your notes; the diagram is drawn from it.

Then judge the size. When the list has more parts or paths than one readable picture holds (about a dozen boxes), do not shrink it to a few vague boxes such as "Backend" and "Services". Propose either an overview that names every part plus one diagram per main path, or one diagram of the path the person cares about.

## Choosing the kind

Choose by what the reader has to understand, not by a word in the request: a "request flow" or a "user flow" is not a flowchart, and "architecture diagram" is often said of any picture of a system. `fastdraw guide list` says what every kind shows. The usual choices:

| The reader has to see | Kind |
|---|---|
| how a request moves through the parts of a system, step by step | `swimlane` with columns; `sequence` when the exact messages and replies matter; `architecture` when the parts and their connections matter more than the order |
| decisions: yes/no questions and where each answer leads | `flowchart` |
| work passing between people or teams | `swimlane` with rows; `process` when inputs, outputs and tools matter |
| the parts of a system and what talks to what | `architecture`; where it runs: `deployment`; what plugs into a platform: `integration` |
| a change to a system, before and after | `architecture-delta` |
| data moving through a pipeline | `data-flow`; storage tiers: `medallion`; a whole data stack: `high-level` |
| the states one thing goes through | `state` |
| events in order, or a plan | `timeline`; `gantt` |
| a hierarchy | `tree`; owners: `org-chart`; containment: `nested`; stacked levels: `layers` |
| a data model | `er`; real tables: `db-schema`; classes: `uml-class` |
| numbers | `bar`, `line`, `scatter`, `heatmap`, `sankey`, `treemap`, `waterfall` |

- Name at least two kinds that could fit before you pick. When two fit, pick the one whose main axis is what the person asked about: order over time, structure, or decisions.
- Draw a flowchart only when there are real yes/no questions. Steps in a row with no decision are a swimlane, or a process.
- If a three-column table would say the same thing, write the table instead.

**Agree the kind and the scope before drawing.** Skip this only when the request names exactly one kind and nothing in it pulls toward another ("a sequence diagram of the login"). A request that mixes words of two kinds ("request flow architecture diagram": the order of a request, or the parts and their links?) names neither; ask. In one short message, using what you learned about the system:

- the kind you would draw and the closest other kind, with a line on what each would show of *this* system;
- when the system has several paths, which one to draw (name them);
- when it is too big for one picture, the split you propose (an overview plus one per path).

Use your tool for asking a question if you have one, your pick first. If you cannot ask, draw your pick and say which other kind, path or split would also have worked.

## The file

One statement per line. An indented line continues the statement above it. `//` starts a comment; so does a line starting with `# `.

```
look "./team.look"          // path relative to this file; leave the line out to use the built-in look
                            // or a look that ships with FastDraw: look reference | shade | sketch | whiteboard
                            //   (each has a dark version, drawn in the dark theme and by render --dark; name the light one)
                            // or one on GitHub, by its address: look "https://raw.githubusercontent.com/coccor/fastdraw-looks/main/engraved.look"
                            //   (coccor/fastdraw-looks also has headline, keys, listing, offset and transit; azure, aws, gcp and kubernetes:
                            //   a cloud's colours, its own icons and its groups such as vpc and resource-group; and print, blueprint,
                            //   high-contrast and terminal)
                            // for a dark theme, keep the line and run  fastdraw render x.fdraw --dark  to get x-dark.png too
canvas paper=#ffffff dots=none dotgap=24   // optional: changes the look's background for this diagram only
                            // the page pattern can be dots=, grid=, lines= (ruled), cross= (small + marks), iso= (isometric dots),
                            //   bars= (stripes), diag= (45-degree lines), graph= (graph paper) or hex= (hexagons), each a colour such
                            //   as ink/0.08, with a gap key: dotgap= gridgap= linegap= crossgap= isogap= bargap= diaggap= graphgap= hexgap=

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
- `freehand` is what the editor's Draw tool writes when a person sketches with the pointer: `freehand at x,y points=...`, a smooth open line with round ends, 2px wide, that lines and labels may cross. Leave such lines as they are when editing a file; do not write them yourself, a diagram written as text is made of boxes, lines and polygons.

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
| `dots` | points only. With a numeric x axis each point is `x,y` or `x,y,radius`; with categories a pair is `value,radius` (a bubble). `r=5` sets one radius for all, `opacity=0.6` thins them |

- `_` in place of a number leaves a gap.
- One bar or dot can take its own colour by its position from 1: `| bars "Sales" 72 88 110 fill=soft fill.3=accent`. `fill=` together with `stroke=` gives bars and dots an outline.
- A floating bar that does not start at zero is labelled as a change, with a plus sign on a rise.
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
| `grid=0`, `grid=both`, `grid=x` | no grid lines; vertical ones too; vertical ones only |
| `stroke=none` | no axis lines |
| `zero=0` | no line at zero when the y range runs from negative to positive |
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
- A row can have its own tint: `| late "Shipping" "3 days" fill=accent/0.1`. One cell can too, by column number from 1: `| "Analyst" "read" "none" fill.2=accent/0.15 color.3=muted`. That is how a matrix or heatmap shows levels.
- A row with a single cell, in a table with more columns, runs across the full width (an index name, a note).
- The header text may have two lines (`"«interface»\nPaymentMethod"`); `title.align=left` puts it at the left.
- `align=center grid=1` on the table centres every column after the first and draws column lines, for a matrix.
- Rows come last in the statement. Properties of the table itself go on the first line.

An arrow can end on a row: `orders.user_id -- users.id`. It attaches to the left or right edge of the table, level with that row, on the side facing the other end; `users.id.left` forces a side.

### Icons

`icon=name` puts a small icon in any box: `db: store "Orders DB" icon=database at 440,120`. `fastdraw sizes` lists the icons the look has (server, database, user, cloud, queue, lock, mail, function, ai and about 120 more with friendly names, plus every other Phosphor icon under its own name, about 1,500 in all). `fastdraw icons email` searches them by name or meaning: it finds `mail`, and `k8s` finds `pod`.

- The icon sits just left of the text and the pair is centred. `icon.pos=top` puts it above the text instead; the box then needs about 28px more height. On a zone, `icon.pos=corner` draws the icon as a tab in its top-left corner with the zone's name beside it, as cloud providers draw a group's icon (`icon.size=` sets the tab, 24 by default).
- With no text, the icon fills the box.
- An icon on its own, with no box, is the `icon` style: `api: icon "Orders API" at 60,220 40x40 icon=server` (24x24 unless you give `WxH`). The icon is the shape, so `fill=`, `stroke=` and `sw=` style the icon itself (`fill=accent/0.2 stroke=accent sw=2`), and its text is a caption centred underneath. Lines attach to the icon and go around other icons' captions.
- `icon.size=20` and `icon.color=link` change it; by default it takes the colour of the box's text.
- `icon.fill=accent/0.2` lays a tint under the icon's main part for a two-tone look (none by default), and `icon.width=2` sets its line thickness in pixels; a built-in icon comes in four weights (thin, light, regular, bold), and the nearest is used. Both take look colours, tints or hex (`icon.fill=#ffd400`), and both work in a look's `style` lines so every box of a style gets the same.
- `icon.style=solid` draws a built-in icon filled in one colour, and `icon.style=duotone` draws its outline over a light tint of the same drawing (`icon=database icon.style=duotone`). They take `icon.color=` (on an `icon` shape, `stroke=`); a duotone's tint is `icon.fill=` when set, else a light shade of the icon's colour. Outline, solid and duotone are the same drawing; every built-in icon has all three, a look's own icons only the outline. Keep one style across a diagram.
- A look can bring its own colour icons (a cloud vendor's set, product logos), best by their web address from a recommended source (`fastdraw guide look`, Icons). Use them the same way: `icon=virtual-machine`. They keep their own colours. A set in a folder next to the look is listed by `fastdraw sizes <look>` and searched by `fastdraw icons <look> word`; for a set on the web, `fastdraw icons <look> word` searches it too. When `fastdraw sizes` says the look hides the built-in icons, use the look's own.
- Use icons where they say something the name does not (what kind of thing a box is), on every box of a row or on none. Two or three kinds of icon in one diagram is plenty.

A shape's text is styled with `title.size=`, `title.color=`, `title.weight=`, `title.font=` (and `sub.` the same for the second line).

Any appearance property can be overridden on one element: `fill=`, `stroke=`, `sw=` (stroke width), `dash=4,3`, `radius=`. `opacity=0.5` draws the whole element (box, line or text, with its text and arrowheads) see-through, from `0` to `1`. `rotate=30` turns a shape clockwise about its middle, by any angle in degrees (negative turns it the other way); its text, icon and caption turn with it, and lines attach to its turned sides. Lines themselves do not turn. Colours are `#hex`, a colour name from the look, or either followed by `/opacity` (`ink/0.3`). Prefer the look's styles; override only with a reason. For `sw=`, leave the style's width unless a line or outline must read heavier or lighter than its kind; then `sw=1` (thin), `sw=1.6` (medium) or `sw=2.4` (bold) are the widths a person can pick again in the editor, and any other width shows there as the nearest of them.

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
| `stealth` | filled arrowhead swept back to a notch | a sharper default head |
| `double` | two filled arrowheads in a row | a fast or repeated flow |
| `half` | one stroke on the left side, a harpoon | an asynchronous message, one half of a two-way pair |
| `triangle` | hollow triangle | inherits from / implements (points at the parent) |
| `diamond`, `diamond-solid` | hollow or filled diamond | aggregation, composition (sits on the owner) |
| `dot`, `circle` | filled or hollow circle | a start point, a provided interface |
| `square`, `square-solid` | hollow or filled square | a port, a stub end |
| `bar` | a short bar across the end | blocks, inhibits, a hard stop |
| `cross` | an X on the end | rejected, cancelled, destroyed |
| `stop` | a ring the line runs into | a station on a route (`stop.color=` colours the ring) |
| `one`, `only-one` | one bar, two bars | exactly one |
| `many`, `one-many` | crow's foot, crow's foot and bar | many, one or more |
| `zero-one`, `zero-many` | circle and bar, circle and crow's foot | optional one, optional many |
| `none` | nothing | removes a head the operator would draw |

Example: `orders.user_id -- users.id tail=many head=only-one` reads "many orders, exactly one user". A `--` that ends on a table row uses the built-in `relation` style (right-angled, no head) rather than a slanted line.

An end can be:

| Form | Meaning |
|---|---|
| `api` | the shape; FastDraw picks the side that faces the other end |
| `api.right` | a side: `top`, `bottom`, `left`, `right` |
| `api.right@0.25` | a point along that side, as a fraction (0 = top or left end) |
| `api.right@172` | a point along that side at absolute coordinate 172 (y for left/right, x for top/bottom) |
| `400,300` | a free point; either number may be negative (`-40,-20`) |
| `+0,260` | a point relative to the other end: one of the numbers carries a `+` (`+40,-20`, `-40,+0`); only one end may be relative |
| `users.email` | a row of a table: the edge of the table level with that row. `users.email.left` picks the side |
| `life1@176` | a point on another line: where line `life1` has coordinate 176 (y on a vertical line, x on a horizontal one); a value ≤ 1 is a fraction along it |

Routing: arrows turn at right angles with rounded corners, and go around a box that is in the way without being told. Two ends that line up give a straight line. Otherwise the arrow leaves the first shape sideways and enters the second from above or below, or uses a mid-way step. When several arrows share a side, they are spread along it automatically. Lay boxes out so the important arrows are straight; a detour is a fallback, not a design. To steer a route yourself:

- name the sides: `a.bottom -> b.left`
- add waypoints: `via=300,200` or `via=300,200;300,360`
- draw it as a smooth curve: `route=curve`. It leaves and arrives square to the sides it is attached to. `bend=40` instead bows it 40px to the left of its direction of travel (negative: to the right), which is how to draw the arcs of a cycle. `via=x,y;x,y` makes the curve pass through those points. Curves do not avoid boxes; you place them. `route=straight` gives one straight line
- a line that is meant to run behind boxes (a grid line, a guide) takes `layer=back`, and `check` stops reporting the boxes it crosses. `layer=front` draws a line on top of the shapes instead (an edge on a face)
- several lines may share one trunk, as in a tree: give them the same start point (`root.bottom@0.5 -> a.top`, `root.bottom@0.5 -> b.top`) or the same end point. Lines that overlap anywhere else are reported
- for a loop back to the same side (`x.right@190 -> x.right@220`), `loop=36` sets how far it sticks out

Labels are drawn in small caps on a paper-coloured patch, above a horizontal line or to the right of a vertical one, at the middle of the longest segment. Keep them to about 14 characters. To move one: `lside=below` (or `left` for vertical lines), or `lpos=x,y` (centre x, text baseline y; the default baseline is 10px above a horizontal line, or 18px below it with `lside=below`). `label.caps=0` keeps the label's own letter case, for paths and header names.

### Text

`text "words" at x,y style=name` — `at` is the left end of the text baseline. `anchor=middle` or `anchor=end` changes that. `width=240` makes the text a box: `at` is the left end of its first line, the words wrap to the width, and `align=center` or `align=right` lines them up in it. `rotate=-90` turns the text to read upwards about its `at` point (`rotate=90`: downwards), for a label along a vertical axis; any other angle in degrees turns it that far clockwise. Overrides: `size=`, `color=`, `weight=`, `font=sans|mono|serif`, `italic=1` (only where the font has an italic face; the bundled sans and mono do not, the serif does).

Spaces inside the quotes are drawn as written, here and in every other text (labels, `sub=`, table cells): leading spaces indent, and a run of spaces stays a run. So indented code or lined-up columns can be one text per line at the same x, with `font=mono` for the columns to line up: `text "  orders:" at 40,58 font=mono`.

### Legend

One statement draws a whole legend: a rule line, a heading, and one entry per style, spaced and wrapped for you.

```
legend at 40,404 focal="The service this is about" store="Holds data" primary="Main path" return="Response"
```

- Each `style="what it means"` pair is an entry, in the order written. Use only the styles the diagram uses.
- It is as wide as the rest of the drawing: from its x to the right edge of everything else. Give `WxH` to set another width (the height is always worked out).
- `title="Key"` changes the heading; `title=none` removes it.
- For a mark that is not a style of the look, write `swatch.COLOUR="meaning"` (a small filled square), `dot.COLOUR="meaning"` or `line.COLOUR="meaning"`, where COLOUR is a colour name from the look or a hex colour, optionally with a tint (`swatch.muted/0.2="Flow"`, `swatch.#4a7c59="Stream"`): `legend at 40,400 dot.accent="Shipped" swatch.muted="Planned" line.link="Depends on"`.
- Put it 24px under the lowest element.

### Groups

`group=name` on several elements makes the editor select and move them together. It does not change how they are drawn.

### Drawing order

Shapes whose style is marked "drawn behind everything" (zones) come first, then all connectors, then connector labels, then shapes, then free text. Within each group, file order.

### Title

A diagram that has a title puts it first: `title: text "What this shows" at 40,52 style=h1`, with an optional one-line dek under it: `text "One plain sentence saying what the diagram shows" at 40,80 style=dek` (`caption` if your look has no `dek`). A title with a dek reads like a magazine graphic. Everything else then starts at y=96 or lower. When a kind's guide gives positions that start nearer the top, they are for a diagram with no title: add 56 to every y to make room for one.

### Plain lines

A separator, an axis without a head, a grid line: write these with `--` between two points (`40,380 -- 960,380 style=rule`). `->` is for arrows.

## Composition rules

These are what make a diagram look designed. `check` enforces the mechanical ones; the rest are yours.

- **Fewer elements.** Aim for nine boxes or fewer and twelve arrows or fewer. If two boxes always go together, make them one. If an arrow says nothing the layout doesn't already say, remove it.
- **One focus.** Use the look's accent style on one or two things only.
- **A grid you can name.** Pick column x-positions and row y-positions and reuse them. Boxes in a row share a top edge and height; boxes in a column share a left edge or centre.
- **Even gaps.** Use the same gap between neighbours along a row (48–56px between boxes that an arrow with a label connects; at least 40px otherwise).
- **Margins.** There is no page: the picture is everything drawn plus a 40px margin on every side, added for you. By convention start the drawing at 40,40 (the title's baseline at 40,52).
- **Straight arrows where possible.** Line things up so the main path is straight lines. Use elbows for branches.
- **No arrow through a box, no arrow on top of another, no label touching a box or another line.** `check` reports these.
- **Labels fit their line.** A horizontal arrow needs to be longer than its label. Make the gap wider or the label shorter.
- **Centre the composition.** The drawing should sit balanced, not lean to one side: centre rows, titles and branches over the width of the drawing (left edge of the leftmost element to right edge of the rightmost).
- **Legend.** End with a `legend` statement listing only the styles you used.
