# fastdraw-render

[FastDraw](https://fastdraw.dev)'s diagram renderer, in Rust. It turns the text of a `.fdraw` diagram into a
standalone SVG, exactly as the `fastdraw` npm package of the same version draws it, without Node.

It is a port of FastDraw's TypeScript renderer (parser, looks, icons, arrow router, sketch, charts, tables and
SVG writer), not a binding to it. It has no unsafe code, starts no threads and makes no network calls; the
bundled looks, icons, fonts and text widths are compiled in.

## Use

```rust
use std::path::Path;
use fastdraw_render::{render, Source};

let text = std::fs::read_to_string("diagram.fdraw").unwrap();
let drawing = render(&Source { text: &text, file: Some(Path::new("diagram.fdraw")), dark: false });
std::fs::write("diagram.svg", &drawing.svg).unwrap();
for issue in &drawing.issues {
    eprintln!("line {}: {:?}: {}", issue.line, issue.level, issue.message);
}
```

## API

```rust
pub struct Source<'a> { pub text: &'a str, pub file: Option<&'a Path>, pub dark: bool }

pub struct Drawing {
    pub svg: String,              // standalone SVG; text names font families, no @font-face
    pub paper: [u8; 3],           // the look's paper colour (sRGB)
    pub bounds: [f64; 4],         // x, y, w, h in diagram units
    pub issues: Vec<Issue>,       // errors and warnings, as FastDraw's loadScene reports them
    pub font_files: Vec<PathBuf>, // TTF/OTF files from the look's fontdir
    pub look: Option<LookFile>,   // the diagram's own .look file, as read (for the share link)
}
pub struct Issue { pub line: u32, pub level: Level, pub message: String }
pub enum Level { Error, Warning }
pub struct LookFile { pub path: String, pub text: String } // path as written in the diagram

pub fn render(source: &Source) -> Drawing;                 // never fails
pub fn editor_link(name: &str, text: &str, look: Option<&LookFile>) -> String;
pub fn fonts() -> &'static [(&'static str, Vec<u8>)];      // inflated on first call
pub const VERSION: &str;                                    // the crate's version = the npm package's
```

- **`render`** draws what `fastdraw render` draws. With `file: Some(path)` the diagram's look line is read
  relative to the diagram's folder (only `*.look` files), with the look's `icondir` and `fontdir`; with
  `file: None` only bundled looks are used and a look file gives a "look file not found" issue. With
  `dark: true` the diagram is drawn in its look's dark counterpart, as `<fastdraw-diagram>` does on a dark
  page, or as on a light page when there is none. Paths in issue messages are written the way Node's
  `path.resolve` writes them on that platform.
- **`editor_link`** is the `https://fastdraw.dev/edit/#fdraw=…` link that opens the diagram (and its look file)
  in the online editor.
- **`fonts`** returns the bundled fonts (file name, TTF bytes), with ligatures removed so `->` and `>=` draw as
  typed. Text in the SVG names these families; load them into whatever rasterises the SVG.

The other public modules (`parse`, `scene`, `render`, `look`, `js`, …) mirror the TypeScript modules and exist
for the tests; they may change in any release.

## The guarantee

For every input, `render` gives the same SVG, character for character, as the npm package `fastdraw` of the
same version (`VERSION`), and the same issues, paper, bounds, font files and look file. "Close" counts as a
failure. CI checks this on Linux and Windows for every pull request: each example, each coverage fixture in
`tests/coverage/` (written to use every statement, property and message of the language), each drawn in its own
look, every bundled look and the built-in one, light and dark, and with no file (about 3,500 cases). The
exceptions are listed under [Known differences](#known-differences).

## How it is kept in sync

The crate lives in the FastDraw repository next to the TypeScript, and a change to the renderer comes with the
Rust change in the same pull request.

- `npm run rust:data` writes `data/` (looks, icons, fonts, text widths) from the TypeScript sources. It is never
  edited by hand, and CI fails when running it changes anything.
- `npm run rust:cases` writes `tests/geometry.json` (geometry helpers on fixed inputs); CI checks it too.
- `npm run rust:parity` draws every parity case with the TypeScript and writes the answers to `target/parity/`;
  `cargo test` (with `FASTDRAW_PARITY_REQUIRED=1` in CI, so it cannot pass by skipping) compares the crate's
  answers field by field and prints the first differing character. `npm run rust:parity -- --check-links`
  decodes the crate's share links with FastDraw's own decoder, and `-- --coverage` lists what the TypeScript
  reads that no case uses (allowed only when `tests/coverage/UNCOVERED.md` explains it).
- The crate's version is the npm package's: `npm version` updates `Cargo.toml` too, and the release workflow
  publishes both from the same tag.

## Known differences

- **Icon file names outside ASCII** are sorted with an approximation of ICU's root collation (JavaScript's
  `localeCompare`). For ASCII names it is exact; names with other letters may sort differently, which can change
  which file wins when two file names give the same icon name, and which files are kept past the 3,000-icon limit.
- **Where Node would throw, the crate skips.** An icon or font folder that cannot be listed, a file in it that
  cannot be read, or a file name that is not valid UTF-8 stops FastDraw's command-line tool with an error; the
  crate leaves that folder or file out and draws the rest.
- **Drive-relative look paths** on Windows (`look "D:x.look"`): Node resolves them against its remembered
  current folder on drive `D:`; the crate uses the current folder when it is on `D:` and the root of `D:`
  otherwise.
- **`font_files`** may hold the real on-disk path (its case, an 8.3 short name expanded, a `subst` or mapped
  drive resolved) where Node keeps the path as given.
- **A lone surrogate in a font's name record** becomes U+FFFD (a Rust string cannot hold it).
- **Share links**: `editor_link` deflates with `miniz_oxide`, so the bytes differ from the browser's
  `CompressionStream`; the link decodes to the same diagram, which is what is tested.
- **Look files over 1 MB** (1,000,000 bytes) are treated as unreadable (the same "look file not found" issue).
  FastDraw has no such limit.

A look line may name an absolute or UNC path (`look "//server/share/team.look"`), and the crate reads it as
FastDraw does. Whether to allow that is the host application's decision: check the diagram's look path (or the
returned `look`) before rendering untrusted diagrams if it matters. Folders a look names (`icondir`, `fontdir`)
must stay inside the look's own folder, with no `..` out of it and no links.

## Licence

MIT, see `LICENSE`. The bundled icons are Phosphor Icons (MIT, `licenses/phosphor-icons.txt`); the bundled
fonts are under the SIL Open Font License (`licenses/OFL-*.txt`).
