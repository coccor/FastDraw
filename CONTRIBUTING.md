# Contributing

FastDraw is written in TypeScript. Working on it needs Node 22.18 or later, because the sources run as TypeScript directly.

```
git clone https://github.com/coccor/fastdraw.git
cd fastdraw
npm install
bin/fastdraw check assets/example.fdraw
npm run dev                                  # the website and editor, at http://localhost:5199
```

## Checks

```
npm test              # core tests
npm run typecheck
npm run test:e2e      # editor tests (Playwright)
npm run build:editor  # static site in dist-editor/, with embed.js
npm run build:embed   # embed.js alone, in dist-embed/
```

Pull requests need the CI checks to pass before they merge. A change in behaviour comes with a test.

## Releases and deployment

- **fastdraw.dev** deploys from `main` through Cloudflare Workers Builds (`wrangler.jsonc`). Pull
  requests get a preview build.
- **The npm package** is published by `.github/workflows/release.yml` when a version tag is pushed:
  `npm version patch` (or `minor`), then `git push --follow-tags`. The tag must match the version in
  `package.json`.

## Repository layout

| Path | What it is |
|---|---|
| `src/` | Core: parser, look loader, arrow router, SVG renderer, checker, text-edit operations |
| `src/cli.ts`, `bin/fastdraw` | The command-line tool |
| `guide/` | What an agent reads to learn the language and how to compose each kind of diagram |
| `src/defaultLook.ts` | The built-in look, used when a diagram names none |
| `agents/` | Thin instruction files that point coding agents at `fastdraw guide` |
| `looks/reference.look` | Test look that mirrors diagram-design's default palette, for quality comparison |
| `looks/whiteboard.look` | Whiteboard: an online-whiteboard look with pastel sticky notes, white rounded shapes, curved connectors and one blue accent. Samples in `examples/whiteboard/` |
| `looks/night.look` | Night: the built-in look after dark, on a deep navy page with the same styles, so a diagram can switch with one line |
| `looks/shade.look`, `engraved.look`, `keys.look`, `transit.look`, `offset.look`, `listing.look` | Six styles of drawing: a hatched shadow, an engraved plate, keycaps, a transit map, two inks out of register, a printout on listing paper. Written by `tools/gen-style-looks.py` |
| `looks/headline.look` | Headline: serif headline over flat newspaper-graphics blocks, one muted crimson accent. An alternative to the built-in look |
| `editor/` | The browser editor (Vite + React) |
| `editor/src/embed/` | `<fastdraw-diagram>`, built as `embed.js` by `vite.embed.config.ts` |
| `worker/` | The fastdraw.dev Worker: diagrams as SVG images at `/gh/*` and `/s/*`, for GitHub |
| `examples/` | Diagrams written by agents from the guides, and looks used in tests |
| `compare/` | Renders next to the diagram-design originals, plus editor screenshots |
| `fonts/` | Geist, Geist Mono and Newsreader (the built-in look), Libre Franklin and Instrument Serif (SIL Open Font License, texts included) |
| `assets/` | The icon, the diagrams shown in the README with their sources, the gallery renders and the editor screenshot |
| `test/`, `e2e/` | Core tests and editor tests |
