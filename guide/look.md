# Writing a look

A look is one text file (`.look`) that decides how every style is drawn: colours, fonts, shapes, lines and text. Diagrams point to it with `look "./team.look"`. Change the look and every diagram that uses it changes.

## How to work

1. Start from the built-in look: `fastdraw init-look team.look`. It has every style the guides rely on, so you change values instead of inventing structure.
2. Edit the file.
3. Run `fastdraw preview-look team.look` and **look at the PNG**. It draws every style on one sheet. `fastdraw sizes team.look` lists the styles and reports mistakes.
4. Render a real diagram with it (`fastdraw render some.fdraw`) before calling it done. A look that is fine on the sheet can still be too heavy or too faint in a real composition.

Keep the style names from the built-in look (`node`, `focal`, `store`, `cloud`, `external`, `optional`, `step`, `terminal`, `terminal-focal`, `decision`, `zone`, `bar`, `arrow`, `primary`, `link`, `return`, `lifeline`, `rule`, `h1`, `eyebrow`, `caption`, `note`, `small`). The diagram guides and existing diagrams use those names. You may add more styles of your own.

## The file

One statement per line; an indented line continues the one above; `//` starts a comment.

```
canvas paper=paper dots=ink/0.06 dotgap=22      // paper= background colour; dots= dot colour and dotgap= spacing are optional

color paper  #ffffff                             // a named colour
color ink    #1c1f2a
color accent #0e7c66

font sans  "Geist"                               // the three font roles
font mono  "Geist Mono"
font serif "Instrument Serif"

style node shape=rect radius=4 size=144x64 fill=#ffffff stroke=ink sw=1.2
    use="default box: a service, component or step"
style focal extends node fill=accent stroke=accent title.color=#ffffff

style arrow line stroke=ink sw=1.3 route=ortho radius=6
style h1 text font=sans size=22 weight=600 color=ink

guidance "Use focal on at most two things in one diagram."
```

### Colours

A colour value is `#hex`, a name defined with `color`, or either followed by `/opacity`: `ink/0.3`, `#ffffff/0.85`. `none` means no fill or no stroke. Define `paper`, `ink` and `muted` at least; built-in parts fall back to those names.

### Fonts

`font sans|mono|serif "Family"` sets the family for each role; styles then say `font=sans`.

Three families are bundled and always available: **Geist**, **Geist Mono** and **Instrument Serif**. To use any other font, put its files in a folder next to the look and name the folder:

```
fontdir "./fonts"            // relative to the look file
font sans "Fira Sans"
```

- Files must be **TTF or OTF**, one file per weight and style you use (for example Regular and SemiBold; add Italic if a style sets `italic=1`). Box titles use weight 600 by default. Use static files, not a single variable font.
- The family name is read from inside the files, so `font sans "..."` must match it exactly. `fastdraw sizes team.look` lists the fonts and flags any family it found no file for; `fastdraw check` warns about it too.
- Commit the font folder with the look, and keep the font's licence file beside it. Use fonts whose licence allows redistribution (for example the SIL Open Font License).
- In the browser editor the look's fonts load when a folder is open. A diagram opened as a single file, pasted, or restored from an exported image is drawn with fallback fonts until its folder is opened.

### Styles

`style name [extends other] [line|text] key=value ...`

- A style is a shape style unless you write `line` or `text` after the name.
- `extends other` starts from another style's values. Define the base first.
- `use="..."` is a short description shown to agents and in the editor's gallery. Write one for every style.

**Shape styles**

| Key | Meaning |
|---|---|
| `shape=` | `rect`, `ellipse`, `diamond`, `path`, or `table` (a header and rows, see below) |
| `path="..."` | with `shape=path`: an outline written in a box that runs from 0,0 to 1,1 and is stretched to the element. Commands `M`, `L`, `C`, `Q`, `Z` only, absolute. Example cylinder: `"M0,0.1 C0,-0.035 1,-0.035 1,0.1 L1,0.9 C1,1.035 0,1.035 0,0.9 Z M0,0.1 C0,0.235 1,0.235 1,0.1 C1,0.235 0,0.235 0,0.1"`. Every part of a path is filled, so a detail line such as the rim is traced there and back to enclose no area |
| `radius=` | corner radius of a `rect`; half the height or more makes a pill |
| `size=WxH` | default size when a diagram gives none |
| `fill=`, `stroke=`, `sw=`, `dash=5,4` | fill colour, stroke colour, stroke width, dash pattern |
| `layer=back` | draw behind everything (for regions like `zone`) |
| `title.*` | the main text: `title.font`, `title.size`, `title.weight`, `title.color`, `title.italic=1`, `title.spacing` (in em), `title.caps=1`; `title.pos=top` puts it as a small caption at the top edge |
| `sub.*` | the second line (`sub=` on an element): `sub.font`, `sub.size`, `sub.color` |
| `tag.*` | the corner marker (`tag=`): `tag.color`, `tag.border`, `tag.font`, `tag.size` |
| `ghost.*` | the big faint number (`ghost=`): `ghost.color`, `ghost.size` |

On a dark or saturated fill, set `title.color`, `sub.color`, `tag.color` and `tag.border` to something that contrasts, or the text disappears. Set these explicitly on every style; do not rely on defaults.

