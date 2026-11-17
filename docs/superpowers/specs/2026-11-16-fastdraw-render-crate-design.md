# `fastdraw-render`: FastDraw's renderer in Rust

**Branch:** `feat/fastdraw-render`. **Consumer:** FastPad (`C:\Projects\Fastpad`, branch `feat/fastdraw-diagrams`),
whose design §3 is the contract this crate fulfils. That contract is restated in §4 and wins over this
document if they ever disagree.

## 1. Intent

FastPad, a Rust editor for Windows, wants to show `.fdraw` diagrams the way FastDraw draws them, offline, with
no Node and nothing fetched from fastdraw.dev. FastDraw's renderer is TypeScript. This crate is a native port of
it that lives in this repository, next to the TypeScript, so that every change to FastDraw's drawing is checked
against the Rust copy by CI. FastPad pins the crate at the exact version of the npm package it matches.

Success: for every diagram and look this repository uses as examples, in every bundled look and its dark
counterpart, the Rust crate returns the SVG and the issues the TypeScript returns, character for character, and
a TypeScript change that alters output cannot be merged without the matching Rust change.

### Goals

- Full fidelity: all bundled looks, `.look` files (including `icon`, `icondir`, `fontdir`, `dark`), sketch,
  charts, every Phosphor icon, FastDraw's fonts.
- Whatever an AI agent writes in a diagram or look (its own icons, colours, styles, fonts, icon files) draws the
  same in Rust as in TypeScript. That holds because the agent's output is files in FastDraw's language and the
  crate interprets that language; §8.3 makes sure the whole language is tested, not only the examples.
- Data (looks, font widths, icons, fonts) generated from the TypeScript sources by a script, never by hand.

### Non-goals

- Editing, `fastdraw check`'s layout warnings (`check.ts`), exports (PNG, embedding sources in images), the
  CLI, the editor, the embed element, `fastdraw sizes` / `icons` search.
- Decoding share links (only encoding is needed).
- A WebAssembly build or use from anything other than Rust.

### Anti-goals

- Output that is "close". A drawing that differs from FastDraw by one character in one look is a failing test,
  not a rounding detail.
- Reading anything from the network, or any file FastDraw's `node.ts` would not read.
- A second source of truth: hand-copied data or behaviour that can drift without CI noticing.

## 2. Constraints

- Pure Rust, `#![forbid(unsafe_code)]`, no network, no threads, no global mutable state beyond lazily
  initialised read-only data (`std::sync::OnceLock`).
- Edition 2024, stable toolchain (FastPad uses `channel = "stable"`), builds on `x86_64-pc-windows-msvc` and
  Linux (CI).
- Small, widely used dependencies only: `miniz_oxide` (inflate data, deflate share links), `indexmap`
  (insertion-ordered maps), `ryu-js` (JavaScript number formatting), `regex` (the TypeScript's regular
  expressions), `libm` (fdlibm-derived maths, as V8 uses). No others without a reason recorded here.
- crates.io package under 10 MB.
- Crate version = npm version (`package.json`), currently 0.2.2.

## 3. Approaches considered

1. **Native port in this repository, parity-tested in CI (chosen).** Exact output and no runtime beyond the
   crate; the cost is that every renderer change is made twice, which CI enforces.
2. Run the TypeScript inside FastPad (embedded JS engine, or Node). Rejected: the user rejected requiring Node,
   and an embedded engine is a large dependency that breaks the "small dependencies" rule.
3. Fetch SVGs from fastdraw.dev's `/s/` endpoint. Rejected: the internet must not be a requirement.
4. Port in FastPad's repository. Rejected: the TypeScript and Rust must change in the same pull request, which
   only works when they share a repository and CI.

## 4. Public interface (from FastPad's contract)

```rust
pub struct Source<'a> { pub text: &'a str, pub file: Option<&'a Path>, pub dark: bool }

pub struct Drawing {
    pub svg: String,                  // standalone SVG; text names font families, no @font-face
    pub paper: [u8; 3],               // the look's paper colour (sRGB)
    pub bounds: [f64; 4],             // x, y, w, h in diagram units
    pub issues: Vec<Issue>,           // errors and warnings, as loadScene reports them
    pub font_files: Vec<PathBuf>,     // TTF/OTF files from the look's fontdir
    pub look: Option<LookFile>,       // the diagram's own .look file, as read (for the share link)
}
pub struct Issue { pub line: u32, pub level: Level, pub message: String }
pub enum Level { Error, Warning }
pub struct LookFile { pub path: String, pub text: String } // path as written in the diagram

pub fn render(source: &Source) -> Drawing;                  // never fails
pub fn editor_link(name: &str, text: &str, look: Option<&LookFile>) -> String;
pub fn fonts() -> &'static [(&'static str, Vec<u8>)];       // inflated on first call
pub const VERSION: &str;                                     // = env!("CARGO_PKG_VERSION")
```

