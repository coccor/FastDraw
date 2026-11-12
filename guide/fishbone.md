# Fishbone diagrams

Shows the causes that were looked into for one observed effect, grouped by category, with the confirmed root cause marked. It is the picture of an investigation, not of a sequence: if the causes happened one after another, draw a timeline.

FastDraw has no fishbone elements. You draw the spine, the slanted bones and the ticks as lines at exact coordinates. All of them follow from two numbers: the spine's height `CY` and the x where each bone joins it.

## Composition

- Title: `text "..." at 40,52 style=h1`. The spine is at CY=300 (the bones' category boxes then start at y=104).
- With n bones (five at most), the effect box's x is `EX = 160*n + 240`; canvas width = EX + 240 (four bones: EX=880, canvas 1120). This keeps the leftmost cause text clear of the left margin and the left side from standing empty.
- The effect is a `focal` box at the right end, 200x88, vertically centred on the spine (`at EX,256`), with `tag="EFFECT"` and the observation on two lines. It says what was seen ("Checkout p99 latency\n4x for 90 minutes"), never the fix.
- Bones join the spine every 160px, the first 80px left of the effect box: join k (from 0) is at x = EX − 80 − 160k. They alternate: first above, second below, and so on.
- The spine starts 80px left of the leftmost join and runs into the effect: `SX,CY -> effect.left stroke=ink`, with SX = EX − 160n (240 for four bones).
- Every bone leans the same way, 96px left for 168px up or down. Its outer end is a category box 120x28, centred on that end:

```
deploy: rect "DEPLOY" at 644,104 120x28 radius=4 fill=paper stroke=ink sw=0.8   // above: x = join − 156, y = CY − 196
deploy.bottom -- 800,300 sw=1.2 stroke=ink
data: focal "DATA" at 484,468 120x28 radius=4                                    // below: y = CY + 168
data.top -- 640,300 sw=1.2 stroke=accent
```

- Causes hang off the bone as 32px ticks pointing left, with the words left of the tick. For step `m` along the bone (m=2 and m=4 for two causes, m=3 for one, m=1, 3, 5 for three), the tick starts on the bone at `x = join − 16·m`, `y = CY ∓ 28·m` (minus above, plus below):

```
768,244 -- 736,244 sw=1                                   // m=2 on the bone that joins at 800, above
text "canary skipped" at 732,247 style=small anchor=end  // 4px left of the tick, 3px below its y
```

- A cause may be up to 32 characters. On the leftmost bone it must still start right of x=40: shorten it if it does not.

## Limits

- Three causes per bone at most. A bone with none is a placeholder: delete it.
- Name categories from the investigation. Do not paste a standard list and leave parts empty.
- A cause must say more than its category ("config drift", not "deploy problem").

## Emphasis

The accent is used on two things: the effect box, and the one bone that is the confirmed root cause (its line `stroke=accent`, its category box `focal`). Two confirmed causes means two diagrams.

## Legend

One `legend` statement at y=524 (24px under the lower category boxes; canvas height 590), because the lines here are not styles of the look: `legend at 40,524 line.ink="Category of cause" line.accent="Confirmed root cause" line.muted="Cause looked into" focal="What was observed"`.
