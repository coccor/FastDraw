# fastdraw-render Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Rust crate, `crates/fastdraw-render`, that draws `.fdraw` diagrams exactly as FastDraw's TypeScript does, checked character for character by a parity test in CI.

**Architecture:** One Rust module per TypeScript module, ported bottom-up (JavaScript semantics → data → parser → looks → icons → geometry → scene → render → disk → public API). A Node script generates the crate's data from the TypeScript; a second Node script writes the TypeScript's answers (parsed looks, scene summaries, full drawings) for a manifest of cases, and Rust tests compare against them at each stage, so each port is checked as soon as it exists.

**Tech Stack:** Rust stable, edition 2024; `miniz_oxide`, `indexmap`, `ryu-js`, `regex`, `libm`. Node 22 with `--experimental-strip-types` for the scripts.

**Spec:** `docs/superpowers/specs/2026-11-16-fastdraw-render-crate-design.md` (read it first; §-references below are to it). Consumer contract: §3 of `C:\Projects\Fastpad\docs\superpowers\specs\2026-11-16-fastdraw-diagrams-design.md`.

## Global Constraints

- `#![forbid(unsafe_code)]`; no network; no threads; global state only `OnceLock` read-only data.
- Edition 2024, stable toolchain; must build and test on `x86_64-pc-windows-msvc` and Linux.
- Dependencies: only `miniz_oxide`, `indexmap`, `ryu-js`, `regex`, `libm` (no dev-dependencies beyond these).
- Crate version = `package.json` version (0.2.2). `VERSION = env!("CARGO_PKG_VERSION")`.
- crates.io package under 10 MB.
- Generated data is never edited by hand; `npm run rust:data` must leave `git diff` empty.
- Node scripts run as `node --experimental-strip-types --disable-warning=ExperimentalWarning <script>.ts` (local Node is 22.16).
- Every number written into SVG or an issue goes through `js::num_str`; every `Math.round` through `js::round`; every `+v` through `js::to_number`.
- Each Rust module keeps the TypeScript function names in snake_case and the comments that explain behaviour.
- Do not push, open a PR or publish without the user's OK. Do not touch `C:\Projects\Fastpad`.

## Review Focus

- **Non-ASCII text** (emoji, CJK, combining marks) in titles, labels, tags and table cells: widths, wrapping and slicing must count UTF-16 units as JavaScript does → coverage fixture `unicode.fdraw` (Task 12).
- **BOM and CRLF** in diagram and look files: Node keeps `\uFEFF` as a character, JS `trim()` and `\s` remove/match it, Rust's `trim()` does not → coverage fixture `bom-crlf.fdraw` + `bom.look` (Task 12), unit test in Task 3.
- **Invalid UTF-8** in a look file: Node decodes to U+FFFD, the crate must not fail → unit test in Task 10 (`String::from_utf8_lossy`).
- **Hostile look folders**: `icondir "../x"`, absolute paths, symlinks, files over the size limits, non-SVG content (`examples/look-test/icons/hostile.svg`) → unit tests in Task 10.
- **Odd numbers in properties** (`1e400`, `NaN`, `-0`, `0x10`, `12px`, empty `size=`): output must print `Infinity`, `NaN`, `0` as JS does → coverage fixture `numbers.fdraw` (Task 12), unit tests in Task 1.

---

## File map

```
Cargo.toml                                  workspace, members = ["crates/fastdraw-render"]
.gitignore                                  + /target
package.json                                + scripts rust:data, rust:parity; version hook syncs Cargo.toml
tools/rust-data.ts                          writes crates/fastdraw-render/data/*
tools/rust-parity.ts                        writes target/parity/** (manifest, looks, scenes, drawings, coverage report)
tools/syncPluginVersion.ts                  also writes crates/fastdraw-render/Cargo.toml version
crates/fastdraw-render/Cargo.toml, README.md, LICENSE, licenses/*
crates/fastdraw-render/data/*               generated (Task 2)
crates/fastdraw-render/src/{lib,js,data,parse,look,icons,iconfiles,router,sketch,scene,chart,render,fontmeta,disk,share}.rs
crates/fastdraw-render/tests/parity.rs      stage tests: looks, scenes, drawings, share
crates/fastdraw-render/tests/coverage/**    language coverage fixtures (Task 12)
.github/workflows/ci.yml, release.yml
```

Internal types (used across tasks; define in the task named):

```rust
// look.rs (Task 4)
pub type Props = IndexMap<String, String>;
pub enum Kind { Shape, Line, Text }
pub struct Style { pub name: String, pub kind: Kind, pub props: Props }
pub enum IssueLevel { Error, Warn, Hint }
pub struct LookIssue { pub line: u32, pub level: IssueLevel, pub msg: String, pub file: Option<String> }
pub struct Look { colors, fonts: IndexMap<String,String>, styles: IndexMap<String,Style>, canvas: Props,
                  icons: IconMap, images: IndexMap<String,String>, icon_dirs, font_dirs: Vec<String>,
                  dark: Option<String>, issues: Vec<LookIssue>, /* every other field of look.ts's Look */ }
// icons.rs (Task 5)
pub struct IconMap { /* own: IndexMap<String, Vec<String>> overlaid on the shared built-in order */ }
// scene.rs (Task 8)
pub struct Scene { pub file: String, pub x, y, w, h: f64, pub look: Rc<Look>, pub shapes: Vec<Shape>,
                   pub texts: Vec<TextEl>, pub conns: Vec<Conn>, pub issues: Vec<LookIssue>,
                   pub font_files: Vec<String>, /* canvas_line, canvas_size, base_canvas */ }
```

Field-by-field shapes of `Shape`, `Conn`, `TextEl`, `Label`, `End`, `Row` follow `scene.ts` lines 12–46 with `Option` for `?`.

