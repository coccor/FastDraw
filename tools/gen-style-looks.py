# Writes the shade look into looks/. The other style looks it was made with (engraved, keys, transit, offset,
# listing) moved to github.com/coccor/fastdraw-looks, with their generator. Shade shares every style name with
# the built-in look; it gives its colours, fonts and the lines that differ, the rest is common.
#   python3 tools/gen-style-looks.py && node tools/bundle-looks.mjs
import os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'looks')
CYL = 'path="M0,0.1 C0,-0.035 1,-0.035 1,0.1 L1,0.9 C1,1.035 0,1.035 0,0.9 Z M0,0.1 C0,0.235 1,0.235 1,0.1 C1,0.235 0,0.235 0,0.1"'
USE = {
    'node': 'default box: a backend, service, component or step', 'focal': 'the one or two elements the diagram is about',
    'store': 'something that holds data or state', 'cloud': 'a hosted or third-party platform', 'external': 'a person or system outside what you own',
    'optional': 'optional or asynchronous participant', 'sticky': 'a yellow sticky note: an idea, comment or open question',
    'sticky-orange': 'an orange sticky note: a risk or issue', 'sticky-violet': 'a violet sticky note: a decision or note',
    'step': 'flowchart action', 'terminal': 'flowchart start or end', 'terminal-focal': 'the flowchart outcome that matters most',
    'decision': 'flowchart yes/no question; put the text on two short lines', 'zone': 'a labelled region drawn behind a group of boxes; always give WxH',
    'bar': 'sequence diagram activation bar, centred on a lifeline; always give WxH',
    'table': 'an entity, class or database table: a header and rows. One line per row: | id \\"name\\" \\"type\\" \\"key\\". Arrows can end on a row: orders.user_id -> users.id',
    'matrix': 'a grid of values: first row with |= for the column headings, first cell of each row is its name',
    'chart': 'axes with your numbers drawn for you: chart at x,y WxH x=\\"Q1,Q2,Q3\\" y=0..100, then a line per series: | bars \\"Revenue\\" 42 61 75',
    'arrow': 'default arrow', 'primary': 'the main path; at most two per diagram', 'link': 'an HTTP or API request crossing a boundary',
    'return': 'a response, or something optional or asynchronous', 'lifeline': 'sequence diagram lifeline', 'rule': 'thin separator, e.g. above a legend',
    'h1': 'diagram title', 'kicker': 'optional: a short category above the title, e.g. PROCESS', 'dek': 'optional: one line under the title saying what the diagram shows',
    'eyebrow': 'small caps label, e.g. LEGEND', 'caption': 'small explanatory text', 'note': 'a short aside; at most two', 'small': 'technical detail: a port, path or command',
}
GUIDANCE = [
    'focal, terminal-focal and primary are the accent. Use the accent on at most two things in one diagram.',
    'Never fill a shape with ink to make it stand out; use focal.',
    'tag= is a 3 or 4 letter type marker in the corner of a box (EXT, EDGE, API, DB). Use it on architecture boxes, not flowchart shapes.',
    'sub= is a short second line of detail: a product name, path, port or protocol. Names of things go in the main text.',
    'kicker and dek are optional. Add a kicker only when the diagram belongs to a named category, and a dek only when there is one clear message; most diagrams need neither.',
    "Finish with a legend: one statement, 'legend at x,y' followed by style=\\\"what it means\\\" for each style you used.",
]
ORDER = [('boxes', ['node', 'focal', 'store', 'cloud', 'external', 'optional', 'sticky', 'sticky-orange', 'sticky-violet']),
         ('flowchart shapes', ['step', 'terminal', 'terminal-focal', 'decision']),
         ('regions and markers', ['zone', 'bar', 'table', 'matrix', 'chart']),
         ('lines', ['arrow', 'primary', 'link', 'return', 'relation', 'lifeline', 'rule']),
         ('text', ['h1', 'kicker', 'dek', 'eyebrow', 'caption', 'legend', 'note', 'small'])]

def write(name, head, canvas, colors, fonts, styles, extra_guidance=()):
    out = ['// ' + l for l in head] + ['', 'canvas ' + canvas, '']
    out += [f'color {k.ljust(8)} {v}' for k, v in colors.items()] + ['']
    out += [f'font {k.ljust(5)} "{v}"' for k, v in fonts.items()]
    for title, names in ORDER:
        out += ['', f'// ---- {title} ' + '-' * (70 - len(title))]
        for n in names:
            use = f' use="{USE[n]}"' if n in USE else ''
            out.append(f'style {n} {styles[n]}{use}')
    out += [''] + [f'guidance "{g}"' for g in list(GUIDANCE) + list(extra_guidance)]
    open(os.path.join(ROOT, name + '.look'), 'w').write('\n'.join(out) + '\n')

