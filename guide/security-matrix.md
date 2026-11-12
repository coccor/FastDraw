# Security matrix

Shows who may do what: one row per component, one column per role or group, and in each cell the level of access. Use it to audit permissions. It has no arrows; who talks to whom belongs in an integration diagram, and how access is granted in a process diagram.

## Building blocks

The built-in `table` with `align=center grid=1` draws a plain grid, but it cannot tint single cells, and here the tint is the message. Build the matrix from `rect`s on a fixed grid instead:

```
// columns: labels at x=40 (200 wide), then one per role: x = 248 + 144*j, 136 wide
// rows: header at y=96 (52 high), then y = 160 + 40*k, 36 high
corner: rect "Component" sub="vs. AD group" at 40,96 200x52 radius=6 fill=#ffffff stroke=ink/0.12 title.size=11
r1: rect "Data Engineer" sub="GRP-DATA-ENG" at 248,96 136x52 radius=6 fill=ink stroke=none title.color=#ffffff sub.color=#ffffff/0.8 title.size=11

c1: rect "Object storage" at 40,160 200x36 radius=4 fill=#ffffff stroke=ink/0.12 title.size=11 title.align=left
text "S3" at 228,181 style=small anchor=end
c11: rect "Write" at 248,160 136x36 radius=4 title.size=10 title.weight=400 stroke=ink/0.12 fill=#ffffff
```

Four levels, and only four. The cell text is free ("SELECT", "Login", "R/W"); the look of the cell comes from the level it belongs to:

| Level | Add to the cell |
|---|---|
| Full / admin | `fill=ink/0.12 title.weight=600` |
| Read and write | `fill=#ffffff title.weight=400` |
| Read only | `fill=muted/0.08 title.color=muted title.weight=400` |
| No access | `fill=none title.color=soft title.weight=400` |

All of them also take `radius=4 title.size=10 stroke=ink/0.12`.

## Composition

- Two to six roles, two to fourteen components. More roles: split (people and service accounts). More components: split by area.
- The grid above fits five roles in a 1000px canvas. For another count keep the 8px gap and share the width: role width = `(720 - 8*(n-1)) / n`, rounded down to a multiple of 4. Six roles need a wider canvas or a 168px label column.
- Order roles from most to least trusted, or the way the organisation lists them; order components the way data moves through them. Rows that read alike should be neighbours.
- A role header is its name with the group id as `sub=`. A component may carry a short hint (protocol, product) as `small` text right-aligned 12px inside its label cell, baseline 21px below the row top.
- Fill every cell. A cell with no access says "None"; an empty cell reads as unknown.
- Name the ids by position (`c23` = row 2, role 3), so a later edit finds the cell.

## Focus

- One cell at most is the rule the reader must remember: `fill=accent/0.08 stroke=accent sw=1.4 title.color=accent title.weight=600`, with a second line `sub="shared dashboards" sub.color=accent sub.size=8` that says what is special.
- Do not tint a whole row or column, and do not add other colours to more than two cells.

## Legend

The cells are not styles of the look, so draw the legend by hand, 24px under the last row: a `rule` line across, "Legend" in `eyebrow` 20px below it, then for each level you used a `rect` of 16x12 with the level's fill and a `caption` 8px to its right (baseline 10px below the rect's top), 96px apart. Last, the focal swatch with a caption that states the rule in words.
