# Writing a look

A look is one text file (`.look`) that decides how every style is drawn: colours, fonts, shapes, lines and text. Diagrams point to it with `look "./team.look"`. Change the look and every diagram that uses it changes.

Five looks ship with FastDraw and need no file: `look night`, `look reference`, `look shade`, `look sketch` and `look whiteboard` (a bare name, no quotes or `.look`). `shade` is a style of drawing more than a palette: hairline boxes with a hatched shadow.

A look can also be named by the https address of its file, such as one in a public GitHub repository: `look "https://raw.githubusercontent.com/coccor/fastdraw-looks/main/engraved.look"`. The repository coccor/fastdraw-looks holds cloud looks, each at that address with its own name: `azure`, `aws`, `gcp` and `kubernetes` are drawn the way each one's own documentation draws diagrams (AWS without boxes, each service an icon with its name under it, in boxes 144x104, and groups with their icon as a corner tab; Google Cloud as nested coloured panels of white cards), with its own icons (`icon=app-service`, `icon=lambda`, `icon=bigquery`, `icon=deploy`) and extra styles for its groups (`resource-group`, `vnet`, `vpc`, `public-subnet`, `region`, `project`, `cluster`, `namespace`); `fastdraw sizes` and `fastdraw icons` on the address list them. It holds looks for a use: `print` (black and greys only; things differ by weight, dashes and texture, for printing in black and white), `blueprint` (white outlines on bright blue squared paper, groups as double-line walls, everything one white), `high-contrast` (black on white, heavy lines, every style told apart by more than colour, for low vision and colour blindness) and `terminal` (one monospace face on near-black; keep text in boxes short). It holds company styles: `carbon` (IBM's technical diagrams: small nodes as a coloured square with a white icon and the name under it, black circles for people, large colour-block nodes for the subject and `compute`, framed groups `cloud-group`, `region`, `az`, `subnet`, `security-group`), `vercel` (Vercel's docs: boxes of words in regular Geist, a hatched outer panel with `region` and grey `panel` inside, a browser-window `external`, `chip` and `badge`, line labels on pills) and `figjam` (a FigJam board: flat shapes without outlines, violet circles where a flow starts, terracotta diamonds, stickies, sections named on a tag above their corner, `cursor` and `name-tag`). It also holds `tiles` (white tiles without outlines on a soft shadow, groups named beside a round badge on their corner, labels on dark pills, status dots). And six more styles of drawing: `engraved` (double rules and a black plate, like a printed plate), `headline` (flat blocks under a serif headline, like a newspaper graphic), `keys` (boxes with a side, like keycaps), `listing` (a printout on striped listing paper), `offset` (two inks printed out of register) and `transit` (thick route lines with stops, like a network map). The command line fetches a look named this way on every run and keeps a copy, which `--offline` uses. In the editor, the **Look** button shows the diagram in each look and the built-in one, to try one before keeping it; **From GitHub** in the same panel lists the looks in any public repository.

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
canvas paper=paper dots=ink/0.06 dotgap=22      // paper= background colour; dots= dot colour and dotgap= spacing are optional; a diagram's own canvas line can override these and the patterns below
                                                 // sketch=1 draws every outline and line by hand (2 is rougher); see looks/sketch.look
                                                 // grid=colour rules the page in squares like graph or blueprint paper (gridgap= is the square, default 24)
                                                 // lines=colour rules it like a notebook (linegap=, default 24), cross=colour puts a small + at every
                                                 // crossgap (default 24), iso=colour lays dots on a triangle lattice for isometric drawings (isogap=)
                                                 // diag=colour hatches the page at 45 degrees (diaggap=, default 12), graph=colour rules graph paper with a
                                                 // heavier line every fifth square (graphgap=, default 10), hex=colour lays a honeycomb (hexgap= is a side, default 14)
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

These families ship with FastDraw and are drawn the same everywhere, with nothing else needed: **Geist**, **Geist Mono** and **Newsreader** (the built-in look), **Libre Franklin**, **Instrument Serif** and **Sketch Hand**.

**For any other font, give the address of its files on the web.** That is the way to prefer: the look then works wherever it is opened (the editor, shared links, embedded diagrams, the command line), and nothing has to be committed next to it.

```
font sans "Inter"          "https://cdn.jsdelivr.net/fontsource/fonts/inter@5.3.0/latin-{weight}-{style}.ttf"
font mono "JetBrains Mono" "https://cdn.jsdelivr.net/fontsource/fonts/jetbrains-mono@5.3.0/latin-{weight}-normal.ttf"
```

- `{weight}` is filled in with 400, 500, 600 and 700, and `{style}` with `normal` and `italic`; leave either out when the file name does not change with it. Only the faces the text uses are fetched.
- Use **TTF or OTF** addresses: the command line's PNG renderer reads only those (the editor also takes WOFF2). The family name inside the files must match `font sans "..."` exactly.
- Give an address with a fixed version (`inter@5.3.0`, not `inter@latest`), so the look does not change under you. The address must be https and must not redirect.
- The editor and embedded diagrams fetch the files from that address in the reader's browser; `fastdraw check` and `render` fetch them once and keep a copy in a cache folder (`--offline` uses only the copy). Exported SVGs carry the faces they use. fastdraw.dev images of private READMEs and the Rust crate do not fetch, and draw the role's shipped font instead.

**Recommended:** [Fontsource](https://fontsource.org), served by jsDelivr, has static TTF files for every Google font and many more, under open licences. The address is `https://cdn.jsdelivr.net/fontsource/fonts/<id>@<version>/latin-{weight}-{style}.ttf`, where `<id>` is the name on fontsource.org in small letters with `-` for spaces. Checked and known to work:

| Font | Role | Address |
| --- | --- | --- |
| Inter | sans | `https://cdn.jsdelivr.net/fontsource/fonts/inter@5.3.0/latin-{weight}-{style}.ttf` |
| IBM Plex Sans | sans | `https://cdn.jsdelivr.net/fontsource/fonts/ibm-plex-sans@5.3.0/latin-{weight}-{style}.ttf` |
| Source Sans 3 | sans | `https://cdn.jsdelivr.net/fontsource/fonts/source-sans-3@5.3.1/latin-{weight}-{style}.ttf` |
| Roboto | sans | `https://cdn.jsdelivr.net/fontsource/fonts/roboto@5.3.0/latin-{weight}-{style}.ttf` |
| Open Sans | sans | `https://cdn.jsdelivr.net/fontsource/fonts/open-sans@5.3.0/latin-{weight}-{style}.ttf` |
| Noto Sans | sans | `https://cdn.jsdelivr.net/fontsource/fonts/noto-sans@5.3.0/latin-{weight}-{style}.ttf` |
| JetBrains Mono | mono | `https://cdn.jsdelivr.net/fontsource/fonts/jetbrains-mono@5.3.0/latin-{weight}-{style}.ttf` |
| IBM Plex Mono | mono | `https://cdn.jsdelivr.net/fontsource/fonts/ibm-plex-mono@5.3.0/latin-{weight}-{style}.ttf` |
| Fira Code | mono | `https://cdn.jsdelivr.net/fontsource/fonts/fira-code@5.3.0/latin-{weight}-normal.ttf` |

`latin` covers Western European text; Fontsource also has `latin-ext`, `cyrillic`, `greek` and others in the same place. A brand font that is not on the web (Segoe UI, a licensed corporate face) cannot be used this way: give the look the closest open font instead.

**A font folder** is the other way, for fonts that must not be fetched or are not on the web: put the files next to the look and name the folder.

```
fontdir "./fonts"            // relative to the look file
font sans "Fira Sans"
```

- Files must be **TTF or OTF**, one file per weight and style you use (for example Regular and SemiBold; add Italic if a style sets `italic=1`). Box titles use weight 600 by default. Use static files, not a single variable font.
- The family name is read from inside the files, so `font sans "..."` must match it exactly. `fastdraw sizes team.look` lists the fonts and flags any family it found no file for; `fastdraw check` warns about it too.
- Commit the font folder with the look, and keep the font's licence file beside it. Use fonts whose licence allows redistribution (for example the SIL Open Font License).
- In the browser editor a folder's fonts load only when the folder is open.

Wherever a font's files cannot be read or fetched (a font folder in a shared link or an embedded diagram, an address that cannot be reached), text is drawn in the shipped family for its role: Geist for sans, Geist Mono for mono, Newsreader for serif.

Ligatures are turned off in every font, in the editor, the SVG and the PNG: `--`, `->`, `>=`, `!=` and `...` are drawn as the characters written, never as one joined glyph, so code, command-line flags and SQL read as typed.

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
| `shadow=colour` | a soft shadow under the shape: the shape grown in six fading steps, `shadow.size=` far (default 12), `shadow.dx=` to the side (default 0) and `shadow.dy=` lower (default 4); give a faint colour such as `#3b3f8c/0.1` |
| `inner=colour` | a second, finer rule just inside the outline; `inner.gap=` (default 3.5) and `inner.sw=` |
| `side=colour` | a bar down the left edge of a box, `side.w=` wide (default 4), as IBM draws a side-bar node and a group |
| `icon.block=colour` | with the icon at the left: the strip that holds it is filled, as tall as the box and `icon.block.w=` wide (square by default), the icon centred in it and the text 12px after it, as IBM draws a colour-block node; give the icon a light `icon.color=` |
| `icon.bg=colour` | a filled square behind the icon, `icon.bg.size=` across (the icon plus 12px each side by default); `icon.bg.shape=circle` for a circle; `icon.bg.shadow=colour` lays a soft shadow under it (`icon.bg.shadow.size=`, `.dx=`, `.dy=`, default 8, 0, 3). With `icon.pos=top`, `fill=none stroke=none` and a white `icon.color` it draws IBM's small node: a coloured square with a white icon and the name under it |
| `corners=plus` | a mark on each corner of a box: `plus` or `square`; `corners.color=`, `corners.size=` |
| `offset=dx,dy` | print the fill that far out of register with the outline |
| `blend=multiply` | let this style's ink darken what it overlaps, like overprinting (also on line and text styles) |
| `sketch=0` | with `canvas sketch=` on: draw this style with clean lines (works on line styles too) |
| `layer=back` | draw behind everything (for regions like `zone`) |
| `title.*` | the main text: `title.font`, `title.size`, `title.weight`, `title.color`, `title.italic=1`, `title.spacing` (in em), `title.caps=1`; `title.pos=top` puts it as a small caption at the top edge, `title.dy=` moves that caption up or down and `title.fill=` colours the patch behind it (`none` for no patch) |
| `sub.*` | the second line (`sub=` on an element): `sub.font`, `sub.size`, `sub.color` |
| `tag.*` | the corner marker (`tag=`): `tag.color`, `tag.border`, `tag.font`, `tag.size` |
| `ghost.*` | the big faint number (`ghost=`): `ghost.color`, `ghost.size` |
| `icon.pos=`, `icon.size=` | where a box's icon goes: `left` of the text (the default), on `top` of it, or in the top-left `corner` as a tab, with a left-aligned caption starting after it (for a group's icon, as cloud providers draw them); `icon.size` is its size in pixels |
| `icon.dx=`, `icon.dy=` | move the icon from where it would sit, in pixels: with `icon.pos=corner` and `icon.bg=`, `icon.dx=-8 icon.dy=-8` puts a group's badge out onto its corner |

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

**Colour icons and vendor sets** (Azure, AWS, Google Cloud, Kubernetes, product logos): prefer **giving their address on the web**. The look then works wherever it is opened, a shared link stays short, and nothing has to be committed next to the look.

```
// a whole set whose file names are the icon names: {name} is replaced by the icon=... of each box
icondir "https://cdn.jsdelivr.net/gh/benc-uk/icon-collection@e33ee714d05a24a81cf6ccd967ef34b22cb77e65/azure-docs/{name}.svg"

// one icon from a set whose file names are not (AWS, the Azure icon set as Microsoft names it)
icon lambda "https://cdn.jsdelivr.net/npm/aws-icons@3.3.0/icons/architecture-service/AWSLambda.svg"
icon s3     "https://cdn.jsdelivr.net/npm/aws-icons@3.3.0/icons/architecture-service/AmazonSimpleStorageService.svg"
```

- A diagram then writes `icon=key-vault`, `icon=lambda`. Only the icons a diagram uses are fetched.
- **Seeing what a set has.** For a set on `cdn.jsdelivr.net` with a fixed version, FastDraw reads jsDelivr's list of the package's files, so `fastdraw icons team.look vault` searches the whole set, `fastdraw preview-look` draws it (the first 200), and the editor's icon picker offers it. For a set anywhere else (or a GitHub repository too big for jsDelivr to list), write its names in the look: `icondir "https://.../{name}.svg" names="pod deploy svc"`. Without either, the set still works, by name. Several `icondir` addresses are tried in order, after the icon's own `icon` line; an address without `{name}` is a folder, and `/<name>.svg` is added to it.
- Give an address with a fixed version or commit (`aws-icons@3.3.0`, `@e33ee71...`), never `@latest` or a branch: a set that renames a file would change your diagrams. The address must be https and must not redirect.
- The editor and embedded diagrams fetch the files in the reader's browser; `fastdraw check` and `render` fetch them once and keep a copy in a cache folder (`--offline` uses only the copy). The server sees a request for the file, nothing else. Exported images carry the icons they use.
- Where the files cannot be fetched (no network, the Rust crate, fastdraw.dev images of private READMEs), the closest built-in icon is drawn and a warning says so. An icon found at none of the addresses is an error, as a misspelt built-in name is.
- Check the vendor's terms for its icons; FastDraw ships none of them. Writing an address in a look does not copy the icons anywhere.

**Recommended sources.** Each is served (by jsDelivr, or GitHub for Kubernetes) with the headers the browser needs, and the versions below were checked. jsDelivr does not serve files from GitHub repositories over 50 MB; use `raw.githubusercontent.com/<owner>/<repo>/<commit>/<path>` for those.

| Set | What it has | `icondir` address, or the pattern for `icon` lines |
| --- | --- | --- |
| Azure (Ben Coleman's collection) | about 150 Azure service icons, file names in small letters (`key-vault`, `app-service`, `cosmos-db`, `virtual-machine`, `application-insights`) | `https://cdn.jsdelivr.net/gh/benc-uk/icon-collection@e33ee714d05a24a81cf6ccd967ef34b22cb77e65/azure-docs/{name}.svg` |
| Azure, Microsoft's names | the full Azure set as Microsoft names the files (`Virtual-Machine.svg`, `Key-Vaults.svg`): one `icon` line each | `https://cdn.jsdelivr.net/gh/benc-uk/icon-collection@e33ee714d05a24a81cf6ccd967ef34b22cb77e65/azure-icons/<File-Name>.svg` |
| AWS (`aws-icons`) | the AWS architecture icons (`AWSLambda.svg`, `AmazonEC2.svg`): one `icon` line each; `resource/` has the smaller resource icons | `https://cdn.jsdelivr.net/npm/aws-icons@3.3.0/icons/architecture-service/<FileName>.svg` |
| Google Cloud (`gcp-icons`) | 45 Google Cloud product icons (`bigquery`, `alloydb`, `gke`, `cloudsql`, `vertexai`); five end in `-512-color-rgb.svg` (`cloudrun`, `computeengine`, `apigee`, `networking`, `secops`) and need an `icon` line | `https://cdn.jsdelivr.net/npm/gcp-icons@1.0.6/dist/icons/{name}-512-color.svg` |
| Kubernetes | the 30 Kubernetes resource icons by their short names; not listed by jsDelivr, so give `names="c-role cm crb crd cronjob deploy ds ep group hpa ing job limits netpol ns pod psp pv pvc quota rb role rs sa sc secret sts svc user vol"` | `https://raw.githubusercontent.com/kubernetes/community/d0476ffb364cd9dc6b007221410db3b50989ebc3/icons/svg/resources/labeled/{name}.svg` |
| Simple Icons | about 3,000 brand and product logos, one colour (`github`, `postgresql`, `docker`, `stripe`) | `https://cdn.jsdelivr.net/npm/simple-icons@16.38.0/icons/{name}.svg` |
| Devicon | logos of languages and tools in their colours (`docker`, `postgresql`, `react`, `python`); the repository is too big for jsDelivr to list, so add `names="..."` with the ones you use | `https://cdn.jsdelivr.net/gh/devicons/devicon@v2.16.0/icons/{name}/{name}-original.svg` |
| Lucide | outline icons like the built-in ones, drawn in black | `https://cdn.jsdelivr.net/npm/lucide-static@1.74.0/icons/{name}.svg` |
| Tabler | outline icons, drawn in black | `https://cdn.jsdelivr.net/npm/@tabler/icons@3.52.0/icons/outline/{name}.svg` |

`fastdraw icons team.look <word>` searches a listed set; to browse one by hand, open its package on jsdelivr.com (for example `https://www.jsdelivr.com/package/npm/aws-icons`).

**A folder of SVG files** next to the look is the other way, for icons that must not be fetched or are not on the web:

```
icondir "./icons"
```

Every `.svg` file directly in that folder becomes an icon, drawn exactly as the file looks, in its own colours. The icon's name is the file name in small letters with everything that is not a letter or digit turned into `-`, and a leading number-and-`icon-service-` prefix dropped: `10021-icon-service-Virtual-Machine.svg` is `icon=virtual-machine`, `Load Balancer.svg` is `icon=load-balancer`. `fastdraw icons team.look` lists them and `fastdraw icons team.look storage` searches. Commit the folder with the look. A shared link carries the folder's icons that the diagram uses inside it.

**A look that offers only its own icons.** A vendor look (Azure, AWS) usually wants its own set offered, not the built-in outlines next to it:

```
icons builtin=hidden
```

The built-in icons are then left out of the editor's icon picker, `fastdraw preview-look`, `sizes` and `icons`, and a misspelt icon name is answered with the look's own icons. A diagram that already uses a built-in icon (`icon=database`) still draws it, so a diagram can move between looks without breaking. `icons builtin=shown` is the default.

Either way:

- A file icon keeps its colours; `icon.color=` does not apply to it.
- Files over 300 KB are skipped.
- A file with the same name as a built-in icon replaces it.

### Dark version

`dark` names the look that draws the same diagrams on a dark page. `fastdraw render x.fdraw --dark` writes `x.png` with the diagram's look and `x-dark.png` with the look its `dark` line names, for a site that shows one or the other with the reader's theme.

```
dark night                    // a look that ships with FastDraw
dark "./team-night.look"      // a look file, relative to this look file
```

The built-in look's dark version is `night`, and Night names itself, since it is already dark. A dark look should keep the same style names, so the diagram draws the same way in both. Without a `dark` line, `--dark` stops with an error that names the look. To draw one diagram with another look without changing the file, use `fastdraw render x.fdraw --look night` (or `--look ./other.look`).

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
- Exported images carry the diagram and look but not the files of a font folder, so someone reopening an image without the repo sees the role's shipped font for it. Fonts given by web address are fetched again.