---

### Task 1: Crate skeleton and JavaScript semantics (`js.rs`)

**Files:**
- Create: `Cargo.toml` (workspace), `crates/fastdraw-render/Cargo.toml`, `crates/fastdraw-render/src/lib.rs`, `crates/fastdraw-render/src/js.rs`
- Modify: `.gitignore` (+ `/target`)

**Interfaces:**
- Produces (in `js`): `num_str(f64) -> String` (JS `String(n)`), `round(f64) -> f64` (`Math.round`), `to_number(&str) -> f64` (`+v`), `is_nan_str(&str) -> bool` (`isNaN(+v)`), `to_fixed(f64, u32) -> String`, `hypot(&[f64]) -> f64`, `sin, cos, atan2, cbrt, log10, pow` (libm), `imul(i32,i32)->i32`, `utf16_len(&str)->usize`, `utf16_slice(&str, isize, Option<isize>) -> String` (JS `slice` with negative indices), `js_trim(&str)->&str` (JS whitespace incl. `\u{FEFF}`), `is_js_space(char)->bool`, `json_string(&str)->String` (`JSON.stringify` of a string), `utf16_cmp(&str,&str)->Ordering` (default sort), `locale_cmp(&str,&str)->Ordering` (spec §5 approximation).
- Produces (in `lib.rs`): the public types of spec §4 (`Source`, `Drawing`, `Issue`, `Level`, `LookFile`), `VERSION`, and `render`/`editor_link`/`fonts` as `todo!()` stubs.

- [ ] **Step 1: Write the workspace and crate manifests.** Root `Cargo.toml`: `[workspace] members = ["crates/fastdraw-render"] resolver = "3"`. Crate: `name = "fastdraw-render"`, `version = "0.2.2"`, `edition = "2024"`, `license = "MIT"`, `repository = "https://github.com/coccor/fastdraw"`, `description = "FastDraw's diagram renderer, in Rust"`, `include = ["src/**", "data/**", "README.md", "LICENSE", "licenses/**"]`, dependencies `miniz_oxide`, `indexmap`, `ryu-js`, `regex`, `libm` at current versions. `lib.rs` starts with `#![forbid(unsafe_code)]`.

- [ ] **Step 2: Write failing tests in `js.rs`** (values printed by Node 22):

```rust
#[test] fn numbers_print_like_js() {
    assert_eq!(num_str(0.1 + 0.2), "0.30000000000000004");
    assert_eq!(num_str(1e21), "1e+21");
    assert_eq!(num_str(-0.0), "0");
    assert_eq!(num_str(123e-20), "1.23e-18");
    assert_eq!(num_str(5e-7), "5e-7");
    assert_eq!(num_str(9007199254740994.0), "9007199254740994");
    assert_eq!(num_str(f64::INFINITY), "Infinity");
    assert_eq!(num_str(f64::NAN), "NaN");
}
#[test] fn round_like_js() {
    assert_eq!(round(2.5), 3.0); assert_eq!(round(-2.5), -2.0);
    assert!(round(-0.4).is_sign_negative()); assert_eq!(round(0.49999999999999994), 0.0);
}
#[test] fn unary_plus_like_js() {
    assert_eq!(to_number(" 12 "), 12.0); assert_eq!(to_number(""), 0.0);
    assert_eq!(to_number("0x1f"), 31.0); assert_eq!(to_number("1e3"), 1000.0);
    assert_eq!(to_number(".5"), 0.5); assert_eq!(to_number("5."), 5.0);
    assert_eq!(to_number("-Infinity"), f64::NEG_INFINITY);
    assert!(to_number("12px").is_nan()); assert!(to_number("-").is_nan()); assert!(to_number("1e400").is_infinite());
    assert_eq!(to_number("\u{FEFF}7"), 7.0);
}
#[test] fn maths_like_v8() {
    assert_eq!(hypot(&[3.0, 4.0]), 5.0);
    assert_eq!(hypot(&[0.1, 0.7]), 0.7071067811865476);
    assert_eq!(hypot(&[123.456, 7.89]), 123.707865699801);
    assert_eq!(hypot(&[1e200, 1e200]), 1.414213562373095e200);
    assert_eq!(hypot(&[-2.5, 1.0 / 3.0]), 2.522124325070259);
    assert_eq!(cbrt(0.3), 0.6694329500821695); assert_eq!(cbrt(12.5), 2.3207944168063896);
    assert_eq!(pow(0.7, 2.4), 0.42484968054675043); assert_eq!(pow(0.42, 1.0 / 2.4), 0.6966594581646747);
    assert_eq!(sin(1.2345), 0.9439833239445111); assert_eq!(cos(2.5), -0.8011436155469337);
    assert_eq!(atan2(0.3, -0.7), 2.7367008673047097); assert_eq!(log10(1234.5), 3.091491094267951);
}
#[test] fn to_fixed_like_js() {
    assert_eq!(to_fixed(0.0625, 5), "0.06250"); assert_eq!(to_fixed(20.0 / 256.0, 5), "0.07813");
    assert_eq!(to_fixed(1.0 / 3.0, 5), "0.33333");
}
#[test] fn strings_like_js() {
    assert_eq!(utf16_len("a😀"), 3); assert_eq!(utf16_slice("héllo", 1, Some(-1)), "éll");
    assert_eq!(js_trim("\u{FEFF} a \u{3000}"), "a");
    assert_eq!(json_string("a\"b\\c\nd\u{1}é"), "\"a\\\"b\\\\c\\nd\\u0001é\"");
    assert_eq!(utf16_cmp("Z", "a"), Ordering::Less); assert_eq!(utf16_cmp("\u{FF5E}", "😀"), Ordering::Greater);
    let mut v = vec!["b.svg", "A.svg", "a-b.svg", "a.svg", "10.svg", "2.svg"];
    v.sort_by(|a, b| locale_cmp(a, b));
    assert_eq!(v, ["10.svg", "2.svg", "a.svg", "A.svg", "a-b.svg", "b.svg"]);
}
```

