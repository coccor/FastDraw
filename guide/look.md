# Writing a look

A look is one text file (`.look`) that decides how every style is drawn: colours, fonts, shapes, lines and text. Diagrams point to it with `look "./team.look"`. Change the look and every diagram that uses it changes.

Eleven looks ship with FastDraw and need no file: `look engraved`, `look headline`, `look keys`, `look listing`, `look night`, `look offset`, `look reference`, `look shade`, `look sketch`, `look transit` and `look whiteboard` (a bare name, no quotes or `.look`). Six of them are styles of drawing more than palettes: `shade` (hairline boxes with a hatched shadow), `engraved` (double rules and a black plate, like a printed plate), `keys` (boxes with a side, like keycaps), `transit` (thick route lines with stops, like a network map), `offset` (two inks printed out of register) and `listing` (a printout on striped listing paper). In the editor, the **Look** button shows the diagram in each of them and the built-in look, to try one before keeping it.

## How to work

1. Start from the built-in look: `fastdraw init-look team.look`. It has every style the guides rely on, so you change values instead of inventing structure.
2. Edit the file.
3. Run `fastdraw preview-look team.look` and **look at the PNG**. It draws every style on one sheet. `fastdraw sizes team.look` lists the styles and reports mistakes.
4. Render a real diagram with it (`fastdraw render some.fdraw`) before calling it done. A look that is fine on the sheet can still be too heavy or too faint in a real composition.

Keep the style names from the built-in look (`node`, `focal`, `store`, `cloud`, `external`, `optional`, `step`, `terminal`, `terminal-focal`, `decision`, `zone`, `bar`, `arrow`, `primary`, `link`, `return`, `lifeline`, `rule`, `h1`, `eyebrow`, `caption`, `note`, `small`). The diagram guides and existing diagrams use those names. You may add more styles of your own.

The looks that ship with FastDraw all define the same styles (the ones above plus `kicker`, `dek`, `legend`, `table`, `matrix`, `chart`, `relation`, `sticky`, `sticky-orange` and `sticky-violet`), so a diagram can move between them without a style going plain. A test holds them to that: after editing one in `looks/`, run `node tools/bundle-looks.mjs`. The six style looks are written by `tools/gen-style-looks.py`; change them there.

## The file

One statement per line; an indented line continues the one above; `//` starts a comment.

```
canvas paper=paper dots=ink/0.06 dotgap=22      // paper= background colour; dots= dot colour and dotgap= spacing are optional; a diagram's own canvas line can override any of the three
                                                 // sketch=1 draws every outline and line by hand (2 is rougher); see looks/sketch.look
                                                 // bars=colour stripes the page like listing paper (bargap= is the stripe height), feed=colour adds
                                                 // sprocket holes down both edges, grain=0.5 lays paper grain over everything (0 to 1)
                                                 // tint=hue or tint=alpha: how colour/opacity tints mix (see Colours)

color paper  #ffffff                             // a named colour
color ink    #1c1f2a
color accent #0e7c66

font sans  "Geist"                               // the three font roles
font mono  "Geist Mono"
font serif "Newsreader"

style node shape=rect radius=4 size=144x64 fill=#ffffff stroke=ink sw=1.2
    use="default box: a service, component or step"
style focal extends node fill=accent/0.08 stroke=accent

style arrow line stroke=ink sw=1.3 route=ortho radius=6
style h1 text font=serif size=28 weight=400 color=ink

guidance "Use focal on at most two things in one diagram."
```

### Colours

A colour value is `#hex`, a name defined with `color`, or either followed by `/opacity`: `ink/0.3`, `#ffffff/0.85`. `none` means no fill or no stroke. Define `paper`, `ink` and `muted` at least; built-in parts fall back to those names. `card` is the fill of a plain box (white unless a look sets it; a dark look sets it to its box colour), so a diagram that writes `fill=card` stays right in every look.

