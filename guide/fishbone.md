# Fishbone diagrams

Shows the causes that were looked into for one observed effect, grouped by category, with the confirmed root cause marked. It is the picture of an investigation, not of a sequence: if the causes happened one after another, draw a timeline.

FastDraw has no fishbone elements. You draw the spine, the slanted bones and the ticks as lines at exact coordinates. All of them follow from two numbers: the spine's height `CY` and the x where each bone joins it.

## Composition

- The effect is a `focal` box at the right end, 200x88, vertically centred on the spine, with `tag="EFFECT"` and the observation on two lines. It says what was seen ("Checkout p99 latency\n4x for 90 minutes"), never the fix.
- The spine is an arrow into it: `200,CY -> effect.left stroke=ink`. With a title, CY=300 works.
- Bones join the spine every 160px, the first 80px left of the effect box (x = 920, 760, 600, 440, 280 for an effect box at x=1000). They alternate: first above, second below, and so on. Five bones at most on a 1240px canvas.
- Every bone leans the same way, 96px left for 168px up or down. Its outer end is a category box 120x28, centred on that end:

```
deploy: rect "DEPLOY" at 764,104 120x28 radius=4 fill=paper stroke=ink sw=0.8   // above: x = join − 156, y = CY − 196
deploy.bottom -- 920,300 sw=1.2 stroke=ink
data: focal "DATA" at 604,468 120x28 radius=4                                    // below: y = CY + 168
data.top -- 760,300 sw=1.2 stroke=accent
```

- Causes hang off the bone as 32px ticks pointing left, with the words left of the tick. For step `m` along the bone (m=2 and m=4 for two causes, m=3 for one, m=1, 3, 5 for three), the tick starts on the bone at `x = join − 16·m`, `y = CY ∓ 28·m`:

```
888,244 -- 856,244 sw=1                                   // m=2 on the bone that joins at 920, above
text "canary skipped" at 852,247 style=small anchor=end  // 4px left of the tick, 3px below its y
```

- A cause may be up to 34 characters. On the leftmost bone it must still start right of x=40: shorten it or start the spine further right.

## Limits

- Three causes per bone at most. A bone with none is a placeholder: delete it.
- Name categories from the investigation. Do not paste a standard list and leave parts empty.
- A cause must say more than its category ("config drift", not "deploy problem").

## Emphasis

The accent is used on two things: the effect box, and the one bone that is the confirmed root cause (its line `stroke=accent`, its category box `focal`). Two confirmed causes means two diagrams.

## Legend

Draw it by hand, 24px under the lower category boxes, because the lines here are not styles of the look: a `style=rule` line, `text "Legend" style=eyebrow`, then a 24px line in each of the three line treatments (bone, root-cause bone, tick) and a small `focal at x,y 14x10 radius=2`, each followed by `text "..." style=caption`.