Types derive `Debug, Clone, PartialEq` (and `Eq`, `Copy` where they can). Issues of level `hint` in the
TypeScript are dropped; `Issue.file` (set on look issues) is not exposed.

### 4.1 What `render` does

`render` is the composition FastDraw's command-line tool performs, so the TypeScript reference for it is exact
(§8.1):

- **`file` is `Some(path)`, light:** `loadScene(path, text)` then `renderSvg(scene)`. That covers reading the
  look (`readLook`: only `*.look`, relative to the diagram's folder), `withIcons`,
  `lookFonts` and the missing-font warnings, and the ".look" refusal rewording.
- **`file` is `None`:** `buildScene(text, null, '')`. A bundled look name works; a look line naming a file
  gives the TypeScript's "look file not found" issue, worded with the path as written. No folder is read.
- **`dark`:** the look to draw with is `darkCounterpart(ref, own)` (`editor/src/embed/theme.ts`), where `own`
  is the parsed look (default look for no look line, bundled look by name, the parsed look file, or `null`
  when it cannot be read). If it returns `null`, draw as light. If it is a bundled name, draw
  `withLook(text, name)`. If it is a path, it is relative to the **look file's** folder: draw
  `withLook(text, rel)` where `rel` is that file's path relative to the diagram's folder, written as
  `lookRefText` writes it, so `loadScene` reads it from the right place. When that dark look file cannot be
  read (missing, not readable, over 1 MB), or `file = None` so no path can be read, draw as light: the
  embed's `draw` catches the failed read and keeps the diagram's own look, and the contract follows the embed.
- **Issues in dark mode** are those of the scene actually drawn (the dark one). Line numbers are the same as
  the light text's because `withLook` rewrites the look line in place. *(Builder's call: FastPad shows the
  issues of the drawing on screen, and building a second scene only for its issues would double the work.)*
- **Issues are `loadScene`'s**, errors and warnings, without `check.ts`'s layout warnings: FastPad's design
  (§2) leaves those out of this version, even though its §3.2 comment mentions `fastdraw check`.
- `paper` is `color(look, look.canvas.paper ?? 'paper')` parsed from `#rrggbb` (or `#rgb`); anything else
  (should not happen) gives white.
- `bounds` is `[sc.x, sc.y, sc.w, sc.h]`.
- `font_files` is `sc.fontFiles`; `look` is the diagram's own look file text as read (light: the file the
  diagram names; never the dark one), `None` when the look is bundled, built-in, or unreadable.
- One addition the TypeScript does not have, from FastPad's contract: a look file over 1 MB is treated as
  unreadable (the same "look file not found" issue). The diagram's own text comes from the caller, so the
  1 MB limit on diagram files is FastPad's to apply when it reads them.
- Paths in issue messages are formatted as Node's `path.resolve` formats them on that platform (backslashes
  on Windows).

### 4.2 Icons

The TypeScript's command-line tool loads every icon before drawing (`await loadExtendedIcons()` in `cli.ts`).
The crate always behaves as if the full set were loaded, so a diagram never draws differently depending on
what was drawn before it. The core set (`iconSet.ts`, about 130 icons) is plain data; the rest
(`iconSetAll.ts`, 3.4 MB of TypeScript) is compressed and inflated the first time a name is not in the core
set or the full list is needed (the "there is no icon called" issue lists suggestions from every icon).

Order matters where icon names are listed: the full order is the core set's order, then the extended set's
new names in their order, as `Object.assign` leaves them. A look's icon map is the look's own icons laid over
that shared set without copying it, preserving JavaScript `Map` order when the look redefines a name (it keeps
its position) or adds one (at the end).

### 4.3 `editor_link`

`https://fastdraw.dev/edit/#fdraw=` + base64url (no padding) of the raw-deflated UTF-8 of
`JSON.stringify({name, text[, look: {path, text}]})`. JSON escaping matches `JSON.stringify` (lone
surrogates cannot occur in a `&str`). The deflate stream comes from `miniz_oxide`, so its bytes differ from a
browser's `CompressionStream`, but it decodes (with FastDraw's `decodeShared`) to the same diagram; that is
what is tested.

### 4.4 `fonts`

The bundled fonts from `fonts/*.ttf` (not the woff2), each passed through `withoutLigatures` by the data
script so `->`, `--` and `>=` render as typed, as FastDraw's PNGs do. File names are the originals. Licence
texts (`fonts/OFL-*.txt`) ship in the crate package.

## 5. JavaScript semantics

