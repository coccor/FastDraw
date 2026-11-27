# Editor

The editor runs in the browser at https://fastdraw.dev/edit/. It is a static site with no server: it reads and writes `.fdraw` files on your computer.

<p align="center">
  <img src="../assets/editor.png" alt="The FastDraw editor with a deployment diagram open, a row inside the load balancer selected and its style panel on the left" width="860">
</p>

In Chrome and Edge the editor saves in place and re-reads the file about once a second, so an
agent and a person can work on the same diagram at the same time. Other browsers keep changes in
memory and download the result. Nothing is uploaded; there is no server.

A diagram's numbers are points (pt). At 100% zoom the canvas draws one point as 4/3 of a CSS pixel, the
size an SVG export shows at; Ctrl+0 goes back to it. A newly opened diagram is centred and zoomed to fill the part of
the window the toolbar, the panels and the bars along the bottom leave free (up to 200%); the Fit button beside
the zoom, or Shift+1, does the same at any time. The style panel opens over the
left of the canvas while something is selected; Escape closes it.

`fastdraw open diagram.fdraw` is the one-step way in, in any browser: it shares that diagram, and only
the files it needs (the look file it names, that look's dark look, and their fonts and icons), with the
editor from a small server on `127.0.0.1` (a random link, answered only for this computer's own name).
Nothing else in the folder is listed, read or written: not other diagrams, and no new files. What is shared
is fixed when it opens: point the diagram at another look file and run `fastdraw open` again to load it. The
look may sit in a folder above the diagram, like `look "../../looks/team.look"`, but not above the folder the
command runs in. It opens the browser at the diagram and writes edits back to the `.fdraw` file. The files
never leave the computer.

It asks once which editor to use, and remembers the answer (`--editor hosted` or `--editor local` changes it):

- **hosted**, the editor at https://fastdraw.dev/edit/: the full icon set, the dark theme, the look picker
  with looks from GitHub, and templates. The server's link and token go after the `#` in its address, so they
  never reach fastdraw.dev. Chrome may ask once to let the page reach apps on this device.
- **local**, a smaller build of the same editor (`npm run build:local`, shipped in the package as
  `dist-local/`) that the command serves itself, so nothing is asked of fastdraw.dev and it works offline. Its
  icon picker offers 24 everyday icons in outline; a diagram still draws its look's own icons and the 128
  built-in icons that ship by default, but another built-in icon is left out, with a warning that the
  editor at fastdraw.dev draws it. It has the light theme only, no look picker and no templates; it draws whatever look the file names, and its
  look tab says to ask the agent for another. A bar at the bottom, the menu's
  **Open on fastdraw.dev** and the start page lead to the site; **Open there** opens a copy in the hosted
  editor, whose edits are not saved to the file.

`--editor http://localhost:5173/edit/` points it at another copy of the hosted editor, such as a dev server.

`npm run build:editor` writes the website to `dist-editor/` as a static site you can host anywhere: the
landing page at `/`, the editor at `/edit/`, `embed.js` (below), and the guide for agents at `/llms.txt`
and `/guide/<kind>.md`.
