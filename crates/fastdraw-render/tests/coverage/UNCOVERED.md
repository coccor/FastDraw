# What the coverage fixtures do not reach

`npm run rust:parity -- --coverage` lists what the TypeScript reads (properties, look statements, shape kinds,
markers, series, messages) that no parity case uses. Each entry it may list, and the reason it cannot be covered:

- `message cannot read …`: `loadScene` says this only when it reads the diagram file itself and cannot. `render`
  is always given the diagram's text, so the parity cases (and the crate) never take that path.