Byte-identical output means the port reproduces JavaScript, not just the algorithm. A `js` module holds these
in one place, each with unit tests against values printed by Node:

- **Numbers to text:** `ryu_js` for every number interpolated into the SVG or an issue (`String(n)`,
  template literals). `toFixed(5)` (one use, icon scale) gets its own exact implementation.
- **`Math.round`:** `floor(x + 0.5)` with JavaScript's handling of -0 and halves, not Rust's `round`.
- **Parsing:** `+v` / `Number(v)` (whitespace trimming, empty string = 0, hex `0x`, `Infinity`, no trailing
  junk) and `isNaN(+v)`; `parseFloat` / `parseInt` where used.
- **Maths:** `Math.sin`, `cos`, `atan2`, `cbrt`, `log10`, `pow` / `**` through `libm` (fdlibm lineage, as
  V8's `ieee754`). `Math.hypot` is V8's algorithm (scale by the largest, compensated sum), ported. `Math.imul`
  and `>>> 0` with `i32` / `u32` wrapping (the sketch generator). Where a result still differs from Node,
  the parity test shows it and the function is fixed to match.
- **Strings:** JavaScript strings are UTF-16. `length`, `slice`, `charCodeAt`, `s[i]`, `padEnd` work in
  UTF-16 code units; `[...s]` and `codePointAt` in code points. The port keeps text as `&str` and converts
  indices where the TypeScript indexes, or works on a `Vec<u16>` where it slices heavily. `toLowerCase` /
  `toUpperCase` use Rust's Unicode case mapping (same tables for the characters FastDraw allows).
- **Regular expressions:** each TypeScript regex is translated by hand. JavaScript's `\s` (Unicode whitespace
  plus BOM), `\d` and `\w` (ASCII) differ from the `regex` crate's Unicode defaults, so translations use
  explicit classes; anything `regex` cannot express (lookaround, backreferences) is written as code. A unit
  test per translated pattern checks it against cases taken from the TypeScript's own tests.
