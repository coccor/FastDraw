"""Derive "Sketch Hand" from Virgil: adds hand-drawn arrows and <=/>= built from Virgil's own strokes.
OFL 1.1: the modified font cannot keep the Reserved Font Name, so it is renamed."""
import sys
from fontTools.ttLib import TTFont
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

src, dst = sys.argv[1], sys.argv[2]
f = TTFont(src)
gs = f.getGlyphSet()
hmtx, cmap = f['hmtx'], f.getBestCmap()
cff = f['CFF '].cff
top = cff.topDictIndex[0]
cs = top.CharStrings
n = lambda ch: cmap[ord(ch)]

def bbox(g):
    p = BoundsPen(gs)
    gs[g].draw(p)
    return p.bounds

def build(parts, adv):
    pen = T2CharStringPen(adv, gs)
    for g, dx, dy in parts:
        gs[g].draw(TransformPen(pen, (1, 0, 0, 1, dx, dy)))
    return pen.getCharString(private=top.Private, globalSubrs=cff.GlobalSubrs)

hy, gt, lt = n('-'), n('>'), n('<')
hx0, hy0, hx1, hy1 = bbox(hy)
gx0, gy0, gx1, gy1 = bbox(gt)
lx0, ly0, lx1, ly1 = bbox(lt)
lsb = 40
hlen = hx1 - hx0
shaft_dy = (gy0 + gy1) / 2 - (hy0 + hy1) / 2
new = {}
# right arrow: a long shaft (two strokes end to end), the chevron overlapping its end
sx = lsb - hx0
tip = sx + hx0 + hlen * 1.6 - (gx0 + (gx1 - gx0) * 0.55)
adv = int(gx1 + tip + lsb)
new['arrowright.sk'] = (0x2192, adv, [(hy, sx, shaft_dy), (hy, sx + hlen * 0.6, shaft_dy), (gt, tip, 0)])
# left arrow: chevron first, shaft after it
loff = lsb - lx0
s0 = loff + lx0 + (lx1 - lx0) * 0.45 - hx0
new['arrowleft.sk'] = (0x2190, int(s0 + hx0 + hlen * 1.6 + lsb), [(lt, loff, 0), (hy, s0, shaft_dy), (hy, s0 + hlen * 0.6, shaft_dy)])
# <= and >=: the chevron lifted, a stroke under it
lift = (hy1 - hy0) * 1.5
under = gy0 - hy1 + lift - (hy1 - hy0) * 1.6
new['lessequal.sk'] = (0x2264, hmtx[lt][0], [(lt, 0, lift), (hy, lx0 - hx0 + ((lx1 - lx0) - hlen) / 2, under)])
new['greaterequal.sk'] = (0x2265, hmtx[gt][0], [(gt, 0, lift), (hy, gx0 - hx0 + ((gx1 - gx0) - hlen) / 2, under)])

order = f.getGlyphOrder()
for name, (cp, adv, parts) in new.items():
    c = build(parts, adv)
    cs.charStringsIndex.append(c)
    cs.charStrings[name] = len(cs.charStringsIndex) - 1
    top.charset.append(name)
    order.append(name)
    b = BoundsPen(gs)
    for g, dx, dy in parts:
        gs[g].draw(TransformPen(b, (1, 0, 0, 1, dx, dy)))
    hmtx[name] = (adv, int(b.bounds[0]))
    for t in f['cmap'].tables:
        if t.isUnicode():
            t.cmap[cp] = name
f.setGlyphOrder(order)
f['maxp'].numGlyphs = len(order)
f['hhea'].numberOfHMetrics = len(order)

family = 'Sketch Hand'
for rec in f['name'].names:
    if rec.nameID in (1, 16):
        rec.string = family
    elif rec.nameID == 4:
        rec.string = family + ' Regular'
    elif rec.nameID == 6:
        rec.string = 'SketchHand-Regular'
    elif rec.nameID == 3:
        rec.string = 'SketchHand-Regular;derived from Virgil'
top.FullName = family + ' Regular'
top.FamilyName = family
cff.fontNames = ['SketchHand-Regular']
f.save(dst)
print('saved', dst)
