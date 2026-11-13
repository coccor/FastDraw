# Loop diagrams

Shows a cycle that feeds itself: steps around a ring, each handing over to the next, and one hub in the middle that every step writes to. Use it only when the last step really leads back to the first and the centre holds something that accumulates (a memory, a record, a standard). A path that ends is a flowchart.

## Building blocks

```
// title at y=52. Ring: centre 520,372 · radius 240 · six stations 60 degrees apart, the first at the top
title: text "Every release teaches the next one" at 40,52 style=h1
capture:  node "Capture" sub="signals in / intake" at 440,100 160x64
research: node "Research" sub="evidence pulled" at 648,220 160x64
hub: rect "Shared memory" sub="one record, every loop" at 420,320 200x104 radius=8 fill=accent/0.12 stroke=accent sw=1.5 title.color=ink sub.color=muted

capture.right@146 -> research.top@705 route=curve bend=9          // a piece of the ring
research.bottom@743 -> decide.top@743 route=curve bend=16
capture.bottom -> hub.top "signals" style=return stroke=soft      // a write-back
research.bottom@672 -> hub.top@616 style=return stroke=soft route=straight
```

## Composition

- Five to eight stations and exactly one hub. With more than eight, the write-backs crowd the hub: split the subject. Two hubs are two diagrams.
- Pick the centre `cx,cy` and the radius R. Station n of N (from 0, clockwise from the top) has its centre at `cx + R*sin(a), cy - R*cos(a)` with `a = n*360/N`. Its `at` is that point minus half its size, rounded to 4. Equal angles; uneven spacing stops the ring reading as one cycle.
- Numbers that work for five or six stations: stations 160x64, hub 200x104, R=240, centre 520,372 (top station's top edge at y=100, under the title). Six stations are then at 440,100 · 648,220 · 648,460 · 440,580 · 232,460 · 232,220. For seven or eight stations the neighbours would touch: take R=280, centre 520,408. In general `cy = R + 132`.
- The hub is the strongest element: a `rect` with `fill=accent/0.12 stroke=accent sw=1.5 title.color=ink sub.color=muted`, a little larger than a station, centred on `cx,cy`. One name and one short line (its `sub=` is small type, so keep it under about 24 characters); it is a state, not a step.
- At most one station is `focal`: the gate or decision the loop turns on. All others are `node`.

## Arrows

- The ring is one arrow per neighbouring pair, clockwise, the last one back to the first. Each is `route=curve bend=N` with a positive N, which bows it outward. Never mix in elbows or straight pieces: the gaps must read as parts of one circle.
- Each arrow starts and ends where the circle crosses a box edge, so give both ends exactly. Which edge: at angle `a` the circle runs in direction `(cos a, sin a)`. A station is left through its right edge (left edge if `cos a` is negative) when `80*|sin a| < 32*|cos a|`, otherwise through its bottom edge (top edge if `sin a` is negative). It is entered through the same test on the reversed direction: top edge where it leaves through the bottom, bottom where it leaves through the top, right edge where it leaves through the left, and so on. Six stations: leave right, bottom, bottom, left, top, top; enter top, top, right, bottom, bottom, left.
- On a left or right edge at x=e the crossing is at `y = cy ± sqrt(R² - (e - cx)²)`; on a top or bottom edge at y=e it is at `x = cx ± sqrt(R² - (e - cy)²)`. Take the minus on a left or right edge above the centre, the plus below it; on a top or bottom edge the plus on the right of the centre, the minus on the left. Write them as `box.right@146` or `box.top@705` (absolute coordinates).
- `bend` is how far the circle rises above the straight line between the two ends: `R - sqrt(R² - (d/2)²)`, where d is the distance between the two attach points. For six stations: 9 for the four slanted gaps, 16 for the two vertical ones on the sides.
- The six attach points, clockwise: `capture.right@146 → research.top@705`, `research.bottom@743 → decide.top@743`, `decide.bottom@705 → act.right@598`, `act.left@598 → measure.bottom@335`, `measure.top@297 → learn.bottom@297`, `learn.top@335 → capture.left@146`.
- Write-backs run from each station straight towards the hub: `style=return stroke=soft` (dashed and lighter than the ring). A solid write-back looks like part of the flow. A station directly above or below the hub: `a.bottom -> hub.top` (or `a.top -> hub.bottom`). A station level with the hub (four or eight stations): `a.left -> hub.right`. The others need `route=straight` and both ends named: start 24px in from the station's corner nearest the hub (on its bottom edge for stations above the hub, top edge for stations below), end 4px in from the hub's nearest corner on the facing edge. Above: `research.bottom@672 -> hub.top@616`; below: `decide.top@672 -> hub.bottom@616`, `measure.top@368 -> hub.bottom@424`; upper left: `learn.bottom@368 -> hub.top@424`.
- Label two write-backs at most, one word each. The station's `sub=` usually says what is written.
- Nothing crosses the hub and no two lines cross. If a ring arrow would touch the hub, make R larger.

## Text

Station name as the main text, what happens there as `sub=`. The title sits above the ring at y=52.

## Legend

Usually none: one ring, one hub, one kind of dashed line. If you add one, `legend at 40,Y node="Step" focal="The gate" arrow="Work moves on" return="Writes to the hub"` with Y 24px under the lowest station.
