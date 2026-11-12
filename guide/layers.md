# Layer stacks

Shows layers that build on each other: a protocol stack, a tech stack, levels of abstraction, a cache hierarchy. Use it only when each layer really rests on the one below; otherwise draw an architecture diagram.

## Composition

- Four to six layers. Each is a full-width band: same x, same width, same height, touching the next one with no gap.
- Leave 96px free on the left for the direction marker: the stack starts at x = 136 and runs to the right margin (824 wide on a 1000px canvas). Bands are 64px tall.
- A band is a plain `rect` with a faint outline; all ordinary bands look the same. Different colours per layer hide the order.
- One layer, the one the diagram is about, is a `focal` box with `radius=0`. Write it after the other bands so its outline is drawn on top of its neighbours'.

```
l5: rect at 136,104 824x64 fill=ink/0.03 stroke=ink/0.15
l3: rect at 136,232 824x64 fill=ink/0.03 stroke=ink/0.15
l4: focal at 136,168 824x64 radius=0
```

- Order matters and is complete: highest level at the top, no layer left out, numbers without holes.

## Text

The bands carry no text of their own. Each row gets three free texts on one baseline, 38px under the band's top edge:

```
text "L4" at 156,204 style=eyebrow                                   // index, 20px in from the left edge
text "Agent harness" at 224,206 size=16 weight=600                   // name, 88px in
text "tools, memory, loop" at 940,205 style=small size=10 anchor=end // detail, ending 20px before the right edge
```

- The index and detail of the focal row take `color=accent`.
- Keep the detail to a few words; it must end well clear of the name.

## Direction

Say which way the stack runs, outside it on the left: one vertical arrow as tall as the stack, with a word at each end.

```
text "Abstraction" at 76,92 style=eyebrow anchor=middle     // 12px above the arrow tip
76,424 -> 76,104
text "Silicon" at 76,444 style=eyebrow anchor=middle        // 20px under the arrow's foot
```

No other arrows. Position in the stack is the relationship.

## Note and legend

- One sentence in `style=note` may sit 48px under the stack, starting at the stack's left edge, saying why the focal layer matters.
- Finish with `legend at 40,Y focal="..."`, 24px under the note.
