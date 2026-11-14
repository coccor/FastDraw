"""Solid icons drawn from the outline icons' geometry (24-unit grid), for the ones whose Phosphor Fill twin
shows a different picture (audit was a bare magnifier, service a bare gear, hierarchy turned sideways...).
Solid parts, with 1.5-unit gaps where the outline icon has a dividing line, written as filled paths in the
256 box solidIcons.ts uses. tools/solid-icons.mjs takes these over Phosphor's.
  python3 -m venv .venv && .venv/bin/pip install shapely
  .venv/bin/python tools/solid-own.py tools/solid-own.json && node tools/solid-icons.mjs <phosphor assets/fill>"""
import json, math, sys
from shapely.geometry import Point, Polygon, LineString, MultiPolygon, box
from shapely.ops import unary_union
from shapely.geometry.polygon import orient
from shapely import affinity

GAP, LW = 1.5, 1.75
K = 256 / 24

def stroke(*pts, w=LW, cap='round'):
    return LineString(pts).buffer(w / 2, quad_segs=12, cap_style=cap, join_style='round')

def disc(cx, cy, r):
    return Point(cx, cy).buffer(r, quad_segs=24)

def rrect(x0, y0, x1, y1, r):
    return box(x0 + r, y0 + r, x1 - r, y1 - r).buffer(r, quad_segs=12)

def rounded(poly, r):
    return poly.buffer(-r, quad_segs=12).buffer(r, quad_segs=12)

def ellipse(cx, cy, rx, ry):
    return affinity.translate(affinity.scale(Point(0, 0).buffer(1, quad_segs=32), rx, ry), cx, cy)

def arc(cx, cy, r, a0, a1, n=40):
    """points on a circle, angles in degrees, 0 = right, 90 = down (SVG)."""
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)), cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]

def cut(shape, *lines):
    """split a shape with gaps along lines"""
    return shape.difference(unary_union([LineString(l).buffer(GAP / 2, quad_segs=8, cap_style='flat') if len(l) > 1 else l for l in lines]))

def apart(base, top):
    """top sits on base with a gap around it"""
    return unary_union([base.difference(top.buffer(GAP, quad_segs=16)), top])

def to_path(g):
    g = g.simplify(0.015)
    polys = list(g.geoms) if isinstance(g, MultiPolygon) else [g]
    out = []
    for p in polys:
        p = orient(p, 1.0)
        for ring in [p.exterior, *p.interiors]:
            c = list(ring.coords)[:-1]
            out.append('M' + 'L'.join(f'{round(x * K, 1):g},{round(y * K, 1):g}' for x, y in c) + 'Z')
    return ''.join(out)

ICONS = {}

# audit: a page with its corner folded, a magnifier over its corner
page = rounded(Polygon([(4.5, 2.5), (14, 2.5), (19.5, 8), (19.5, 21.5), (4.5, 21.5)]), 1.6)
page = cut(page, [(14, 1), (14, 8), (21, 8)])
lens = unary_union([disc(15.5, 16.5, 3.4), stroke((17.6, 18.6), (21.2, 22.2), w=2.4)])
ICONS['audit'] = apart(page, lens)

# bucket: a lid ellipse over a tapered body
lid = ellipse(12, 6.5, 8.5, 3.6)
body = rounded(Polygon([(3.5, 6.5), (20.5, 6.5), (17.4, 20), (15, 21.6), (9, 21.6), (6.6, 20)]), 1.2)
ICONS['bucket'] = apart(body, lid)

# hierarchy: a node over two, joined
ICONS['hierarchy'] = unary_union([disc(12, 5, 3), disc(5, 19, 3), disc(19, 19, 3), stroke((12, 7), (12, 13)), stroke((5.8, 17.8), (12, 12.6), (18.2, 17.8))])

# network: a globe on a stand, with a node on the line under it
globe = disc(12, 8.5, 6.5)
mer = [(12 + 3.2 * math.sin(math.radians(t)), 8.5 - 6.5 * math.cos(math.radians(t))) for t in range(0, 181, 6)]
mer2 = [(24 - x, y) for x, y in mer]
globe = cut(globe, [(4, 8.5), (20, 8.5)], mer, mer2)
nodec = disc(12, 20, 2.6)
bars = unary_union([stroke((2.5, 20), (21.5, 20), w=2)])
ICONS['network'] = unary_union([globe, stroke((12, 15), (12, 18)), apart(bars, nodec)])

