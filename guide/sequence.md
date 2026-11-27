# Sequence diagrams

Shows messages between participants over time. Time runs downward.

FastDraw has no special sequence elements. You build one from boxes, lines and arrows, attached to each other so they stay together when a person drags them in the editor.

## Building blocks

```
// participants: one row of boxes across the top, same y, same height (56)
user: external "User" sub="Mobile app" tag="EXT" at 56,72 144x56
api:  node     "Orders API" sub="REST" tag="API" at 280,72 144x56

// lifelines: a line hanging from each box, all the same length
user_l: user.bottom -- +0,360 style=lifeline
api_l:  api.bottom  -- +0,360 style=lifeline

// activation bar: a narrow box centred on a lifeline (lifeline x minus 4), covering
// the time that participant is busy
api_bar: bar at 348,180 8x232

// messages: horizontal arrows between points at the same y
user_l@176 -> api_l@176 "POST /orders" style=link
api_bar.left@408 -> user_l@408 "201 created" style=primary
```

- A message end is `lifeline@y` (a point on the lifeline) or `bar.left@y` / `bar.right@y` (the edge of an activation bar, when that participant has a bar at that moment). Both ends of a message use the same y.
- A bar should start a few pt after the message that activates it arrives and end a few pt after its last message leaves, so attach the first arriving message to the lifeline (`api_l@176`) and later ones to the bar's sides.
- A message to self: `x_bar.right@284 -> x_bar.right@316 "render"`. Its label is drawn to the right of the loop.

## Composition

- Space participants evenly; 224pt between lifelines gives labels room. The lifeline x is the centre of its box.
- Leave 48pt between the bottom of the boxes and the first message, then 56pt between messages. Self-messages take 32pt of height.
- Order messages strictly top to bottom in the file as in time.
- Requests are solid. Responses and async messages use the dashed return style. One message, the outcome that matters, uses the primary style. A request arriving from outside uses the link style if the look has one.
- Labels sit above their arrow. A long arrow that crosses other lifelines should have its label on a stretch between two lifelines where nothing else is: place it with `lpos=x,y` (x is the label centre, y is 10pt above the arrow).
- One participant, the one the diagram is about, gets the accent box style.
- Lifelines end 24pt after the last message. A `legend at x,Y` statement goes 24pt below that.