On a light page a tint such as `amber/0.1` is the colour at that opacity over what is underneath. On a dark page that blend loses the hue: 10% of amber over navy is grey. So when `paper` is dark, a tint of a coloured colour is mixed so it keeps its hue: it gets lighter and takes on the tint's colour as if the page were neutral grey, and stays see-through. `amber/0.1` on Night is a dark amber, the counterpart of the pale amber on the built-in look, so one diagram reads in both. Tints of greys (`ink/0.06`) are blended as before. `canvas tint=alpha` turns this off for a dark look; `canvas tint=hue` turns it on for a light one.

### Fonts

`font sans|mono|serif "Family"` sets the family for each role; styles then say `font=sans`.

Five families are bundled and always available: **Geist**, **Geist Mono** and **Newsreader** (the built-in look), **Libre Franklin** and **Instrument Serif**. To use any other font, put its files in a folder next to the look and name the folder:

```
fontdir "./fonts"            // relative to the look file
font sans "Fira Sans"
```

- Files must be **TTF or OTF**, one file per weight and style you use (for example Regular and SemiBold; add Italic if a style sets `italic=1`). Box titles use weight 600 by default. Use static files, not a single variable font.
- The family name is read from inside the files, so `font sans "..."` must match it exactly. `fastdraw sizes team.look` lists the fonts and flags any family it found no file for; `fastdraw check` warns about it too.
- Commit the font folder with the look, and keep the font's licence file beside it. Use fonts whose licence allows redistribution (for example the SIL Open Font License).
- Ligatures are turned off in every font, in the editor, the SVG and the PNG: `--`, `->`, `>=`, `!=` and `...` are drawn as the characters written, never as one joined glyph, so code, command-line flags and SQL read as typed.
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
| `hatch=colour` | fill with diagonal pencil lines on top of `fill=`; `hatch.gap=` spaces them, `hatch.sw=` weighs them |
| `halftone=colour` | fill with a field of printed dots; `halftone.gap=` spaces them, `halftone.r=` sizes them |
| `shade=colour` | a shadow of fine diagonal lines down the right and bottom of the shape; `shade.size=` is how far it reaches (default 5), `shade.gap=` and `shade.sw=` space and weigh its lines |
| `depth=N` | a slab N pixels below the shape, so it reads as a solid with a side; `depth.fill=` and `depth.stroke=` colour it. A line that ends on the bottom edge ends on the slab |
| `inner=colour` | a second, finer rule just inside the outline; `inner.gap=` (default 3.5) and `inner.sw=` |
| `corners=plus` | a mark on each corner of a box: `plus` or `square`; `corners.color=`, `corners.size=` |
| `offset=dx,dy` | print the fill that far out of register with the outline |
| `blend=multiply` | let this style's ink darken what it overlaps, like overprinting (also on line and text styles) |
| `sketch=0` | with `canvas sketch=` on: draw this style with clean lines (works on line styles too) |
| `layer=back` | draw behind everything (for regions like `zone`) |
| `title.*` | the main text: `title.font`, `title.size`, `title.weight`, `title.color`, `title.italic=1`, `title.spacing` (in em), `title.caps=1`; `title.pos=top` puts it as a small caption at the top edge, `title.dy=` moves that caption up or down and `title.fill=` colours the patch behind it (`none` for no patch) |
| `sub.*` | the second line (`sub=` on an element): `sub.font`, `sub.size`, `sub.color` |
| `tag.*` | the corner marker (`tag=`): `tag.color`, `tag.border`, `tag.font`, `tag.size` |
| `ghost.*` | the big faint number (`ghost=`): `ghost.color`, `ghost.size` |

On a dark or saturated fill, set `title.color`, `sub.color`, `tag.color` and `tag.border` to something that contrasts, or the text disappears. Set these explicitly on every style; do not rely on defaults. Diagrams also lay their own text over boxes (a caption drawn on the subject): where a style's fill would swallow that text, it is drawn in the style's `title.color` instead, so a dark `focal` needs a light `title.color`.

Keep type close to the built-in look's sizes (12px titles, 9px second lines, 10px line labels). Diagrams are laid out for those, so larger type overflows boxes that fit before.