(The `locale_cmp` expectation is `["10.svg","2.svg","a.svg","A.svg","a-b.svg","b.svg"].sort((a,b)=>a.localeCompare(b))` in Node; confirm it in Node before relying on it and use Node's order if it differs.)

- [ ] **Step 3: Run** `cargo test -p fastdraw-render js::` — expected: compile errors / FAIL.
- [ ] **Step 4: Implement `js.rs`.** `num_str` via `ryu_js::Buffer` (handle NaN/±Infinity/-0 first). `hypot` ports V8's `MathHypot` (Torque: abs values, NaN/Infinity rules, max = largest; if max == 0 return 0; sum of `(v/max)^2` with Kahan compensation; `sqrt(sum) * max`). `to_number` follows ECMAScript StringToNumber (trim JS whitespace, empty → 0, `0x`/`0o`/`0b` integers, `Infinity` with sign, else decimal literal grammar parsed by Rust `f64::from_str` after validating the grammar). `locale_cmp`: key 1 = letters/digits only, case-folded (digits before letters); key 2 = punctuation sequence; key 3 = lowercase before uppercase at the first case difference; non-ASCII falls back to `utf16_cmp`.
- [ ] **Step 5: Run** `cargo test -p fastdraw-render js::` — expected: PASS. Also `cargo clippy --all-targets -- -D warnings`.
- [ ] **Step 6: Commit** `git add Cargo.toml .gitignore crates && git commit -m "fastdraw-render: crate skeleton and JavaScript number and string semantics"`

---

### Task 2: Generated data (`tools/rust-data.ts`, `data.rs`)

**Files:**
- Create: `tools/rust-data.ts`, `crates/fastdraw-render/src/data.rs`, `crates/fastdraw-render/data/*`
- Modify: `package.json` (script `"rust:data": "node --experimental-strip-types --disable-warning=ExperimentalWarning tools/rust-data.ts"`)

**Interfaces:**
- Consumes: `src/bundledLooks.ts`, `src/defaultLook.ts`, `src/fontWidths.ts`, `src/iconSet.ts`, `src/iconSetAll.ts`, `src/icons.ts` (`ICON_WORDS` before extension), `src/fontmeta.ts` (`fontMeta`, `withoutLigatures`), `fonts/*.ttf`.
- Produces (in `data`):
  - `bundled_looks() -> &'static IndexMap<&'static str, &'static str>` (name → source, in `BUNDLED_LOOKS` order); `DEFAULT_LOOK: &str`.
  - `width_chars() -> &'static [u16]`; `font_widths() -> &'static IndexMap<String, Vec<(u32, Vec<i16>)>>` (family → weights ascending → widths).
  - `IconWeight { Thin, Light, Regular, Bold, Fill }`; `weight_width() -> [(IconWeight, f64); 4]`.
  - `core_icons() -> &'static IconData`, `extended_icons() -> &'static IconData` where `IconData { names: Vec<String>, paths: [IndexMap<String, Vec<String>>; 5] /* by IconWeight */, tint: IndexMap<String, Vec<String>>, words: IndexMap<String, String> }`.
  - `fonts() -> &'static [(&'static str, Vec<u8>)]` (ligature-free copies, file-name order).
  - `bundled_font_families() -> &'static [String]` (lowercased `fontMeta(...).family` of each bundled font).

Data files (all written with LF; deflated ones use raw deflate level 9 via Node's `zlib.deflateRawSync`, which is deterministic):
`looks.txt` (records `name\0source\0`, `default` first under the empty name), `widths.bin`, `icons-core.bin.deflate`, `icons-extended.bin.deflate`, `fonts.bin.deflate`, `font-families.txt`. Binary records: `u32 LE length + UTF-8 bytes` for strings, `u32 LE count` before lists. Document the layout at the top of both `rust-data.ts` and `data.rs`.

- [ ] **Step 1: Write failing tests in `data.rs`:**

```rust
#[test] fn looks_are_all_there() {
    let names: Vec<_> = bundled_looks().keys().copied().collect();
    assert_eq!(names, ["engraved","headline","keys","listing","night","offset","reference","shade","sketch","transit","whiteboard"]);
    assert!(DEFAULT_LOOK.contains("dark night"));
}
#[test] fn widths_match_typescript() {
    assert_eq!(width_chars().len(), 106);
    let geist = &font_widths()["geist"];
    assert_eq!(geist[0].0, 400); assert_eq!(&geist[0].1[..3], &[25, 21, 35]);
    assert_eq!(font_widths()["libre franklin"][0].1[95], -1);
}
#[test] fn icons_load() {
    assert!(core_icons().paths[IconWeight::Regular as usize].contains_key("database"));
    assert_eq!(core_icons().paths[IconWeight::Thin as usize]["active-directory"][0].len() > 100, true);
    assert!(extended_icons().names.len() > 1000);
    assert!(extended_icons().names.iter().all(|n| !core_icons().paths[IconWeight::Regular as usize].contains_key(n.as_str())));
}
#[test] fn fonts_inflate() {
    let f = fonts();
    assert_eq!(f.len(), 17);
    assert!(f.iter().any(|(n, _)| *n == "Geist-Regular.ttf"));
    assert!(f.iter().all(|(_, b)| b.len() > 10_000 && &b[..4] == [0, 1, 0, 0]));
}
```

(Confirm `width_chars().len()` against `WIDTH_CHARS.length` and the font count against `ls fonts/*.ttf`; fix the expected numbers, not the code, if they differ.)

- [ ] **Step 2: Run** `cargo test -p fastdraw-render data::` — FAIL.
- [ ] **Step 3: Write `tools/rust-data.ts`** importing the TypeScript modules (extended icons via `import('../src/iconSetAll.ts')` for `EXTRA_WEIGHTS`, `EXTRA_TINT`, `EXTRA_WORDS`), writing the files above. `extended_icons().names` = keys of `EXTRA_WEIGHTS.regular` not already in core, in order.
- [ ] **Step 4: Run** `npm run rust:data` then implement `data.rs` (`include_bytes!`, `OnceLock`, `miniz_oxide::inflate::decompress_to_vec`).
- [ ] **Step 5: Run** `cargo test -p fastdraw-render data::` — PASS. Run `npm run rust:data && git diff --exit-code crates/fastdraw-render/data` — no diff (determinism).
- [ ] **Step 6: Commit** `git commit -m "fastdraw-render: data generated from the TypeScript"`

---

### Task 3: Parity harness and the tokenizer (`tools/rust-parity.ts`, `parse.rs`)

**Files:**
- Create: `tools/rust-parity.ts`, `crates/fastdraw-render/src/parse.rs`, `crates/fastdraw-render/tests/parity.rs`
- Modify: `package.json` (`"rust:parity": "node --experimental-strip-types --disable-warning=ExperimentalWarning tools/rust-parity.ts"`)

**Interfaces:**
- Produces (`parse`): `Tok { t: TokKind /* Str, Word, Prop */, v: String, k: Option<String>, q: bool }`, `Stmt { line: u32, end: u32, toks: Vec<Tok> }`, `strip_comment(&str) -> &str`, `parse_statements(&str) -> Vec<Stmt>`; also `look_path(&str) -> Option<String>` and `with_look(&str, &str) -> String` (from `scene.ts`; they live here because they only need the tokenizer).
- Produces (`tools/rust-parity.ts` → `target/parity/`):
  - `manifest.json`: `[{ id, file /* repo-relative, '/' separators */, input /* text passed to render */, dark: bool, noFile: bool }]` — cases of spec §8.1. `input` is the diagram text, already passed through `withLook` for the look variants. `id` is `<file>@<look|own>[-dark][-nofile]`.
  - `looks/<name>.json` for each bundled look, the default look and every `.look` under `examples/` and `tests/coverage/`: `{ colors, fonts, styles: [{name, kind, props}], canvas, icons: [names in order], images: [names], iconDirs, fontDirs, dark, issues }` plus every other `Look` field, `Map`s as arrays of pairs.
  - `scenes/<id>.json`: `{ x, y, w, h, issues, shapes: [{id, shape, x, y, w, h}], texts: [{id, x, y, w, h}], conns: [{pts, label: {x,y,w,h}|null}] }` (numbers as JSON numbers).
  - `drawings/<id>.json`: `{ svg, issues: [{line, level, msg}] /* hints dropped */, paper, bounds, fontFiles /* repo-relative */, look: {path,text}|null }`.
  - `share.json`: `[{ name, text, look, decoded }]` round-trip fixtures (Task 11 fills the Rust side).
  - The TypeScript reference composition for `drawings` follows spec §4.1 exactly (light: `loadScene(abs, input)`; noFile: `buildScene(input, null, '')`; dark: `darkCounterpart` on the parsed own look, read relative to the look file, fall back to light), `renderSvg(sc)`.
- Produces (`tests/parity.rs`): `fn cases() -> Vec<Case>` reading the manifest; `fn expect_eq(id: &str, what: &str, want: &str, got: &str)` that panics with the first differing character index, 80 characters of context on each side and the case id. Each stage test collects all failures and reports the count plus the first 10, rather than stopping at the first. When `target/parity/manifest.json` is missing, tests print `run npm run rust:parity first` and pass (CI sets `FASTDRAW_PARITY_REQUIRED=1`, which turns that into a failure).

- [ ] **Step 1: Write `tools/rust-parity.ts`** (all outputs above; `scenes` and `drawings` are written for every case even though Rust compares them only from Tasks 8 and 10). Paths inside `msg` strings are made repo-relative by replacing the absolute repo root with `<root>` and `\` with `/` on both sides at compare time.
- [ ] **Step 2: Run** `npm run rust:parity`. Expected: `target/parity/manifest.json` with about 2,800 cases, no exceptions. Print the count.
- [ ] **Step 3: Write failing tests in `parse.rs`:**

```rust
#[test] fn tokens() {
    let s = parse_statements("a: node \"Hi \\\"there\\\"\" at 10,20 fill=accent/0.2 label=\"x y\" // note\n  sub=\"two\"\n# c\nb: node");
    assert_eq!(s.len(), 2); assert_eq!((s[0].line, s[0].end), (1, 2));
    assert_eq!(s[0].toks[2].v, "Hi \"there\""); assert_eq!(s[0].toks[2].t, TokKind::Str);
    assert_eq!(s[0].toks[5].k.as_deref(), Some("fill")); assert!(!s[0].toks[5].q);
    assert!(s[0].toks[6].q); assert_eq!(s[0].toks.last().unwrap().k.as_deref(), Some("sub"));
}
#[test] fn bom_and_crlf() {
    let s = parse_statements("\u{FEFF}a: node\r\nb: node\r\n");
    assert_eq!(s.len(), 2); assert_eq!(s[0].toks[0].v, "a:");
}
#[test] fn look_lines() {
    assert_eq!(look_path("look \"./x.look\"\na: node").as_deref(), Some("./x.look"));
    assert_eq!(with_look("a: node\n", "night"), "a: node\nlook night\n");
    assert_eq!(with_look("look a\nb: node\nlook c\n", "./t.look"), "look \"./t.look\"\nb: node\n\n");
}
```

(Check each expectation in Node with the TypeScript functions before relying on it.)

- [ ] **Step 4: Run** `cargo test -p fastdraw-render parse::` — FAIL. **Step 5: Implement `parse.rs`** (JS `\s` = `js::is_js_space`; the prop regex `^([A-Za-z][\w./#-]*)=([\s\S]*)$` as code). **Step 6: Run** — PASS.
- [ ] **Step 7: Add a parity stage `parse_matches`** in `tests/parity.rs`: for every distinct input in the manifest, `look_path` equals the TypeScript's (add `lookPath` to the manifest entries in the script). Run `cargo test -p fastdraw-render --test parity` — PASS.
- [ ] **Step 8: Commit** `git commit -m "fastdraw-render: tokenizer and the parity harness"`

---

### Task 4: Looks (`look.rs`)

**Files:** Create `crates/fastdraw-render/src/look.rs`; modify `tests/parity.rs`.

**Interfaces:**
- Consumes: `parse::parse_statements`, `data::{bundled_looks, DEFAULT_LOOK}`, `icons::IconMap::builtin()` (Task 5 — until then `look.icons` holds only the look's own icons; add the built-in overlay in Task 5).
- Produces: the types in the file map; `empty_look() -> Look`, `parse_look(src: &str, path: &str) -> Look`, `color(look: &Look, v: Option<&str>, over: Option<&str>) -> String`, `is_color(&Look, &str) -> bool`, `font_family(&Look, Option<&str>) -> String`, `tint_keeps_hue(&Look) -> bool`, `is_bundled_look(&str) -> bool`, `bundled_look(name) -> Option<Rc<Look>>` and `default_look() -> Rc<Look>` (cached per thread with `thread_local!` + `OnceCell`, since `Look` holds `Rc`; or `Arc` + `OnceLock` — pick one and use it everywhere), `bundled_look_names() -> Vec<&'static str>`.
- `Look` must be `Clone` (scene and `withIconImages` copy it).

- [ ] **Step 1: Failing unit tests:** `parse_look` of `"color ink #112233\nstyle node fill=ink\nstyle hot extends node fill=accent\nicon q \"M4 6h16\"\nicon Bad \"M0\"\ndark night\nfontdir \"./f\""` gives colour `ink`, style `hot` with `fill=accent` and inherited props, icon `q`, one error issue on line 5 with the TypeScript's wording, `dark == Some("night")`, `font_dirs == ["./f"]`. `color` of `ink/0.5` over paper and of `#abc` match the strings Node prints for the default look (get them from Node: `color(defaultLook(), 'ink/0.5')`, `color(defaultLook(), 'accent', 'paper')`, `color(defaultLook(), '#abc')`).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** (port `look.ts` top to bottom; oklab maths via `js::pow`, `js::cbrt`). **Step 4: Run** — PASS.
- [ ] **Step 5: Parity stage `looks_match`:** for every `target/parity/looks/*.json`, parse the same source in Rust and compare a JSON-like dump (write `fn dump(&Look) -> String` in the test file producing the same shape as the script, keys in the script's order, numbers via `num_str`). Icons compared as name lists. Run `cargo test --test parity looks_match` — PASS (icon name lists pass after Task 5; mark that sub-comparison `#[ignore]`-free but skipped with a `TODO(Task 5)` comment until then, and remove it in Task 5).
- [ ] **Step 6: Commit** `git commit -m "fastdraw-render: looks"`

---

### Task 5: Icons (`icons.rs`, `iconfiles.rs`)

**Files:** Create `crates/fastdraw-render/src/icons.rs`, `crates/fastdraw-render/src/iconfiles.rs`; modify `look.rs`, `tests/parity.rs`.

**Interfaces:**
- Consumes: `data::{core_icons, extended_icons, IconWeight, weight_width}`.
- Produces (`icons`): `IconMap` with `builtin() -> IconMap`, `get(&self, name) -> Option<&[String]>` (falls through to built-ins, inflating the extended set only on a core miss), `set(&mut self, name, paths)` (JS `Map.set` order rules, spec §4.2), `keys(&self) -> impl Iterator<Item=&str>` (full order; inflates extended), `is_builtin_value(&self, name) -> bool` (the `look.icons.get(name) === ICONS[name]` test: true when the look has not redefined it); `icon_words() -> &IndexMap` (core then extended words); `icon_matches(name, word) -> bool`; `is_built_in(look, name) -> bool`; `weight_for(width: Option<f64>) -> IconWeight`; `icon_layers(name, style: IconStyle, weight) -> (Vec<String> /*tint*/, Vec<String> /*front*/)`; `IconStyle { Outline, Solid, Duotone }`; `ICON_BOX = 256.0`.
- Produces (`iconfiles`): `MAX_ICON_BYTES = 300_000`, `MAX_ICON_FILES = 3000`, `is_icon_uri(&str) -> bool`, `icon_name(file: &str) -> String`, `svg_data_uri(&[u8]) -> Option<String>`, `with_icon_images(look: &Look, files: Vec<(String, Vec<u8>)>) -> Look` (sorted with `js::locale_cmp`; no `uris` argument: nothing in the crate passes one).

- [ ] **Step 1: Failing tests:** `icon_name("10021-icon-service-Virtual-Machine.svg") == "virtual-machine"`, `icon_name("Load Balancer.svg") == "load-balancer"`; `svg_data_uri(b"<svg></svg>")` = `"data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="`; `svg_data_uri(b"<html>")` is `None`; an over-limit buffer is `None`; `weight_for(None)` is Regular, `weight_for(Some(13.0))` is Light; `IconMap::builtin().keys().count()` equals the TypeScript's `Object.keys(ICON_WEIGHTS.regular).length` after `loadExtendedIcons()` (print it in Node); setting an existing name keeps its index, a new one goes last; `icon_matches("mail", "email")` and `icon_matches("pod", "k8s")` are true.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement**; wire `Look.icons = IconMap::builtin()` in `empty_look`. **Step 4: Run** — PASS; re-enable the icon-name comparison in `looks_match` and run it — PASS.
- [ ] **Step 5: Commit** `git commit -m "fastdraw-render: built-in icons and icon files"`

---

### Task 6: Geometry helpers (`router.rs`, `sketch.rs`)

**Files:** Create `crates/fastdraw-render/src/router.rs`, `crates/fastdraw-render/src/sketch.rs`.

**Interfaces:**
- Produces (`router`): `Pt { x: f64, y: f64 }`, `Box { x, y, w, h: f64 }` (name it `Rect` in Rust to avoid `std::boxed::Box`; scene and render use `Rect`), `seg_hits(a: Pt, b: Pt, r: &Rect) -> bool`, `crosses(&[Pt], &[Rect]) -> bool`, `simplify(&[Pt]) -> Vec<Pt>`, `route_around(p0: Pt, d0: Option<Pt>, p1: Pt, d1: Option<Pt>, obstacles: &[Rect], taken: &[(Pt, Pt)]) -> Option<Vec<Pt>>`.
- Produces (`sketch`): `can_sketch(&str) -> bool`, `rough_path(d: &str, amount: f64, pass: i32) -> String`, `sketch_svg(d: &str, attrs: &str, amount: f64, under: &str) -> String`, `rect_d(x, y, w, h, r: f64) -> String`, `ellipse_d(x, y, w, h: f64) -> String`. `r2` lives in `js` as `js::r2(f64) -> f64` (`Math.round(n*100)/100`).

- [ ] **Step 1: Failing tests.** Sketch: the private `seeded("M0 0 L10 0", 0)` yields `0.5323078422807157, 0.3873084601946175, 0.8366957046091557`. For `rough_path`, `sketch_svg`, `rect_d`, `ellipse_d`, `route_around` and `simplify`, add a small Node script `tools/rust-cases.ts` that prints JSON of the TypeScript results for a fixed list of inputs (5 paths × 2 amounts × 2 passes; 6 obstacle layouts for `route_around` including "no route" and `taken` segments), save its output as `crates/fastdraw-render/tests/geometry.json` (generated, committed; regenerated in CI with the data diff check), and assert equality for each.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** (`Math.imul`/`>>>`/`|0` with `wrapping_*` on `i32`/`u32`; `charCodeAt` over UTF-16 units). **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `git commit -m "fastdraw-render: router and sketch"`

---

### Task 7: Text measuring and scene helpers (`scene.rs`, part 1)

**Files:** Create `crates/fastdraw-render/src/scene.rs` (helpers only).

**Interfaces:**
- Produces: the scene types (`Shape`, `TextEl`, `End`, `Label`, `Conn`, `Row`, `Col`, `LegendItem`, `Side`, `Scene`) and constants `SERIES`, `CANVAS_KEYS`, `MARKERS`, `ICON_CAPTION_GAP = 6.0`, `MARGIN = 40.0`; `text_width(text, size, font, weight, spacing) -> f64`, `measure_text(look, text, size, role, weight, spacing) -> f64`, `caption_box(&Shape) -> Option<Rect>`, `extent(shapes: &[Rect], texts: &[Rect], conns: &[Conn]) -> Rect`; private ports of `autoSides`, `sidePoint`, `corner`, `route`, `curvePts`, `pointAlong`, `makeLabel`, `layoutTable`, `parseEnd`.

- [ ] **Step 1: Failing tests:** extend `tools/rust-cases.ts` with `textWidth` / `measureText` for: plain ASCII, `"→ ü 日本 😀"`, letter spacing 0.5, each bundled font family at 400 and 700, and a family not in the table; and `parseEnd` for `+0,260`, `-40,+0`, `-40,-20`, `a.left@0.3`, `t.row2.right`, `a.top.left` (null), `1,2,3` (null). Assert against `geometry.json`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `git commit -m "fastdraw-render: text measuring and scene helpers"`

---

### Task 8: `buildScene` (`scene.rs`, part 2)

**Files:** Modify `crates/fastdraw-render/src/scene.rs`, `tests/parity.rs`.

**Interfaces:**
- Consumes: Tasks 3–7.
- Produces: `build_scene(src: &str, look_in: Option<Look>, file: &str) -> Scene`.

- [ ] **Step 1: Parity stage `scenes_match`** in `tests/parity.rs`: for each case with `noFile` (no disk access needed yet) and for each case whose diagram has no look-file line, run `build_scene(input, None, "")` / with the bundled look, dump to the `scenes/<id>.json` shape, compare. Run — FAIL.
- [ ] **Step 2: Port `buildScene`** (scene.ts 335–753) in the same order and with the same sub-steps, as one function split into private helpers named after its comment headings. Issue messages are copied verbatim from the TypeScript.
- [ ] **Step 3: Run** `cargo test --test parity scenes_match` until every case passes. When one fails, compare the first differing shape, fix, rerun.
- [ ] **Step 4: Commit** `git commit -m "fastdraw-render: building the scene"`

---

### Task 9: Charts and the SVG writer (`chart.rs`, `render.rs`)

**Files:** Create `crates/fastdraw-render/src/chart.rs`, `crates/fastdraw-render/src/render.rs`; modify `tests/parity.rs`.

**Interfaces:**
- Consumes: Tasks 4–8.
- Produces (`render`): `esc(&str) -> String`, `num(Option<&str>, f64) -> f64`, `col(look, v, over) -> String`, `text_attrs(look, p, pre, d: &TextDefaults) -> String` with `TextDefaults { font: String, size: f64, weight: f64, color: String }`, `icon_box`, `text_block`, `tag_layout`, `tag_width`, `legible(Scene) -> Scene`, `render_body(&Scene, background: bool) -> String`, `render_svg(&Scene) -> String` (no `css`, `background` true: the only form `render` uses).
- Produces (`chart`): `nice_step(span, max) -> f64`, `draw_chart(look, &Shape) -> String`.

- [ ] **Step 1: Parity stage `drawings_match_without_disk`:** same case filter as Task 8; `render_svg(build_scene(...))` vs `drawings/<id>.json` `svg`. Run — FAIL.
- [ ] **Step 2: Port `chart.ts`**, with a unit test of `nice_step` for spans 1, 7, 95, 0.03, 1e6 against `geometry.json` values.
- [ ] **Step 3: Port `render.ts`** top to bottom (the module-level `R` state in render.ts becomes a `RenderCtx` struct passed by `&mut`, created per `render_svg` call: no global state).
- [ ] **Step 4: Run** `cargo test --test parity drawings_match_without_disk` until every case passes.
- [ ] **Step 5: Commit** `git commit -m "fastdraw-render: charts and the SVG writer"`

---

### Task 10: Disk reads and `render` (`fontmeta.rs`, `disk.rs`, `lib.rs`)

**Files:** Create `crates/fastdraw-render/src/fontmeta.rs`, `crates/fastdraw-render/src/disk.rs`; modify `lib.rs`, `tests/parity.rs`.

**Interfaces:**
- Consumes: everything above; `share::dark_counterpart` (write it here if Task 11 has not run: `dark_counterpart(r#ref: Option<&str>, look: Option<&Look>) -> Option<String>`, in `share.rs`).
- Produces (`fontmeta`): `font_meta(&[u8]) -> Option<FontMeta { family: String, weight: u32, italic: bool }>`.
- Produces (`disk`): `look_folder(look_file: &Path, d: &str) -> Option<PathBuf>`, `plain_files(dir, ext: fn(&str)->bool, max_bytes: u64, max_files: usize) -> Vec<PathBuf>`, `with_icons(look_file: &Path, look: Look) -> Look`, `look_fonts(look_file: Option<&Path>, look: &Look) -> (Vec<PathBuf>, Vec<String>)`, `read_look(file: &Path, p: Option<&str>) -> (Option<String>, bool /*refused*/)` (adds the 1 MB limit), `load_scene(file: &Path, src: &str) -> Scene`, `resolve(base: &Path, rel: &str) -> PathBuf` and `path_string(&Path) -> String` (Node `path.resolve` formatting: absolute, normalised `.`/`..`, platform separators, no `\\?\` prefix — never use `canonicalize` output in messages), `look_ref_text(file: &Path, target: &Path) -> String`.
- Produces (`lib`): `render(&Source) -> Drawing` per spec §4.1.

- [ ] **Step 1: Failing unit tests in `disk.rs`** (temp dirs under `std::env::temp_dir()` with a unique name per test, removed at the end): `look_folder` refuses `"/abs"`, `"C:\\abs"`, `"../out"`, a file, and (on Unix, or Windows when `std::os::windows::fs::symlink_dir` succeeds) a symlink to a folder outside; accepts `"./icons"`. `plain_files` skips files over the limit, non-matching names, and stops at `max_files`; returns sorted by UTF-16 order. `read_look` refuses `x.txt` (refused = true), returns `None` for a 1,000,001-byte `.look`. A look file containing bytes `ff fe 41` parses without panic (text via `String::from_utf8_lossy`). `font_meta` of `examples/look-test/fonts/FiraSans-SemiBold.ttf` is `{ "Fira Sans", 600, false }`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement `fontmeta.rs`, `disk.rs`, then `render`** (paper parsing: `#rrggbb` / `#rgb`, else `[255,255,255]`). **Step 4: Run** — PASS.
- [ ] **Step 5: Parity stage `drawings_match`:** every case, `render(&Source { text: input, file: (!noFile).then(abs), dark })` vs `drawings/<id>.json` (all fields; paths normalised as in Task 3). Run until every case passes. Remove `drawings_match_without_disk` (now a subset).
- [ ] **Step 6: Commit** `git commit -m "fastdraw-render: reading looks, icons and fonts from disk, and render"`

---

### Task 11: Share link and fonts (`share.rs`, `lib.rs`)

**Files:** Create/modify `crates/fastdraw-render/src/share.rs`; modify `lib.rs`, `tests/parity.rs`, `tools/rust-parity.ts`.

**Interfaces:**
- Produces: `editor_link(name, text, look: Option<&LookFile>) -> String`; `dark_counterpart` (if not already written); `lib::fonts()` = `data::fonts()`.

- [ ] **Step 1: Failing tests.** Unit: `editor_link("d.fdraw", "a: node", None)` starts with `"https://fastdraw.dev/edit/#fdraw="`, has no `+ / =`, and inflating its base64url data gives exactly `{"name":"d.fdraw","text":"a: node"}`; with a look, `{"name":…,"text":…,"look":{"path":"./t.look","text":"color ink #000"}}`. `dark_counterpart(None, None) == Some("night")`, `(Some("night"), night look) == None`, `(Some("x.look"), look with dark "./n.look") == Some("./n.look")`, `(Some("engraved"), engraved) == None`. Parity: a Rust test writes `target/parity/rust-links.json` (`[{ name, text, look, link }]` for the share fixtures and every diagram in the manifest), and `npm run rust:parity -- --check-links` decodes each link with FastDraw's `decodeShared` and compares the result to the inputs. Wire that check into CI (Task 13).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** (`miniz_oxide::deflate::compress_to_vec(bytes, 6)` raw; base64url written by hand, no padding). **Step 4: Run** — PASS, and `npm run rust:parity -- --check-links` prints `links ok`.
- [ ] **Step 5: Commit** `git commit -m "fastdraw-render: editor links and bundled fonts"`

---

### Task 12: Language coverage fixtures

**Files:** Create `crates/fastdraw-render/tests/coverage/**`; modify `tools/rust-parity.ts` (`--coverage` report and including the folder in cases).

**Interfaces:** none new; fixtures become parity cases automatically.

- [ ] **Step 1: Coverage report.** `rust-parity.ts --coverage` lists (a) every property key `scene.ts`, `render.ts`, `chart.ts` read (found by scanning those sources for `p['…']`, `p.…`, `props.…` and string literal key lists like `CANVAS_KEYS`), (b) every look statement head in `parseLook`, (c) every shape kind and `MARKERS` entry, (d) every `err(`/`warn(` message template in `buildScene` and `parseLook`, and prints those that no case's input or look uses / triggers (messages: matched against the issues in `drawings/`). Run it — expect a long list.
- [ ] **Step 2: Write fixtures** until the report is empty or every remaining entry is listed in `tests/coverage/UNCOVERED.md` with the reason (e.g. unreachable). Required fixtures, besides what the report asks for: `unicode.fdraw` (emoji, CJK, combining marks, RTL in titles, tags, labels, table cells), `bom-crlf.fdraw` (BOM, CRLF) with `bom.look` (BOM, CRLF), `numbers.fdraw` (`1e400`, `NaN`, `-0`, `0x10`, `12px`, empty values), `dark-file/` (diagram → `team.look` with `dark "./team-night.look"`, which has its own `icondir` and `fontdir`; and one whose dark file is missing), `sketch.fdraw` (sketch on, `sketch=0` on one shape), `charts.fdraw` (every series), `errors.fdraw` (every scene error), `look-errors.look` (every look error).
- [ ] **Step 3: Run** `npm run rust:parity && cargo test --test parity` — fix every Rust difference the new cases expose (each fix with a unit test in the module it touches).
- [ ] **Step 4: Commit** `git commit -m "fastdraw-render: fixtures that cover the whole language"`

---

### Task 13: CI, release, version sync, docs

**Files:** Modify `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `tools/syncPluginVersion.ts`, `package.json` (`version` script also `git add crates/fastdraw-render/Cargo.toml Cargo.lock`), `README.md` (a short "Rust" section), `CONTRIBUTING.md` (renderer changes need the Rust change: run `npm run rust:data`, `npm run rust:parity`, `cargo test`); create `crates/fastdraw-render/README.md`, `LICENSE` (copy of root), `licenses/` (Phosphor MIT, each `fonts/OFL-*.txt`).

- [ ] **Step 1: CI job `rust`** (matrix `ubuntu-latest`, `windows-latest`; pinned actions as in the file; `dtolnay/rust-toolchain` is not pinned there today — use `rustup toolchain install stable --profile minimal -c clippy,rustfmt` in a `run` step instead of a new action): checkout, setup-node 22 with npm cache, `npm ci`, `npm run rust:data`, `node --experimental-strip-types tools/rust-cases.ts > crates/fastdraw-render/tests/geometry.json`, `git diff --exit-code crates/fastdraw-render`, `npm run rust:parity`, `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `FASTDRAW_PARITY_REQUIRED=1 cargo test`, `npm run rust:parity -- --check-links`, `cargo package -p fastdraw-render --list` and a size check (`cargo package` then fail if the `.crate` is over 10 MB). Add `.gitattributes` lines `crates/fastdraw-render/data/** -text` and `crates/fastdraw-render/tests/geometry.json -text` so Windows checkouts do not rewrite generated files. Example files are left as they are: both sides read the same checked-out bytes, so line endings cannot cause a mismatch.
- [ ] **Step 2: Version sync.** `syncPluginVersion.ts` also rewrites the first `version = "…"` in `crates/fastdraw-render/Cargo.toml`. Test: `node --experimental-strip-types tools/syncPluginVersion.ts` leaves the file unchanged at 0.2.2; with `package.json` temporarily at 0.2.3 it writes 0.2.3 (revert after).
- [ ] **Step 3: Release.** In `release.yml` after `npm publish`: install Rust, check `Cargo.toml` version = tag, `npm run rust:data && git diff --exit-code`, `npm run rust:parity`, `FASTDRAW_PARITY_REQUIRED=1 cargo test`, `cargo publish -p fastdraw-render` with `CARGO_REGISTRY_TOKEN: ${{ secrets.CARGO_REGISTRY_TOKEN }}`. Add a comment that the secret must be created in the `release` environment before the next tag. Do not run it.
- [ ] **Step 4: Run locally** the CI steps in order on Windows; all pass. Commit `git commit -m "fastdraw-render: CI parity job, release step, version sync, docs"`.

---

### Task 14: Final verification and hand-off

- [ ] **Step 1:** `npm run rust:data && git diff --exit-code`, `npm run rust:parity`, `FASTDRAW_PARITY_REQUIRED=1 cargo test`, `cargo clippy --all-targets -- -D warnings`, `cargo fmt --check`, `npm test`, `npm run typecheck` — all pass; record the case count and timings.
- [ ] **Step 2:** `cargo package -p fastdraw-render` — succeeds, size under 10 MB; `cargo tree -p fastdraw-render` shows only the five dependencies and their own.
- [ ] **Step 3:** Whole-branch review (superpowers:requesting-code-review). Fix findings.
- [ ] **Step 4:** Ask the user before pushing and opening the PR; then push `feat/fastdraw-render`, open the PR, confirm CI is green on both platforms. Write a hand-over note for FastPad's session in the shared notes folder: the commit to pin as a `git` dependency, the public API as built, and the known `localeCompare` difference.
