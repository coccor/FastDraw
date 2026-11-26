# FastDraw plugin for Claude Code

This plugin adds one skill, `fastdraw`. When you ask Claude Code for a diagram (architecture, request flow, sequence, flowchart, swimlane, data model, chart), the skill has it write the diagram as a `.fdraw` text file: one element per line, with exact coordinates. Claude then runs `fastdraw check` on the file, which reports overlapping boxes, arrows that cross a box, colliding labels and text that does not fit, each with a line number, and fixes them before showing you the result. You can open the same file in the browser editor and move things by hand; your edits are saved back into the file as small text changes.

```
/plugin install fastdraw --marketplace coccor/fastdraw
```

Then ask for a diagram in any repository. Language reference, examples and the editor: https://fastdraw.dev and https://github.com/coccor/FastDraw.

## What it runs, sends and fetches

The plugin has no hooks and no MCP server. The skill lets Claude run one command, the `fastdraw` command-line tool, as `npx -y fastdraw …` (or `fastdraw …` when it is installed): mostly `guide`, `check`, `render` and `open`, sometimes `import` or `sizes`. Its `allowed-tools` line lets Claude run that command without asking while the skill is in use; no other command is pre-approved.

- **npm:** `npx` downloads the `fastdraw` package from registry.npmjs.org. `fastdraw guide` (without a topic) also asks the registry, at most once a day, whether a newer version exists, and keeps the answer in a cache file; skipped on CI and when `FASTDRAW_NO_UPDATE_CHECK` is set.
- **Looks, icons and fonts on the web:** any command that draws or measures (`check`, `render`, `sizes`, `icons`, `preview-look`, `import`) fetches a look, icon or font named by an `https://` address, whether the diagram, its look or a `--look` option names it: for example from raw.githubusercontent.com or jsDelivr (cdn.jsdelivr.net, and data.jsdelivr.com to list an icon package's files). Fetched files are kept in a cache folder; `--offline` uses only that cache. Local `.look` files and the font and icon folders they name are read from disk.
- **`fastdraw open`** starts a server on 127.0.0.1 under a random token and opens the editor at https://fastdraw.dev/edit/ in your browser. The server shares only that diagram and the files it needed when opened: the `.look` file it names, that look's dark look, and their font and icon files. It lists and reads nothing else in the folder, and writes only that diagram and look file. The server's address, token and the diagram's path go after the `#` in the editor's address, which the browser never sends to fastdraw.dev; the editor then loads the diagram from the local server, so it is not uploaded. `--editor` points it at another copy of the editor; `--no-browser` prints the address instead.
- **The editor** keeps the diagrams you open in your browser's storage (IndexedDB) when the browser allows it, so a reload keeps them. Like the CLI, it fetches looks, icons and fonts named by an `https://` address, and its **From GitHub** look picker asks api.github.com for a repository's `.look` files.
- **Docs pages:** when you ask for a diagram on a documentation site, the skill has Claude add `<fastdraw-diagram src="….fdraw">` with a script tag for https://fastdraw.dev/embed.js. Each reader's browser then loads `embed.js`, the `.fdraw` file from the docs site, a look file the diagram names by path from the docs site or by `https://` address from that address (a look that ships with FastDraw needs nothing), and any icons and fonts the look names by `https://` address.

FastDraw has no analytics or telemetry, and sends your diagrams nowhere.

## License

MIT, as the rest of the repository (`LICENSE` at its root).
