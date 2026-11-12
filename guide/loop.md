# Loop diagrams

Shows a cycle that feeds itself: steps around a ring, each handing over to the next, and one hub in the middle that every step writes to. Use it only when the last step really leads back to the first and the centre holds something that accumulates (a memory, a record, a standard). A path that ends is a flowchart.

## Building blocks

```
// ring: centre 520,340 · radius 240 · six stations 60 degrees apart, the first at the top
capture:  node "Capture" sub="signals in / intake" at 440,68 160x64
research: node "Research" sub="evidence pulled" at 648,188 160x64
hub: rect "Shared memory" sub="one record, every loop" at 420,288 200x104 radius=8 fill=ink stroke=ink title.color=paper sub.color=paper/0.7

capture.right@114 -> research.top@705 route=curve bend=9          // a piece of the ring
research.bottom@743 -> decide.top@743 route=curve bend=16
capture.bottom -> hub.top "signals" style=return stroke=soft      // a write-back
research.bottom@672 -> hub.top@616 style=return stroke=soft route=straight
```

## Composition

- Five to eight stations and exactly one hub. With more than eight, the write-backs crowd the hub: split the subject. Two hubs are two diagrams.
- Pick the centre `cx,cy` and the radius R. Station n of N (from 0, clockwise from the top) has its centre at `cx + R*sin(a), cy - R*cos(a)` with `a = n*360/N`. Its `at` is that point minus half its size, rounded to 4. Equal angles; uneven spacing stops the ring reading as one cycle.
- Numbers that work: canvas 1040x680, centre 520,340, R=240, stations 160x64, hub 200x104. Six stations are then at 440,68 · 648,188 · 648,428 · 440,548 · 232,428 · 232,188.
- The hub is the only dark element: a `rect` with `fill=ink stroke=ink title.color=paper sub.color=paper/0.7`, a little larger than a station. One name and one short line; it is a state, not a step.
- At most one station is `focal`: the gate or decision the loop turns on. All others are `node`.

## Arrows

- The ring is one arrow per neighbouring pair, clockwise, the last one back to the first. Each is `route=curve bend=N` with a positive N, which bows it outward. Never mix in elbows or straight pieces: the gaps must read as parts of one circle.
- Each arrow starts and ends where the circle crosses the box edge, so give both ends exactly. On a left or right edge at x=e the crossing is at `y = cy ± sqrt(R² - (e - cx)²)`; on a top or bottom edge at y=e it is at `x = cx ± sqrt(R² - (e - cy)²)`. Write them as `box.right@114` or `box.top@705` (absolute coordinates).
- `bend` is how far the circle rises above the straight line between the two ends: `R - sqrt(R² - (d/2)²)`, where d is the distance between them. With the numbers above: 9 for the four slanted gaps, 16 for the two vertical ones on the sides.
- With the six-station layout the twelve attach points are, clockwise: `capture.right@114 → research.top@705`, `research.bottom@743 → decide.top@743`, `decide.bottom@705 → act.right@566`, `act.left@566 → measure.bottom@335`, `measure.top@297 → learn.bottom@297`, `learn.top@335 → capture.left@114`.
- Write-backs run from each station straight towards the hub: `style=return stroke=soft` (dashed and lighter than the ring). A solid write-back looks like part of the flow. Stations directly above or below the hub use `a.bottom -> hub.top`. The others need `route=straight` and both ends named, starting 24px in from the station's inner corner and ending 4px in from the hub's corner: `research.bottom@672 -> hub.top@616`.
- Label two write-backs at most, one word each. The station's `sub=` usually says what is written.
- Nothing crosses the hub and no two lines cross. If a ring arrow would touch the hub, make R larger.

## Text

Station name as the main text, what happens there as `sub=`. No title is needed inside the ring; put an `h1` above only if the canvas has 60px more at the top.

## Legend

Usually none: one ring, one hub, one kind of dashed line. If you add one, `legend at 40,Y node="Step" focal="The gate" arrow="Work moves on" return="Writes to the hub"`.
