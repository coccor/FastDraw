# What the coverage fixtures do not reach

`npm run rust:parity -- --coverage` lists what the TypeScript reads (properties, look statements, shape kinds,
markers, series, messages) that no parity case uses. Each entry it may list, and the reason it cannot be covered:

- `message cannot read …`: `loadScene` says this only when it reads the diagram file itself and cannot. `render`
  is always given the diagram's text, so the parity cases (and the crate) never take that path.
- `message icon … is a file in the look's icon folder (…), which did not come along here, so the built-in icon … is drawn in its place`: the stand-in for an icon file that did not come along
  (a shared link, an embedded diagram, fastdraw.dev). It is given only where the look's icon folder was not read;
  the crate reads the folder itself, as the command line does, so a missing icon there is the usual error.
