# Layer stacks

Shows layers that build on each other: a protocol stack, a tech stack, levels of abstraction, a cache hierarchy. Use it only when each layer really rests on the one below; otherwise draw an architecture diagram.

## Composition

- Title at `40,52` (`style=h1`). Four to six layers (n). Each is a full-width band: same x, same width, same height, touching the next one with no gap.
- Leave 96px free on the left for the direction marker: the stack starts at x = 136 and runs to the right margin (824 wide on a 1000px canvas). Bands are 64px tall; band k from the top (from 0) is at `y = 96 + 64k`, so the stack ends at `96 + 64n`.
- A band is a plain `rect` with a faint outline; all ordinary bands look the same. Different colours per layer hide the order.
- One layer, the one the diagram is about, is a `focal` box with `radius=0`. Write it after the other bands so its outline is drawn on top of its neighbours'. Here the second band from the top is focal:

```
l1: rect at 136,96  824x64 fill=ink/0.03 stroke=ink/0.15
l3: rect at 136,224 824x64 fill=ink/0.03 stroke=ink/0.15
l4: rect at 136,288 824x64 fill=ink/0.03 stroke=ink/0.15
l2: focal at 136,160 824x64 radius=0
```

- Order matters and is complete: highest level at the top, no layer left out, numbers without holes.

## Text

The bands carry no text of their own. Each row gets three free texts on nearly one baseline, measured from the band's top edge `Y`: index at Y+36, name at Y+38, detail at Y+37.

```
text "L4" at 156,132 style=eyebrow                                    // index, 20px in from the left edge
text "Application" at 224,134 size=16 weight=600                     // name, 88px in
text "HTTP, JSON, cookies" at 940,133 style=small size=10 anchor=end // detail, ending 20px before the right edge
```

- On the focal row all three texts are free text over an accent fill: give each `color=#ffffff` (the index and name `weight=600`). Never the accent colour: it vanishes.
- Keep the detail to a few words; it must end well clear of the name.

## Direction

Say which way the stack runs, outside it on the left: one vertical arrow from the stack's foot to 8px under its top, with a word at each end. Top = `96`, bottom = `96 + 64n`:

```
text "Abstraction" at 76,92 style=eyebrow anchor=middle     // 12px above the arrow tip
76,352 -> 76,104                                            // foot = bottom of the stack (n=4)
text "Hardware" at 76,372 style=eyebrow anchor=middle       // 20px under the arrow's foot
```

No other arrows. Position in the stack is the relationship. Icons add nothing here.

## Note and legend

- One sentence in `style=note` may sit 48px under the stack (baseline), starting at the stack's left edge, saying why the focal layer matters.
- Finish with `legend at 40,Y focal="..."`, 24px under the note (Y = 96 + 64n + 72). The canvas is Y + 70 tall.
