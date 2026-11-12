# Integration diagrams

Shows what plugs into a data platform and what it serves, and over which protocol: source systems on the left, the platform in the middle, consumers on the right, shared services underneath. There are no phases and no time axis. The claim is the number of distinct connections, so this kind may have more boxes than the usual nine (up to about 16).

## Composition

- Three columns on a 1200px canvas: sources at x=40, consumers at x=1000 (`external`, 160x64, 24 apart), and between them one zone, `zone "Data platform" at 280,136 640xH`.
- Inside the zone, on one row: the two or three surfaces the outside connects to (storage, query engine), 160x72, at least 176px apart. Exactly two of them are `focal`: the ones that make this a platform and not a pile of tools.
- Put that row level with the middle box of the side columns. Then the middle wire on each side is straight and the others fan out evenly above and below it.
- An orchestrator is a wide `cloud` box along the top of the zone (32px below its top edge, 16px in from its sides, 56 high), at least 56px above the row.
- Every source and every consumer is its own box, even when three look alike. Merge only identical ones ("Databases", `sub="4 × MariaDB"`).
- Services for the whole platform (identity, logging, secrets) are `cloud` boxes 48 high in a row 48px under the zone, sharing the canvas width with 24px between them. They are outside the zone: identity guards the platform from outside.

## Arrows

- One arrow per wire, each labelled with its protocol (REST, CSV, JDBC). Never one bundled arrow from "the sources".
- Give every arrow its own point on the platform box, 16px apart, the middle one at the box's centre: `crm.right -> store.left@304`, `pos.right -> store.left@320`, `events.right -> store.left@336`.
- The outer wires bend inside the zone, 32px before the box, so the stretch next to the source stays clear for the label: `crm.right -> store.left@304 "REST" via=312,232;312,304` (312 = box left minus 32; 232 = centre y of the source). Mirror this on the consumer side with the box's right edge plus 32.
- Place every protocol label on the stretch between the side column and the zone: `lpos=240,Y` on the left and `lpos=960,Y` on the right, with Y = that side box's centre y minus 10.
- Styles: source to platform is a plain arrow. Platform to consumer is `style=link`. The one hop between the two focal boxes is `style=primary`.
- Orchestrator to a box: a straight dashed drop without a label, `orch.bottom@424 -> store.top@424 style=return` (424 = centre x of the target).
- A shared service connects to the platform as a whole, never to one box inside it: `idp.top@440 -> plat.bottom@440 "auth" style=return`. The arrow ends on the zone's bottom edge. Choose an x that is under the zone and over the service box.

## Traps

- No arrow from a shared service to a single component, unless it really serves only that one.
- No colour per product. Only the two focal boxes carry the accent.
- No phase banner across the top: that belongs to a high-level diagram.

## Legend

`legend at 40,Y` 24px under the service row: `external=` (source or consumer), `focal=`, `cloud=`, `arrow=`, `primary=`, `link=`, `return=`.
