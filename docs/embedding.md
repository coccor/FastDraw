# Showing diagrams on other sites

Two ways to show a `.fdraw` file outside the editor: a live drawing on a docs site, or an SVG image in a GitHub README.

## On a docs site

A docs site can show a `.fdraw` file as a live drawing instead of a PNG. Load `embed.js` once and wrap
the image you already have in a `<fastdraw-diagram>` element:

```html
<script type="module" src="https://fastdraw.dev/embed.js"></script>

<fastdraw-diagram src="/diagrams/01-overview.fdraw">
  <img src="/diagrams/01-overview.png" alt="How a run works">
</fastdraw-diagram>
```

The element fetches `src` (relative to the page), draws it as an SVG with the editor's renderer and
replaces the image with it. A `look` line works as it does on the command line: a bundled look by name,
or a `.look` file relative to the `.fdraw` file. The fonts come from the same place as `embed.js`.

- **Size.** The drawing is as wide as the element, and its height follows the diagram's proportions. Give
  `max-height="480"` (or a CSS `max-height`) to cap it; a taller diagram can then be scrolled inside.
- **Moving around.** Drag to pan (one finger on a touch screen), pinch or Ctrl/Cmd+wheel to zoom. A plain
  wheel scrolls the page as usual. Double-click shows the whole diagram again. With the diagram focused,
  `+`, `-` and `0` zoom in, out and back to fit.
- **Toolbar.** On hover or focus (always on touch screens): zoom in, zoom out, fit, full screen, and
  **Open in FastDraw**, which opens a copy of the diagram (and its look file) in the editor at
  https://fastdraw.dev/edit/. The diagram travels in the link after the `#`, so no server sees it. Set
  `editor="http://localhost:5199/edit/"` to send it to another copy of the editor.
- **Dark mode.** `theme="auto"` (the default) follows the page: `data-theme` on `<html>` (Starlight,
  Docusaurus), a `dark` class on `<html>` (VitePress), otherwise the system setting, and redraws when it
  changes. On a dark page a diagram is drawn in its look's dark version (`night` for the built-in look,
  `shade-dark` for `shade`, what a look file's `dark` line names); a look without one stays as it is. `theme="light"` or `theme="dark"` fixes it.
- **When it cannot draw.** If the file is missing or has errors (anything `fastdraw check` reports as an
  error), the image stays and the reason is logged to the browser console. Without JavaScript the image
  is all a reader sees.

`embed.js` is about 6 kB gzipped. It loads the renderer (about 135 kB gzipped) the first time a diagram
is drawn, and the full icon set (about 1 MB) only for a diagram that uses an icon outside the built-in
ones. To host it yourself, `npm run build:embed` writes `embed.js`, its `embed/` folder and `fonts/` to
`dist-embed/` (the npm package ships them, as `fastdraw/embed`); serve the three together, and send
`Access-Control-Allow-Origin` for them if the pages are on another origin. A `fonts="..."` attribute points
at the fonts when they live somewhere else.

## On GitHub

GitHub draws Mermaid blocks itself but runs no other renderer, so a `.fdraw` file shows there as an
image from fastdraw.dev. Point an image at the file's path in a public repository:

```md
![How a run works](https://fastdraw.dev/gh/OWNER/REPO/main/docs/overview.fdraw)
```

The address is `/gh/<owner>/<repo>/<branch>/<path>`, the same parts as a `raw.githubusercontent.com`
link. fastdraw.dev reads the file (and its `.look` file, which must be in the same repository), draws it
with the editor's renderer and answers with an SVG that has its fonts inside, sized in points, one per
unit of the file (the editor's 100%); GitHub shrinks a wider image to the page. Pushing a change updates
the image after a few minutes, once GitHub's and fastdraw.dev's caches expire.

- **Dark mode.** `?theme=dark` draws the look's dark version (`night` for the built-in look). To follow
  the reader's GitHub theme, give both:

  ```html
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://fastdraw.dev/gh/OWNER/REPO/main/docs/overview.fdraw?theme=dark">
    <img alt="How a run works" src="https://fastdraw.dev/gh/OWNER/REPO/main/docs/overview.fdraw">
  </picture>
  ```
- **Editing.** The same address with `?edit` opens the diagram in the editor, so a linked image opens
  there on click: `[![How a run works](URL)](URL?edit)`.
- **Private repositories.** fastdraw.dev cannot read them. Use `/s/<data>` instead, where `<data>` is the
  part after `#fdraw=` in a link from the editor's **Copy link**: the diagram travels in the address itself.
  Keep such an address under about 8 KB, which GitHub's image proxy and most hosts accept. Colour icons
  from the look's icon folder make it longer; leave them out by copying the link where the folder is not
  open, and built-in icons are drawn in their place.
- **Icon folders and web addresses.** fastdraw.dev cannot read a look's `icondir` folder and does not fetch
  icons or fonts a look names by https:// address, so such an icon is drawn as the closest built-in icon
  (`virtual-machine` as `vm`), unless the icon travels in a `/s/` address, and such a font as Geist, Geist Mono
  or Newsreader. `<fastdraw-diagram>` and the editor do fetch them.
- **When it cannot draw.** A missing file, a look outside the repository or a diagram with errors comes
  back as an image that says what is wrong.

## As a link

**Copy link** in the editor's menu copies a link that opens the diagram in the editor at fastdraw.dev:
`https://fastdraw.dev/edit/#fdraw=<data>`. The diagram, its look file and the icon files it uses from the
look's icon folder are inside the link, compressed. Icons and fonts the look names by https:// address are
not: the editor fetches them from there when the link is opened, so such a link stays a few hundred
characters long. That is the way to prefer for vendor icon sets (see "Icons" in `fastdraw guide look` for
recommended sources). Everything sits after the `#`, which browsers never
send to a server, so nothing is uploaded or kept anywhere. Whoever opens the link gets their own copy in
their browser.

Icon files make the link longer: a few hundred characters for a simple icon, a few thousand for a vendor
icon with gradients. Past 64 KB the editor says so, because chat and mail apps may cut long links. Share an
exported image instead (**Export image…**): it carries the same things and opens in the editor when dropped
on it. An icon that is missing from a link (an older link, or one cut short) is drawn as the closest
built-in icon, and the diagram's notes name it.

Font files do not travel in the link: they would make it hundreds of KB long. A look that uses a font that
ships with FastDraw (Geist, Newsreader and the others listed in the look guide), or names its font by
https:// address (`font sans "Inter" "https://..."`), looks the same wherever it is opened. Text in a font
from the look's font folder is drawn in Geist, Geist Mono or Newsreader, by its role, until that folder is
opened.
