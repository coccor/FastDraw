# What the coverage fixtures do not reach

`npm run rust:parity -- --coverage` lists what the TypeScript reads (properties, look statements, shape kinds,
markers, series, messages) that no parity case uses. Each entry it may list, and the reason it cannot be covered:

- `message cannot read …`: `loadScene` says this only when it reads the diagram file itself and cannot. `render`
  is always given the diagram's text, so the parity cases (and the crate) never take that path.
- `message icon … is in the full icon set, which this editor leaves out, so it is not drawn here; the editor at fastdraw.dev draws it`:
  only the local editor
  (`vite.local.config.ts`, `fastdraw open --editor local`) leaves the full icon set out, so only there is an icon
  from it missing. Everywhere else, the parity cases and the crate included, the full set is loaded and this
  warning cannot come up.