The tag sits 8px in from the top-left corner and is 12px tall, so keep a path's details (a cylinder rim) out of the top 20px or flatten them. A `title.pos=top` caption is centred on the top edge with a patch behind it, 6px wider than the words on each side. A patch that crosses the outline is paper-coloured, so the edge stops at the words; one that sits inside the shape takes the shape's own fill, so it hides the page dots behind the words and is otherwise invisible.

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
| `tail=` | a marker for the start of the line, if the style always has one. `stop` is a ring, like a station on a route map (`stop.color=`) |
| `head.size=` | scale the arrowhead, for a wide line (1 is the default; 0.5 to 4) |
| `cap=round` | round the ends and corners of the line |
| `casing=colour` | a wider line of that colour underneath, so lines that cross stay apart; `casing.width=` is how far it shows on each side |
| `double=colour` | a finer line of that colour on top, which turns a wide line into two rails; `double.sw=` |
| `label.*` | the text on the line: `label.font`, `label.size`, `label.color`, `label.spacing`, `label.caps=0` to keep the label's own case (default is capitals), `label.weight`, `label.italic=1`. `label.fill=` and `label.border=` make the label a plate instead of a patch of paper (`label.radius=`, `label.pad=`, `label.sw=`) |

**Text styles** (`style name text ...`): `font=`, `size=`, `weight=`, `color=`, `italic=1`, `spacing=`, `caps=1`. `echo=colour` prints the text a second time underneath, a little off (`echo.dx=`, `echo.dy=`, default 3).

### Built-in styles you can restyle

`rect`, `ellipse`, `diamond`, `polygon`, `freehand`, `arc`, `table`, `chart`, `text`, `arrow`, `line`, `relation` and `legend` exist in every look. A style can also be built on `polygon` or `arc` (`style slice extends arc stroke=paper sw=2`); the corners and angles are still given on each element. Redefine one to change it. For the legend: `style legend extends legend rule=ink/0.2 title="Key" title.font=sans item.size=10`. Its keys are `rule` (the line's colour), `title` (heading text, or `none`), `title.font`, `title.size`, `title.color`, `title.spacing`, `title.caps`, and `item.font`, `item.size`, `item.color` for the entries.

### Icons

Every look starts with a set of built-in icons (see `fastdraw sizes`), each as an outline, solid or duotone: about 130 with friendly names, and every other Phosphor icon under Phosphor's own name (`anchor`, `acorn`; `fastdraw icons <word>` finds them; a Phosphor name that a friendly name already uses, such as `book`, is `ph-book`). Add your own, or replace one, with

```
icon queue "M4 6h16" "M4 12h16" "M4 18h16"
```

The quoted parts are SVG path data drawn in a 24x24 box; they are stroked, not filled, in the colour of the box's text. Keep to simple outlines with a 1.5 stroke in mind, so they sit with the built-in ones. An icon of your own (or one you replace) is an outline only: it has no solid or duotone style. A style can carry an icon (`style store extends node icon=database`), and `icon.size=`, `icon.color=`, `icon.pos=top` work in a style too.

**Colour icons and vendor sets** go in a folder of SVG files next to the look:

```
icondir "./icons"
```

Every `.svg` file directly in that folder becomes an icon, drawn exactly as the file looks, in its own colours. The icon's name is the file name in small letters with everything that is not a letter or digit turned into `-`, and a leading number-and-`icon-service-` prefix dropped: `10021-icon-service-Virtual-Machine.svg` is `icon=virtual-machine`, `Load Balancer.svg` is `icon=load-balancer`. `fastdraw icons team.look` lists them and `fastdraw icons team.look storage` searches. This is how a team adds, say, the Azure or AWS architecture icons: download the set from the vendor, copy the files you use into the folder, and commit them with the look (check the vendor's terms first; FastDraw ships none of them).

- A file icon keeps its colours; `icon.color=` does not apply to it.
- Files over 300 KB are skipped. Only the icons a diagram uses are carried inside its exported image.
- A file with the same name as a built-in icon replaces it.

### Guidance

`guidance "..."` lines are shown to agents by `fastdraw sizes`. Use them for rules a drawing tool cannot enforce: how many accent elements are allowed, when to use `tag=`, what `sub=` is for.

## What makes a look good

- **On dark paper, tints are quiet.** A tint (`accent/0.15`) keeps its hue but stays dark; for the one thing that must stand out, a solid accent with dark text on it is clearer.
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
