# State machines

Shows the states one thing can be in and the events that move it from one to the next.

## Composition

- Every state is a box of the same size, 160x80, with `radius=8` so it reads as a state and not a component. Main text is the state's name; `sub=` says what is true while in it.
- Lay the main sequence of states out on one row, left to right, all with the same top edge. Leave 64px between states: every transition carries a label and needs that room.
- When the row is full, or a state is a side track or a resting place, continue downward from the last state: same left edge, 64px below.
- The start is a filled dot and the end is a ringed dot. Neither is in the look, so build them from `ellipse`:

```
start:   ellipse at 156,192 16x16 fill=ink stroke=none             // centred on the first state's centre y
end:     ellipse at 752,440 16x16 fill=none stroke=ink
end_dot: ellipse at 755,443 10x10 fill=ink stroke=none overlap=ok  // 3px inside the ring
```

- Put the start dot 60px left of the first state, and the end dot 56px below (or right of) the last one, centred on it.
- One state gets the `focal` style: the one the reader should notice, usually the successful outcome or the error state. A state where the thing merely rests (archived, closed) may use `cloud`. All others use `node`.
- Centre the whole drawing in the canvas; a row of three states is narrower than you expect.

## Transitions

- Label every transition with the event that causes it. An unlabelled transition says nothing. Write `event`, or `event [guard]` when a condition applies; keep it to about 14 characters.
- Forward transitions are plain arrows and are straight, because the states line up. The transition on the successful path into the focal state uses `style=primary`.
- A transition back to an earlier state is dashed and arcs over the row: `review.top -> draft.top "reject" style=return route=curve`. Keep 90px free above the row for it. A second one arcs under the row, `.bottom` to `.bottom`.
- A transition from a state to itself: `x.top@0.3 -> x.top@0.7 "retry" loop=28`.
- Rearrange the states before you let two transitions cross.

## Traps

- More transitions than twice the number of states: you are drawing two machines. Split them.
- Something that can happen in any state (a timeout, a cancel) is not drawn from every state. Write it once as text: `text "any state → Failed on timeout" at x,y style=small`.

## Legend

One `legend at 40,Y` statement, 24px under the lowest element, with an entry for each box style and arrow style used.
