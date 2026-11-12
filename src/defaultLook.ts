// The look FastDraw uses when a diagram names none, and the starting point `fastdraw init-look`
// writes out for a team to change. Its style names match the guides.
export const DEFAULT_LOOK = `// FastDraw default look. Copy it with "fastdraw init-look" and change anything.

canvas paper=paper

color paper  #ffffff
color ink    #1c1f2a
color muted  #5b6172
color soft   #8a90a2
color accent #0e7c66
color link   #3056d3

font sans  "Geist"
font mono  "Geist Mono"
font serif "Instrument Serif"

// ---- boxes ----------------------------------------------------------------
style node shape=rect radius=4 size=144x64 fill=#ffffff stroke=ink sw=1.2
    tag.color=muted tag.border=ink/0.25 sub.font=sans sub.size=10
    use="default box: a service, component or step"
style focal extends node fill=accent stroke=accent title.color=#ffffff sub.color=#ffffff/0.85
    tag.color=#ffffff tag.border=#ffffff/0.5 ghost.color=#ffffff/0.18
    use="the one or two elements the diagram is about"
style store extends node size=144x72
    path="M0,0.1 C0,-0.035 1,-0.035 1,0.1 L1,0.9 C1,1.035 0,1.035 0,0.9 Z M0,0.1 C0,0.235 1,0.235 1,0.1 C1,0.235 0,0.235 0,0.1"
    shape=path fill=ink/0.04
    use="something that holds data or state"
style cloud extends node fill=link/0.06 stroke=link/0.55
    use="a hosted or third-party platform"
style external extends node fill=ink/0.05 stroke=soft dash=5,4
    use="a person or system outside what you own"
style optional extends node stroke=soft dash=2,4
    use="optional or asynchronous participant"

// ---- flowchart shapes -----------------------------------------------------
style step extends node size=160x48 use="flowchart action"
style terminal shape=rect radius=24 size=160x48 fill=ink stroke=ink sw=1.2 title.color=#ffffff sub.color=#ffffff/0.8 sub.font=sans sub.size=10
    use="flowchart start or end"
style terminal-focal extends terminal fill=accent stroke=accent
    use="the flowchart outcome that matters most"
style decision shape=diamond size=200x96 fill=#ffffff stroke=ink sw=1.2
    use="flowchart yes/no question; put the text on two short lines"

// ---- other shapes ---------------------------------------------------------
style zone shape=rect radius=6 fill=ink/0.03 stroke=ink/0.18 sw=1 dash=6,4 layer=back
    title.pos=top title.font=sans title.size=10 title.weight=600 title.color=muted
    use="a labelled region drawn behind a group of boxes; always give WxH"
style bar shape=rect size=8x80 fill=#ffffff stroke=ink sw=1.2
    use="sequence diagram activation bar, centred on a lifeline; always give WxH"

style table shape=table radius=4 fill=#ffffff stroke=ink sw=1.2 head.fill=ink/0.06 rule=ink/0.1
    cell.font=mono cell.size=10 detail.color=muted
    use="an entity, class or database table: a header and rows. One line per row: | id \\"name\\" \\"type\\" \\"key\\". Arrows can end on a row: orders.user_id -> users.id"
style matrix extends table align=center grid=1 cell.font=sans
    use="a grid of values: first row with |= for the column headings, first cell of each row is its name"

// ---- lines ----------------------------------------------------------------
style arrow line stroke=ink sw=1.3 route=ortho radius=6 label.font=sans label.size=10 label.caps=0 label.spacing=0 label.color=muted
    use="default arrow"
style primary extends arrow stroke=accent sw=2 label.color=accent use="the main path; at most two per diagram"
style link extends arrow stroke=link label.color=link use="a request crossing a boundary"
style return extends arrow stroke=muted dash=5,4 use="a response, or something optional or asynchronous"
style relation extends relation label.font=sans label.size=10 label.caps=0 label.spacing=0 label.color=muted
style lifeline line stroke=soft sw=1 dash=2,4 route=straight use="sequence diagram lifeline"
style rule line stroke=ink/0.15 sw=1 route=straight use="thin separator"

// ---- text -----------------------------------------------------------------
style h1 text font=sans size=22 weight=600 color=ink use="diagram title"
style eyebrow text font=sans size=10 weight=600 color=muted use="small heading"
style caption text font=sans size=10 color=muted use="small explanatory text"
style note text font=serif italic=1 size=15 color=muted use="a short aside; at most two"
style small text font=mono size=9 color=muted use="technical detail: a port, path or command"

guidance "focal, terminal-focal and primary are the accent. Use the accent on at most two things in one diagram."
guidance "tag= is a 3 or 4 letter type marker in the corner of a box. sub= is a short second line of detail."
guidance "Finish with a legend: one statement, 'legend at x,y' followed by style=\\"what it means\\" for each style you used."
`;