# pipeline: two stages down one line, a branch off to a third
ICONS['pipeline'] = unary_union([disc(7, 5.5, 3), disc(7, 18.5, 3), disc(17.5, 12, 3),
                                  stroke((7, 7), (7, 17)), stroke(*arc(11.5, 7.5, 4.5, 180, 90), (15, 12))])

# queue: a top layer and two layers under it
t = 2.6
top = Polygon([(12, 2.6), (21.4, 7.4), (12, 12.2), (2.6, 7.4)])
def band(off):
    return Polygon([(2.6, 7.4 + off), (12, 12.2 + off), (21.4, 7.4 + off), (21.4, 7.4 + off + t), (12, 12.2 + off + t), (2.6, 7.4 + off + t)])
ICONS['queue'] = unary_union([rounded(top, 0.7), rounded(band(GAP + 0.3), 0.5), rounded(band(2 * (GAP + 0.3) + t), 0.5)])

# report: a clipboard with a bar chart cut out of it
board = rrect(4.5, 4.5, 19.5, 21.5, 2.2)
clip = rrect(8.5, 2.2, 15.5, 7, 1.8)
board = board.difference(unary_union([stroke((9, 17.5), (9, 12), w=1.9), stroke((12, 17.5), (12, 15.5), w=1.9), stroke((15, 17.5), (15, 13.8), w=1.9)]))
ICONS['report'] = apart(board, clip)

# router: a box with two lights, an antenna and two waves
rbox = rrect(2.5, 13, 21.5, 21.5, 2.2).difference(unary_union([disc(13, 17.25, 1.1), disc(17, 17.25, 1.1)]))
w1 = stroke(*arc(15, 11.2, 3.6, 215, 325), w=1.9)
w2 = stroke(*arc(15, 11.2, 7.4, 215, 325), w=1.9)
ICONS['router'] = unary_union([rbox, stroke((15, 11.2), (15, 13.5), w=1.9), w1, w2, disc(15, 11.2, 1.2)])

# service: a globe with a gear at its foot
g = disc(11, 11, 9)
m1 = [(11 + 4.4 * math.sin(math.radians(t)), 11 - 9 * math.cos(math.radians(t))) for t in range(0, 181, 5)]
m2 = [(22 - x, y) for x, y in m1]
g = cut(g, [(1, 8), (21, 8)], [(1, 14), (21, 14)], m1, m2)
teeth = unary_union([disc(18.5, 18.5, 3.3)] + [affinity.rotate(box(17.6, 13.6, 19.4, 16.2), a, origin=(18.5, 18.5)) for a in range(0, 360, 60)])
gear = rounded(teeth, 0.35).difference(disc(18.5, 18.5, 1.2))
ICONS['service'] = apart(g, gear)

# vm: a cube of three solid faces
hexa = rounded(Polygon([(12, 1.8), (21, 6.8), (21, 17.2), (12, 22.2), (3, 17.2), (3, 6.8)]), 1.0)
ICONS['vm'] = cut(hexa, [(12, 12), (12, 23)], [(12, 12), (22, 6.3)], [(12, 12), (2, 6.3)])

# git-commit: a commit on a vertical line
ICONS['git-commit'] = unary_union([disc(12, 12, 4), stroke((12, 2), (12, 22))])

# load-balancer: one line in, split to two, each ending in an arrowhead
lb = unary_union([stroke((2.5, 12), (9.4, 12), (13.2, 7), (18.5, 7)), stroke((9.4, 12), (13.2, 17), (18.5, 17))])
heads = unary_union([rounded(Polygon([(17.2, 3), (22, 7), (17.2, 11)]), 0.5), rounded(Polygon([(17.2, 13), (22, 17), (17.2, 21)]), 0.5)])
ICONS['load-balancer'] = unary_union([lb, heads])

out = {k: [to_path(v)] for k, v in ICONS.items()}
json.dump(out, open(sys.argv[1], 'w'), indent=1, sort_keys=True)
for k, v in out.items(): print(k, len(v[0]))