- **Collections:** `Map`, `Set` and object key order are insertion order (`IndexMap` / `IndexSet`).
  Objects with integer-like keys (`FONT_WIDTHS` by weight) enumerate those keys ascending first, as
  JavaScript does. `Array.prototype.sort` is stable (Rust's `sort_by` is too) and, without a comparator,
  compares UTF-16 strings.
- **`localeCompare`** (sorting icon file names, `iconfiles.ts`) depends on ICU. The port uses an
  approximation of ICU's root collation that is exact for ASCII file names: characters compare by their
  rank in ICU's order of printable ASCII (punctuation first, then symbols, digits, letters, case folded),
  then lowercase before uppercase at the first case difference. Names outside ASCII fall back to code-point
  order. This only matters when two files in one icon folder map to the same icon name; it is documented as
  the crate's one known difference.
- **`JSON.stringify`** (one use in `scene.ts`, plus `withLook` and the share link): quotes and escapes as V8
  does (`\"`, `\\`, `\n`, `\r`, `\t`, `\b`, `\f`, other controls as `\u00xx`, everything else literal).

## 6. Crate layout

```
crates/fastdraw-render/
  Cargo.toml            version = npm version; include = src, data, licences, README
  README.md             what it is, the contract, how it is kept in sync
  LICENSE, licenses/    MIT (FastDraw), Phosphor (MIT), OFL for each font
  src/
    lib.rs              public API (§4), render() composition (§4.1)
    js.rs               JavaScript semantics (§5)
    parse.rs            parse.ts
    look.rs             look.ts, defaultLook.ts
    scene.rs            scene.ts, sizes.ts, fontWidths.ts (measuring)
    router.rs           router.ts
    render.rs           render.ts
    chart.rs            chart.ts
    sketch.rs           sketch.ts
    icons.rs            icons.ts, iconStyle.ts, iconSet*.ts lookup, extended loading
    iconfiles.rs        iconfiles.ts
    fontmeta.rs         fontMeta() from fontmeta.ts (family names, for missing-font warnings)
    disk.rs             node.ts: loadScene, readLook, lookFolder, plainFiles, lookFonts, withIcons
    share.rs            share.ts encoding; theme.ts darkCounterpart
    data.rs             include_bytes! of data/*, OnceLock decoding
  data/                 generated, committed (§7)
  tests/
    parity.rs           §8.1
    coverage/           §8.3 fixtures
```

Each Rust module mirrors one TypeScript module, keeps its function names in snake_case and its comments
where they explain behaviour, so a change to a `.ts` file has an obvious place to land in Rust. The repository
gets a root `Cargo.toml` workspace with this one member, so `cargo test` works from the root, and
`target/` goes in `.gitignore`.

## 7. Generated data

`tools/rust-data.ts` (run with Node 22's type stripping, like the tests) imports the TypeScript modules
themselves, so the data is what the TypeScript actually uses, and writes `crates/fastdraw-render/data/`:

| Data | From | Form |
|---|---|---|
| bundled looks | `BUNDLED_LOOKS`, `DEFAULT_LOOK` | text, plain |
| font widths | `WIDTH_CHARS`, `FONT_WIDTHS` | small binary, plain |
| core icons, weights, tints, words | `ICON_WEIGHTS`, `WEIGHT_WIDTH`, `DUOTONE_TINT`, `ICON_WORDS` | binary, deflated |
| extended icons | `iconSetAll.ts` `EXTRA_*` | binary, deflated |
| fonts | `fonts/*.ttf` through `withoutLigatures` | binary, deflated |
| bundled font families | `fontMeta` of each bundled font | text, plain |

The binary forms are simple length-prefixed records (documented in `data.rs` and the script) read with no
parsing library. Anything other source code needs at compile time (shape kinds, sizes from `sizes.ts`,
constants) is ported as code, not generated, because it is logic, not data.

`npm run rust:data` runs the script. CI runs it and fails if `git diff --exit-code crates/fastdraw-render/data`
is not empty, so data cannot drift from the TypeScript. The deflate level is fixed so output is reproducible.

## 8. Testing

### 8.1 Parity

`tools/rust-parity.ts` writes the TypeScript's answer for every case to `target/parity/` as one JSON file per
case: `{ svg, issues: [{line, level, msg}], paper, bounds, fontFiles, look }`. `tests/parity.rs` runs `render`
on the same inputs and compares field by field, printing the first differing character with context and the
case name. It skips with a clear message when `target/parity/` is missing locally (and CI never lets it be
missing).

Cases: every `.fdraw` under `examples/`, `assets/` and `crates/fastdraw-render/tests/coverage/`, each drawn

- as written (its own look line, so `.look` files with `icondir` / `fontdir` are exercised),
- in each bundled look and in the built-in look (the text passed through `withLook`),
- each of those light and dark (§4.1),
- and once with `file = None` as written.

That is about 2,800 cases; both sides should run in well under a minute. Font file paths and issue paths are
compared after making them relative to the repository root, so the test runs from any checkout.

### 8.2 Unit tests

Per module, TDD: the `js` helpers against Node-printed values, each regex translation, the tokenizer,
`withLook` / `lookPath`, `darkCounterpart`, the sketch generator's first numbers for a seed, icon-file naming
and data URIs, `lookFolder`'s refusals (absolute, `..`, symlink, file not folder), size and count limits, the
share link round trip (decoded with FastDraw's `decodeShared` in the parity script, and with `miniz_oxide`
in Rust), and `fonts()` returning every bundled font.

### 8.3 Coverage of the language

The examples only use some of what the language allows, and an agent may write anything the parser accepts.
`tests/coverage/` holds diagrams and looks, written by hand once, that between them use every look statement
(`canvas`, `color`, `font`, `style` with `extends`, `icon`, `icondir`, `fontdir`, `dark` by name and by path),
every shape kind and line marker, every property `render.ts` reads, every chart series, sketch on and off,
tables, legends, captions, relative points, and the errors and warnings `buildScene` and `parseLook` can
report. A script check (`tools/rust-parity.ts --coverage`) lists properties and statements read by the
TypeScript that no case uses, so the fixture set grows when the language does.

### 8.4 CI

A new `rust` job in `ci.yml` (ubuntu, and windows-latest since FastPad builds there): set up Node 22 and
stable Rust, `npm ci`, `npm run rust:data` + diff check, `node tools/rust-parity.ts`, then
`cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`. A pull request that changes the TypeScript
renderer without the Rust fails here.

## 9. Release

`release.yml` gains, after the npm publish, a check that `Cargo.toml`'s version equals the tag, the same tests,
and `cargo publish -p fastdraw-render` with a `CARGO_REGISTRY_TOKEN` secret in the `release` environment (or
crates.io trusted publishing if available for the account). `npm version` does not bump `Cargo.toml`, so a
`version` npm script hook (`tools/syncCrateVersion.ts`, like `syncPluginVersion.ts`) writes the new version
into it. Nothing is published from this work without the user's explicit OK; the first crates.io release is a
separate step after the pull request is merged.

## 10. Left to the builder

- The order of porting modules and how to stage the parity test while modules are incomplete.
- Internal types (how `Props`, `Shape`, `Scene` look in Rust), as long as behaviour matches.
- The binary data layout and compression level.
- How regexes are split between the `regex` crate and hand-written matching.
- Performance work, provided the parity suite stays fast.
