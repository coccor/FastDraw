# Integration diagrams

Shows what plugs into a data platform and what it serves, and over which protocol: source systems on the left, the platform in the middle, consumers on the right, shared services underneath. There are no phases and no time axis. The claim is the number of distinct connections, so this kind may have more boxes than the usual nine (up to about 16).

## Composition

- Title at 40,52 (`style=h1`). Three columns: sources at x=40, consumers at x=1000 (`external`, 160x64), and between them one zone, `zone "Data platform" at 280,136 640xH dash=none` (`dash=none` makes it solid).
- Side boxes are 88 apart (24 between), centred on the surfaces' centre y, call it Y: box i of n (from 0) has its top at `Y - 32 - 44*(n-1) + 88*i`. Three boxes with Y=320: tops 200, 288, 376. The zone ends 16px below the lowest side box.
- Inside the zone, on one row: the two or three surfaces the outside connects to (storage, query engine), 160x72 (write the size: the default is 144x64), at least 176px apart. Exactly two of them are `focal`: the ones that make this a platform and not a pile of tools.
- Put that row level with the middle box of the side columns. Then the middle wire on each side is straight and the others fan out evenly above and below it.
- An orchestrator is a wide `cloud` box along the top of the zone (32px below its top edge, 16px in from its sides, 56 high: `296,168 608x56`), at least 56px above the row, so Y is at least 320.
- Every source and every consumer is its own box, even when three look alike. Merge only identical ones ("Databases", `sub="4 × MariaDB"`).
- Services for the whole platform (identity, logging, secrets) are `cloud` boxes 48 high in a row 48px under the zone, 32px apart, filling x=40 to 1160. Widths on the 4px grid: two 544, three 352, four 256 (`x = 40 + (w+32)*i`). They are outside the zone: identity guards the platform from outside. Each can take `icon=` (`lock`, `key`, `log`, `monitoring`); so can sources and consumers (`database`, `api`, `users`, `laptop`), on all of them or none.

## Arrows

- One arrow per wire, each labelled with its protocol (REST, CSV, JDBC). Never one bundled arrow from "the sources".
- Give every arrow its own point on the platform box, 16px apart, the middle one at the box's centre: `crm.right -> store.left@304`, `pos.right -> store.left@320`, `events.right -> store.left@336`.
- The outer wires bend inside the zone, 32px before the box, so the stretch next to the source stays clear for the label: `crm.right -> store.left@304 "REST" via=312,232;312,304` (312 = box left minus 32; 232 = centre y of the source). Mirror this on the consumer side with the box's right edge plus 32.
- Place every protocol label on the stretch between the side column and the zone, which is 80px wide: `lpos=240,B` on the left and `lpos=960,B` on the right, with B = that side box's centre y minus 10. Keep labels to about 9 characters; a longer one touches the zone border or the turning vertical at 312/888, so widen the gap (zone at 296, width 608) instead.
- Styles: source to platform is a plain arrow. Platform to consumer is `style=link`. The one hop between the two focal boxes is `style=primary`.
- Orchestrator to a box: a straight dashed drop without a label, `orch.bottom@424 -> store.top@424 style=return` (424 = centre x of the target).
- A shared service connects to the platform as a whole, never to one box inside it: `idp.top@440 -> plat.bottom@440 "auth" style=return`. The arrow ends on the zone's bottom edge. Choose an x that is under the zone and over the service box. Several service arrows need x at least 120 apart.

## Traps

- No arrow from a shared service to a single component, unless it really serves only that one.
- No colour per product. Only the two focal boxes carry the accent.
- No phase banner across the top: that belongs to a high-level diagram.

## Legend

`legend at 40,Y` 24px under the service row: `external=` (source or consumer), `focal=`, `cloud=`, `arrow=`, `primary=`, `link=`, `return=`.