The tag sits 8px in from the top-left corner and is 12px tall, so keep a path's details (a cylinder rim) out of the top 20px or flatten them. A `title.pos=top` caption is centred on the top edge with a paper-coloured patch behind it.

**Table styles** (`shape=table`) use `fill`, `stroke`, `sw`, `radius`, `dash` and `title.*` like any box, plus:

| Key | Meaning |
|---|---|
| `head.fill=`, `head.h=` | the header band's colour and height (default 32) |
| `row.h=` | row height (default 24) |
| `cell.font=`, `cell.size=`, `cell.color=` | cell text; `cell.color` is the first column |
| `detail.color=` | text colour of every column after the first |
| `rule=` | colour of the thin lines between rows; `rules=0` removes them |
| `cell.pad=`, `cell.gap=` | space at the left and right edges (default 12) and between columns (default 16) |
| `align=center`, `grid=1` | centre the columns after the first; draw lines between columns |

**Chart styles** (`style name extends chart ...`): `stroke=` and `sw=` are the axis lines, `fill=` the plot background, and:

| Key | Meaning |
|---|---|
| `tick.font=`, `tick.size=`, `tick.color=` | tick labels |
| `value.font=`, `value.size=`, `value.color=` | the numbers written by `labels=1` |
| `axis.font=`, `axis.size=`, `axis.color=` | axis titles and the series key |
| `grid.color=` | grid lines |
| `bar.radius=`, `bar.width=` | bar corner radius; share of the category width the bars fill |
| `title.*` | the chart's title |

**Line styles** (`style name line ...`)

| Key | Meaning |
|---|---|
| `stroke=`, `sw=`, `dash=` | colour, width, dash pattern |
| `route=` | `ortho` (right-angle turns), `straight`, or `curve` (a smooth line) |
| `radius=` | corner radius of the turns |
| `head=` | the marker `->` draws: `arrow` (default), `open`, `triangle`, `diamond`, `diamond-solid`, `dot`, `circle`, or one of the relationship ends (`one`, `only-one`, `many`, `one-many`, `zero-one`, `zero-many`). `head=none` marks a style meant for plain lines, never arrows |
| `tail=` | a marker for the start of the line, if the style always has one |
| `label.*` | the text on the line: `label.font`, `label.size`, `label.color`, `label.spacing`, `label.caps=0` to keep the label's own case (default is capitals) |

**Text styles** (`style name text ...`): `font=`, `size=`, `weight=`, `color=`, `italic=1`, `spacing=`, `caps=1`.

### Built-in styles you can restyle

`rect`, `ellipse`, `diamond`, `polygon`, `arc`, `table`, `chart`, `text`, `arrow`, `line`, `relation` and `legend` exist in every look. A style can also be built on `polygon` or `arc` (`style slice extends arc stroke=paper sw=2`); the corners and angles are still given on each element. Redefine one to change it. For the legend: `style legend extends legend rule=ink/0.2 title="Key" title.font=sans item.size=10`. Its keys are `rule` (the line's colour), `title` (heading text, or `none`), `title.font`, `title.size`, `title.color`, `title.spacing`, `title.caps`, and `item.font`, `item.size`, `item.color` for the entries.

### Icons

Every look starts with a set of outline icons (see `fastdraw sizes`). Add your own, or replace one, with

```
icon queue "M4 6h16" "M4 12h16" "M4 18h16"
```

The quoted parts are SVG path data drawn in a 24x24 box; they are stroked, not filled, in the colour of the box's text. Keep to simple outlines with a 1.5 stroke in mind, so they match the bundled ones. A style can carry an icon (`style store extends node icon=database`), and `icon.size=`, `icon.color=`, `icon.pos=top` work in a style too.

### Guidance

`guidance "..."` lines are shown to agents by `fastdraw sizes`. Use them for rules a drawing tool cannot enforce: how many accent elements are allowed, when to use `tag=`, what `sub=` is for.

## What makes a look good

- **On dark paper, use solid fills for the accent.** A translucent tint (`accent/0.15`) over a dark background turns muddy; a solid accent with dark text on it stays clean.
- **Decide the accent first.** One colour carries the focus (`focal`, `terminal-focal`, `primary`). Everything else is ink, greys and paper. A look with three bright colours has no focus.
- **Separate by more than colour.** `external`, `optional`, `cloud` and `store` should differ in shape, fill or dash, so they read in greyscale and for colour-blind readers.
- **Two or three stroke weights at most**, and the accent arrow slightly heavier than the default arrow.
- **Check contrast** of text on every fill, and of faint things (`zone`, `lifeline`, `rule`) against the paper: visible, but quieter than the boxes.
- **Keep default sizes on a 4px grid** and the same height for the box styles that share a row.
- **Mono type is for technical detail** (paths, ports, commands), not for names.

## Limits today

- Shapes cannot contain extra drawn details beyond the outline, one icon, the tag and the ghost number. The tag's position is fixed. Icons are outlines in one colour.
- The background can have dots but not grid lines.
- `path` outlines have no arcs (`A`); use curves (`C`, `Q`). Arrows attach to the outline's bounding box.
- Exported images carry the diagram and look but not the font files, so someone reopening an image without the repo sees fallback fonts for any font that is not bundled.
