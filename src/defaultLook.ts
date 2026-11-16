// The look FastDraw uses when a diagram names none, and the starting point `fastdraw init-look`
// writes out for a team to change. Its style names match the guides.
export const DEFAULT_LOOK = `// FastDraw default look. Copy it with "fastdraw init-look" and change anything.
// A cool light page, white cards with rounded corners and a two-tone icon, softly tinted zones,
// slate greys for everything else and one indigo for the subject and the main path. Geist for names and details, Geist Mono for small technical labels.

canvas paper=paper dots=ink/0.07 dotgap=24

// the look "fastdraw render --dark" draws the dark image with. Night has these styles on a dark page;
// once your colours differ, point it at a dark look of your own: dark "./team-night.look"
dark night

color paper  #f6f7fb
color card   #ffffff
color ink    #0f172a
color muted  #475569
color soft   #94a3b8
color accent #4f46e5
color link   #0284c7
color teal   #0d9488
color amber  #d97706
color rose   #e11d48
color violet #7c3aed

font sans  "Geist"
font mono  "Geist Mono"
font serif "Newsreader"

// ---- boxes ----------------------------------------------------------------
style node shape=rect radius=10 size=144x64 fill=#ffffff stroke=ink/0.14 sw=1 sub.font=sans sub.color=muted
    tag.color=muted tag.border=ink/0.18 tag.font=mono icon.color=accent icon.fill=accent/0.14
    use="default box: a backend, service, component or step"
style focal extends node fill=#e6e5fb stroke=accent sw=2 title.color=accent
    tag.color=accent tag.border=accent/0.4 ghost.color=accent/0.10
    use="the one or two elements the diagram is about"
style store extends node fill=#e7e8ea shape=path stroke=ink/0.18 icon.color=violet icon.fill=violet/0.14 tag.color=violet tag.border=violet/0.4
    path="M0,0.1 C0,-0.035 1,-0.035 1,0.1 L1,0.9 C1,1.035 0,1.035 0,0.9 Z M0,0.1 C0,0.235 1,0.235 1,0.1 C1,0.235 0,0.235 0,0.1"
    use="something that holds data or state"
style cloud extends node fill=#e6f3f9 stroke=link/0.45 icon.color=link icon.fill=link/0.14 tag.color=link tag.border=link/0.4
    use="a hosted or third-party platform"
style external extends node fill=#eeeff0 stroke=ink/0.28 dash=5,4 icon.color=muted icon.fill=ink/0.06
    use="a person or system outside what you own"
style optional extends node fill=#f5f6f6 stroke=ink/0.22 dash=3,3 tag.color=soft tag.border=ink/0.18
    use="optional or asynchronous participant"
style sticky extends node radius=4 size=120x120 fill=#fff7d6 stroke=amber/0.35 tag.color=ink tag.border=ink/0.3
    use="a yellow sticky note: an idea, comment or open question"
style sticky-orange extends sticky fill=#ffe4e6 stroke=rose/0.35 use="an orange sticky note: a risk or issue"
style sticky-violet extends sticky fill=#ede9fe stroke=violet/0.35 use="a violet sticky note: a decision or note"

// ---- flowchart shapes -----------------------------------------------------
style step extends node size=160x48 use="flowchart action"
style terminal extends node radius=24 size=160x48 fill=#ffffff stroke=ink/0.30
    use="flowchart start or end"
style terminal-focal extends terminal fill=#e6e5fb stroke=accent sw=2 title.color=accent
    use="the flowchart outcome that matters most"
style decision shape=diamond size=200x96 fill=#ffffff stroke=ink/0.30 sw=1
    use="flowchart yes/no question; put the text on two short lines"

// ---- regions and markers --------------------------------------------------
style zone shape=rect radius=16 fill=ink/0.025 stroke=ink/0.12 sw=1 layer=back
    title.pos=top title.align=left title.font=sans title.size=11 title.weight=600 title.color=muted title.spacing=0 title.caps=0
    use="a labelled region drawn behind a group of boxes; always give WxH"
style bar shape=rect radius=2 size=8x80 fill=accent/0.10 stroke=accent/0.6 sw=1
    use="sequence diagram activation bar, centred on a lifeline; always give WxH"

style table shape=table radius=10 fill=#ffffff stroke=ink/0.16 sw=1 head.fill=accent/0.08 rule=ink/0.08
    cell.font=mono cell.size=10 detail.color=muted
    use="an entity, class or database table: a header and rows. One line per row: | id \\"name\\" \\"type\\" \\"key\\". Arrows can end on a row: orders.user_id -> users.id"
style matrix extends table align=center grid=1 cell.font=sans
    use="a grid of values: first row with |= for the column headings, first cell of each row is its name"
style chart shape=chart fill=none stroke=ink/0.5 sw=1 mask=0 bar.radius=2 grid.color=ink/0.08
    tick.font=mono tick.size=9 tick.color=muted
    use="axes with your numbers drawn for you: chart at x,y WxH x=\\"Q1,Q2,Q3\\" y=0..100, then a line per series: | bars \\"Revenue\\" 42 61 75"

// ---- lines ----------------------------------------------------------------
style arrow line stroke=ink/0.45 sw=1.4 route=ortho radius=8 label.font=sans label.size=10 label.color=muted label.spacing=0 label.caps=0
    use="default arrow"
style primary extends arrow stroke=accent sw=2 label.color=accent use="the main path; at most two per diagram"
style link extends arrow stroke=link label.color=link use="an HTTP or API request crossing a boundary"
style return extends arrow dash=5,4 use="a response, or something optional or asynchronous"
style relation extends relation stroke=ink/0.5 label.font=sans label.size=10 label.spacing=0 label.caps=0
style lifeline line head=none stroke=ink/0.20 sw=1 dash=4,4 route=straight use="sequence diagram lifeline"
style rule line head=none stroke=ink/0.10 sw=1 route=straight use="thin separator, e.g. above a legend"

// ---- text -----------------------------------------------------------------
style h1 text font=sans size=26 weight=600 color=ink use="diagram title"
style kicker text font=mono size=10 weight=500 color=accent spacing=0.12 caps=1 use="optional: a short category above the title, e.g. PROCESS"
style dek text font=sans size=14 color=muted use="optional: one line under the title saying what the diagram shows"
style eyebrow text font=mono size=8 color=muted spacing=0.14 caps=1 use="small caps label, e.g. LEGEND"
style caption text font=sans size=9.5 color=muted use="small explanatory text"
style legend extends legend rule=ink/0.1 title.font=mono item.size=9.5
style note text font=sans size=13 color=muted use="a short aside; at most two"
style small text font=mono size=9 color=muted use="technical detail: a port, path or command"

guidance "focal, terminal-focal and primary are the accent. Use the accent on at most two things in one diagram."
guidance "Never fill a shape with ink to make it stand out; use the accent, or a tint such as accent/0.14."
guidance "tag= is a 3 or 4 letter type marker in the corner of a box (EXT, EDGE, API, DB). Use it on architecture boxes, not flowchart shapes."
guidance "sub= is a short second line of detail: a product name, path, port or protocol. Names of things go in the main text."
guidance "kicker and dek are optional. Add a kicker only when the diagram belongs to a named category, and a dek only when there is one clear message; most diagrams need neither."
guidance "Finish with a legend: one statement, 'legend at x,y' followed by style=\\"what it means\\" for each style you used."
`;
