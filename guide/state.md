# State machines

Shows the states one thing can be in and the events that move it from one to the next.

## Composition

- Title at `40,52` (`style=h1`). The main row's top edge is y=200: the arc over the row needs 90pt of free space above it, below the title.
- Every state is a box of the same size, written `160x80` with `radius=8` so it reads as a state and not a component. Main text is the state's name; `sub=` says what is true while in it (small sans).
- Lay the main sequence out on one row, left to right, all with the same top edge. The gap between states carries a label: 64pt holds a label of up to 8 characters, 96pt up to 14. Pick one gap for the whole row. State k (from 0) has `x = 120 + k * (160 + gap)`.
- When the row is full, or a state is a side track or a resting place, put it on a second row: top edge y=344 (64pt under the first row), under the state it hangs from.
- The start is a filled dot and the end a ringed dot. Neither is in the look, so build them from `ellipse`:

```
start:   ellipse at 40,232 16x16 fill=ink stroke=none              // 64pt left of the first state, centred on its centre y (240)
end:     ellipse at 960,472 16x16 fill=none stroke=ink             // 48pt under the state it follows, centred on it
end_dot: ellipse at 963,475 10x10 fill=ink stroke=none overlap=ok // 3pt inside the ring
```

- One state gets `focal`: the one the reader should notice, usually the successful outcome or the error state. A state where the thing merely rests (archived, closed) may use `cloud`. All others use `node`. Do not use `store` for a state: in the built-in look it is a cylinder.
- Keep the drawing balanced: the second row and the end dot stay within the width of the main row.

## Transitions

- Label every transition with the event that causes it. Write `event`, or `event [guard]` when a condition applies; keep it to the 8 or 14 characters the gap holds. A longer label belongs on an arc or a vertical arrow, which have room.
- Forward transitions are plain arrows and are straight, because the states line up. The transition on the successful path into the focal state uses `style=primary`.
- A transition back to an earlier state on the row is dashed and arcs over it: `review.top -> draft.top "reject" style=return route=curve`. A second one arcs under the row, `.bottom` to `.bottom`.
- A transition from a lower row back up to the main row leaves the side or top of the lower state and enters the bottom of the target: `lost.top -> paid.bottom "fixed"` when it sits directly under, or `packed.bottom -> lost.right "bad address"` for a state that is under another column. Two arrows into one side are spread automatically.
- A transition from a state to itself: `x.top@0.3 -> x.top@0.7 "retry" loop=28`.
- Rearrange the states before you let two transitions cross.

## Traps

- More transitions than twice the number of states: you are drawing two machines. Split them.
- Something that can happen in any state (a timeout, a cancel) is not drawn from every state. Write it once as text: `text "any state → Failed on timeout" at x,y style=small`.

## Legend

One `legend at 40,Y` statement, 24pt under the lowest element (the end dot included), with an entry for each box style and arrow style used.