TEXT_LINES = 'label.spacing=0 label.caps=0'

# ---------------------------------------------------------------------------------------------
write('shade',
      ['Shade: hairline cards on white-smoke paper, each casting a shadow of fine drawn lines. A tall serif',
       'title, typewriter capitals for technical labels, one indigo for the subject. The quietest of the style',
       'looks, after diagram-design. Same style names as the built-in look.'],
      'paper=paper',
      dict(paper='#f5f5f5', card='#ffffff', ink='#2d3142', muted='#4f5d75', soft='#8a93a6', accent='#4f46e5', tint='#eceafd', link='#2e5aa8', teal='#0d9488', amber='#b7791f', rose='#c2410c', violet='#7c3aed'),
      dict(sans='Geist', mono='Geist Mono', serif='Instrument Serif'),
      {
          'node': 'shape=rect radius=2 size=144x64 fill=card stroke=ink sw=1 shade=ink/0.7 sub.font=mono sub.color=muted\n    tag.color=muted tag.border=ink/0.3 tag.font=mono icon.color=ink',
          'focal': 'extends node fill=tint stroke=accent shade=accent shade.sw=0.8 sub.color=accent\n    tag.color=accent tag.border=accent/0.5 icon.color=accent ghost.color=accent/0.12',
          'store': f'extends node shape=path {CYL}',
          'cloud': 'extends node stroke=link shade=link/0.8 icon.color=link tag.color=link tag.border=link/0.5',
          'external': 'extends node fill=paper stroke=ink/0.5 dash=4,3 shade=none icon.color=muted',
          'optional': 'extends node fill=paper stroke=ink/0.4 dash=2,3 shade=none tag.color=soft tag.border=ink/0.2',
          'sticky': 'extends node radius=0 size=120x120 fill=#fff3bf stroke=ink/0.35 shade=ink/0.45 tag.color=ink tag.border=ink/0.3',
          'sticky-orange': 'extends sticky fill=#ffe1d6', 'sticky-violet': 'extends sticky fill=#e9e4ff',
          'step': 'extends node size=160x48', 'terminal': 'extends node radius=24 size=160x48',
          'terminal-focal': 'extends terminal fill=tint stroke=accent shade=accent shade.sw=0.8',
          'decision': 'shape=diamond size=200x96 fill=card stroke=ink sw=1 shade=ink/0.7',
          'zone': 'shape=rect radius=0 fill=none hatch=ink/0.1 hatch.gap=6 hatch.sw=0.4 stroke=#bfc0c0 sw=1 layer=back\n    title.pos=top title.dy=-10 title.align=left title.font=mono title.size=8 title.weight=500 title.color=soft title.spacing=0.18 title.caps=1',
          'bar': 'shape=rect radius=0 size=8x80 fill=tint stroke=accent sw=1',
          'table': 'shape=table radius=2 fill=card stroke=ink sw=1 shade=ink/0.7 head.fill=ink/0.06 rule=ink/0.1\n    cell.font=mono cell.size=10 detail.color=muted',
          'matrix': 'extends table align=center grid=1 cell.font=sans',
          'chart': 'shape=chart fill=none stroke=ink/0.6 sw=1 mask=0 bar.radius=0 grid.color=ink/0.08\n    tick.font=mono tick.size=9 tick.color=muted',
          'arrow': 'line stroke=muted sw=1 route=ortho radius=8 label.font=mono label.size=8 label.color=muted label.spacing=0.06',
          'primary': 'extends arrow stroke=accent sw=1.6 label.color=accent', 'link': 'extends arrow stroke=link label.color=link',
          'return': 'extends arrow dash=5,4', 'relation': 'extends relation stroke=ink/0.7 label.font=mono label.size=8',
          'lifeline': 'line head=none stroke=ink/0.3 sw=1 dash=4,4 route=straight', 'rule': 'line head=none stroke=#bfc0c0 sw=1 route=straight',
          'h1': 'text font=serif size=36 weight=400 color=ink', 'kicker': 'text font=mono size=9 weight=500 color=accent spacing=0.14 caps=1',
          'dek': 'text font=sans size=13 color=muted', 'eyebrow': 'text font=mono size=8 color=soft spacing=0.16 caps=1',
          'caption': 'text font=sans size=9.5 color=muted', 'legend': 'extends legend rule=ink/0.12 title.font=mono item.size=9.5',
          'note': 'text font=serif italic=1 size=16 color=ink', 'small': 'text font=mono size=9 color=muted',
      })

print('wrote shade')
