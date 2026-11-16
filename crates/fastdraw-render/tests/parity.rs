//! Parity with the TypeScript renderer (spec §8.1). `npm run rust:parity` (tools/rust-parity.ts) writes the
//! TypeScript's answers to `target/parity/`; each stage below runs the Rust port on the same inputs and compares.
//! Without `target/parity/manifest.json` the stages print a note and pass, unless `FASTDRAW_PARITY_REQUIRED=1`.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

use fastdraw_render::disk::with_icons;
use fastdraw_render::js::{json_string, num_str};
use fastdraw_render::look::{Look, bundled_look, color, default_look, parse_look};
use fastdraw_render::parse::look_path;
use fastdraw_render::scene::Scene;
use fastdraw_render::{Drawing, Level, LookFile, Source, drawn_scene, editor_link, render};

mod common;
use common::{json, read_parity, root};

fn parity_dir() -> PathBuf {
    root().join("target").join("parity")
}

/// One case of `manifest.json`.
#[derive(Debug, Clone)]
struct Case {
    id: String,
    /// repo-relative, '/' separators
    file: String,
    /// the text passed to render
    input: String,
    dark: bool,
    no_file: bool,
    /// lookPath(input) in the TypeScript
    look_path: Option<String>,
}

impl Case {
    /// The diagram's absolute path.
    fn abs(&self) -> PathBuf {
        root().join(&self.file)
    }
    /// The file name of this case under `scenes/` and `drawings/`.
    fn key(&self) -> String {
        case_key(&self.id)
    }
}

/// A case id as a file name: every '/' becomes '~' (as `caseKey` in the script).
fn case_key(id: &str) -> String {
    id.replace('/', "~")
}

/// The cases of `target/parity/manifest.json`, or none (with a note) when the script has not been run.
fn cases() -> Vec<Case> {
    let Some(text) = read_parity(&parity_dir().join("manifest.json")) else {
        return Vec::new();
    };
    let opt = |v: &json::Json| v.as_str().map(str::to_string);
    json::parse(&text)
        .as_arr()
        .iter()
        .map(|c| Case {
            id: c.get("id").as_str().unwrap().to_string(),
            file: c.get("file").as_str().unwrap().to_string(),
            input: c.get("input").as_str().unwrap().to_string(),
            dark: c.get("dark").as_bool(),
            no_file: c.get("noFile").as_bool(),
            look_path: opt(c.get("lookPath")),
        })
        .collect()
}

/// Paths in messages, repo-relative: the absolute root becomes `<root>` and every '\' a '/'.
fn normalise(s: &str) -> String {
    let root = root().to_string_lossy().replace('\\', "/");
    s.replace('\\', "/").replace(&root, "<root>")
}

/// Where `want` and `got` first differ, with 80 characters of context on each side, or None when equal.
fn difference(id: &str, what: &str, want: &str, got: &str) -> Option<String> {
    if want == got {
        return None;
    }
    let (w, g): (Vec<char>, Vec<char>) = (want.chars().collect(), got.chars().collect());
    let at = w.iter().zip(&g).take_while(|(a, b)| a == b).count();
    let around = |s: &[char]| -> String {
        let from = at.saturating_sub(80);
        let to = (at + 80).min(s.len());
        format!(
            "{}⟦{}",
            s[from..at].iter().collect::<String>(),
            s[at..to].iter().collect::<String>()
        )
    };
    Some(format!(
        "{id}: {what} differs at character {at} (lengths {} and {})\n  want: {:?}\n  got:  {:?}",
        w.len(),
        g.len(),
        around(&w),
        around(&g)
    ))
}

/// Panics, naming the case, when `want` and `got` differ.
#[allow(dead_code)] // for single comparisons in later stages
fn expect_eq(id: &str, what: &str, want: &str, got: &str) {
    if let Some(d) = difference(id, what, want, got) {
        panic!("{d}");
    }
}

/// The failures of one stage: all are counted, the first 10 shown.
#[derive(Default)]
struct Failures(Vec<String>);

impl Failures {
    fn check(&mut self, id: &str, what: &str, want: &str, got: &str) {
        if let Some(d) = difference(id, what, want, got) {
            self.0.push(d);
        }
    }
    fn report(self, stage: &str) {
        if !self.0.is_empty() {
            let first: Vec<&str> = self.0.iter().take(10).map(String::as_str).collect();
            panic!(
                "{stage}: {} failures; the first {}:\n{}",
                self.0.len(),
                first.len(),
                first.join("\n")
            );
        }
    }
}

#[test]
fn parse_matches() {
    let mut failures = Failures::default();
    let mut seen = BTreeSet::new();
    for c in cases() {
        if !seen.insert(c.input.clone()) {
            continue;
        }
        failures.check(
            &c.id,
            "lookPath",
            &format!("{:?}", c.look_path),
            &format!("{:?}", look_path(&c.input)),
        );
    }
    failures.report("parse_matches");
}

/// A look as the script writes it (`lookOut`): every field in the Look's key order, Maps as arrays of pairs, styles as
/// objects, `icons` and `images` as names, `dark` null when absent.
fn look_json(look: &Look) -> json::Json {
    use json::Json;
    let s = |v: &str| Json::Str(v.to_string());
    let strs = |v: &[String]| Json::Arr(v.iter().map(|x| s(x)).collect());
    let pairs = |m: &indexmap::IndexMap<String, String>| {
        Json::Arr(m.iter().map(|(k, v)| Json::Arr(vec![s(k), s(v)])).collect())
    };
    let obj = |m: &indexmap::IndexMap<String, String>| {
        Json::Obj(m.iter().map(|(k, v)| (k.clone(), s(v))).collect())
    };
    let styles = look
        .styles
        .values()
        .map(|st| {
            Json::Obj(vec![
                ("name".into(), s(&st.name)),
                ("kind".into(), s(st.kind.as_str())),
                ("props".into(), obj(&st.props)),
            ])
        })
        .collect();
    let issues = look
        .issues
        .iter()
        .map(|i| {
            let mut o = vec![
                ("line".to_string(), Json::Num(f64::from(i.line))),
                ("level".into(), s(i.level.as_str())),
                ("msg".into(), s(&i.msg)),
            ];
            if let Some(f) = &i.file {
                o.push(("file".into(), s(f)));
            }
            Json::Obj(o)
        })
        .collect();
    Json::Obj(vec![
        ("colors".into(), pairs(&look.colors)),
        ("fonts".into(), pairs(&look.fonts)),
        ("fontDirs".into(), strs(&look.font_dirs)),
        ("canvas".into(), obj(&look.canvas)),
        ("styles".into(), Json::Arr(styles)),
        (
            "icons".into(),
            Json::Arr(look.icons.keys().map(s).collect()),
        ),
        ("iconDirs".into(), strs(&look.icon_dirs)),
        (
            "images".into(),
            Json::Arr(look.images.keys().map(|k| s(k)).collect()),
        ),
        ("guidance".into(), strs(&look.guidance)),
        ("issues".into(), Json::Arr(issues)),
        ("dark".into(), look.dark.as_deref().map_or(Json::Null, s)),
    ])
}

/// `dump`: JSON text with keys in order and numbers as `num_str`.
fn dump(v: &json::Json) -> String {
    use json::Json;
    match v {
        Json::Null => "null".into(),
        Json::Bool(b) => b.to_string(),
        Json::Num(n) => num_str(*n),
        Json::Str(s) => json_string(s),
        Json::Arr(a) => format!("[{}]", a.iter().map(dump).collect::<Vec<_>>().join(",")),
        Json::Obj(o) => format!(
            "{{{}}}",
            o.iter()
                .map(|(k, v)| format!("{}:{}", json_string(k), dump(v)))
                .collect::<Vec<_>>()
                .join(",")
        ),
    }
}

#[test]
fn looks_match() {
    let dir = parity_dir().join("looks");
    let Some(index) = read_parity(&dir.join("index.json")) else {
        return;
    };
    let index = json::parse(&index);
    let mut failures = Failures::default();
    let mut n = 0;
    for e in index.as_arr() {
        let name = e.get("name").as_str().unwrap();
        let path = e.get("path").as_str().unwrap();
        let want = json::parse(&std::fs::read_to_string(dir.join(format!("{name}.json"))).unwrap());
        let got = match e.get("file").as_str() {
            // loadLook: read as Node reads UTF-8 (bad bytes as U+FFFD), parsed, then the icon folders read
            Some(file) => {
                let src = String::from_utf8_lossy(&std::fs::read(root().join(file)).unwrap())
                    .into_owned();
                with_icons(Path::new(path), parse_look(&src, path))
            }
            None if name == "default" => (*default_look()).clone(),
            None => (*bundled_look(name).unwrap()).clone(),
        };
        failures.check(name, "look", &dump(&want), &dump(&look_json(&got)));
        n += 1;
    }
    assert!(n >= 10, "only {n} looks compared");
    failures.report("looks_match");
}

#[test]
fn colors_match() {
    let path = parity_dir().join("colors.json");
    let Some(text) = read_parity(&path) else {
        return;
    };
    let mut failures = Failures::default();
    let mut n = 0;
    for e in json::parse(&text).as_arr() {
        let name = e.get("look").as_str().unwrap();
        let look = match name {
            "default" => default_look(),
            _ => bundled_look(name).unwrap(),
        };
        let opt = |k: &str| e.get(k).as_str().map(str::to_string);
        let (v, over) = (opt("v"), opt("over"));
        let id = format!("{name} color({v:?}, {over:?})");
        failures.check(
            &id,
            "color",
            e.get("out").as_str().unwrap(),
            &color(&look, v.as_deref(), over.as_deref()),
        );
        n += 1;
    }
    assert!(n >= 400, "only {n} colours compared");
    failures.report("colors_match");
}

/// A number as `JSON.stringify` writes it: NaN and the infinities become null.
fn num_json(n: f64) -> json::Json {
    if n.is_finite() {
        json::Json::Num(n)
    } else {
        json::Json::Null
    }
}

/// A scene as the script writes it (`sceneOut`).
fn scene_json(sc: &Scene) -> json::Json {
    use json::Json;
    let s = |v: &str| Json::Str(v.to_string());
    let bx = |x: f64, y: f64, w: f64, h: f64| {
        vec![
            ("x".to_string(), num_json(x)),
            ("y".into(), num_json(y)),
            ("w".into(), num_json(w)),
            ("h".into(), num_json(h)),
        ]
    };
    let issues = sc
        .issues
        .iter()
        .map(|i| {
            Json::Obj(vec![
                ("line".to_string(), Json::Num(f64::from(i.line))),
                ("level".into(), s(i.level.as_str())),
                ("msg".into(), s(&i.msg)),
            ])
        })
        .collect();
    let shapes = sc
        .shapes
        .iter()
        .map(|sh| {
            let mut o = vec![
                ("id".to_string(), s(&sh.id)),
                ("shape".into(), s(&sh.shape)),
            ];
            o.extend(bx(sh.x, sh.y, sh.w, sh.h));
            Json::Obj(o)
        })
        .collect();
    let texts = sc
        .texts
        .iter()
        .map(|t| {
            let mut o = vec![("id".to_string(), s(&t.id))];
            o.extend(bx(t.x, t.y, t.w, t.h));
            Json::Obj(o)
        })
        .collect();
    let conns = sc
        .conns
        .iter()
        .map(|c| {
            let pts = c
                .pts
                .iter()
                .map(|p| {
                    Json::Obj(vec![
                        ("x".to_string(), num_json(p.x)),
                        ("y".into(), num_json(p.y)),
                    ])
                })
                .collect();
            let label = c
                .label
                .as_ref()
                .map_or(Json::Null, |l| Json::Obj(bx(l.x, l.y, l.w, l.h)));
            Json::Obj(vec![
                ("pts".to_string(), Json::Arr(pts)),
                ("label".into(), label),
            ])
        })
        .collect();
    let mut o = bx(sc.x, sc.y, sc.w, sc.h);
    o.extend([
        ("issues".to_string(), Json::Arr(issues)),
        ("shapes".into(), Json::Arr(shapes)),
        ("texts".into(), Json::Arr(texts)),
        ("conns".into(), Json::Arr(conns)),
    ]);
    Json::Obj(o)
}

/// Every case: the scene `render` draws against the script's `scenes/<key>.json`.
#[test]
fn scenes_match() {
    let mut failures = Failures::default();
    let mut n = 0;
    for c in cases() {
        let want = std::fs::read_to_string(
            parity_dir()
                .join("scenes")
                .join(format!("{}.json", c.key())),
        )
        .unwrap();
        let abs = c.abs();
        let sc = drawn_scene(&Source {
            text: &c.input,
            file: (!c.no_file).then_some(abs.as_path()),
            dark: c.dark,
        });
        failures.check(
            &c.id,
            "scene",
            &normalise(&dump(&json::parse(&want))),
            &normalise(&dump(&scene_json(&sc))),
        );
        n += 1;
    }
    println!("{n} scenes compared");
    if n > 0 {
        assert!(n >= 1500, "only {n} scenes compared");
    }
    failures.report("scenes_match");
}

/// `[r, g, b]` of a paper colour written `#rrggbb` or `#rgb` (as `render` reads it, spec §4.1).
fn paper_rgb(c: &str) -> [u8; 3] {
    let h = c.strip_prefix('#').unwrap_or("");
    // every paper the TypeScript gives is one of the two forms render reads, so white is never a fallback here
    assert!(
        (h.len() == 6 || h.len() == 3) && h.bytes().all(|b| b.is_ascii_hexdigit()),
        "the TypeScript's paper {c:?} is not #rrggbb or #rgb"
    );
    let hex = |s: &str| u8::from_str_radix(s, 16).unwrap();
    match h.len() {
        6 => [hex(&h[0..2]), hex(&h[2..4]), hex(&h[4..6])],
        _ => [0, 1, 2].map(|i| hex(&h[i..=i]) * 17),
    }
}

/// A drawing as the script writes it, with the paper as `[r, g, b]` and every path repo-relative.
fn drawing_json(d: &Drawing) -> json::Json {
    use json::Json;
    let s = |v: &str| Json::Str(v.to_string());
    let issues = d
        .issues
        .iter()
        .map(|i| {
            let level = match i.level {
                Level::Error => "error",
                Level::Warning => "warn",
            };
            Json::Obj(vec![
                ("line".to_string(), Json::Num(f64::from(i.line))),
                ("level".into(), s(level)),
                ("msg".into(), s(&i.message)),
            ])
        })
        .collect();
    let font_files = d
        .font_files
        .iter()
        .map(|f| s(&normalise(&f.to_string_lossy()).replacen("<root>/", "", 1)))
        .collect();
    let look = d.look.as_ref().map_or(Json::Null, |l| {
        Json::Obj(vec![
            ("path".to_string(), s(&l.path)),
            ("text".into(), s(&l.text)),
        ])
    });
    Json::Obj(vec![
        ("issues".to_string(), Json::Arr(issues)),
        (
            "paper".into(),
            Json::Arr(d.paper.iter().map(|&c| Json::Num(f64::from(c))).collect()),
        ),
        (
            "bounds".into(),
            Json::Arr(d.bounds.iter().map(|&b| num_json(b)).collect()),
        ),
        ("fontFiles".into(), Json::Arr(font_files)),
        ("look".into(), look),
    ])
}

/// The script's drawing in `drawing_json`'s form (the SVG is compared on its own).
fn expected_drawing_json(want: &json::Json) -> json::Json {
    use json::Json;
    let paper = paper_rgb(want.get("paper").as_str().unwrap());
    Json::Obj(vec![
        ("issues".to_string(), want.get("issues").clone()),
        (
            "paper".into(),
            Json::Arr(paper.iter().map(|&c| Json::Num(f64::from(c))).collect()),
        ),
        ("bounds".into(), want.get("bounds").clone()),
        ("fontFiles".into(), want.get("fontFiles").clone()),
        ("look".into(), want.get("look").clone()),
    ])
}

/// Every case: `render` against the script's `drawings/<key>.json`, all fields.
#[test]
fn drawings_match() {
    let mut failures = Failures::default();
    let mut n = 0;
    for c in cases() {
        let want = std::fs::read_to_string(
            parity_dir()
                .join("drawings")
                .join(format!("{}.json", c.key())),
        )
        .unwrap();
        let want = json::parse(&want);
        let abs = c.abs();
        let got = render(&Source {
            text: &c.input,
            file: (!c.no_file).then_some(abs.as_path()),
            dark: c.dark,
        });
        failures.check(&c.id, "svg", want.get("svg").as_str().unwrap(), &got.svg);
        failures.check(
            &c.id,
            "drawing",
            &normalise(&dump(&expected_drawing_json(&want))),
            &normalise(&dump(&drawing_json(&got))),
        );
        n += 1;
    }
    println!("{n} drawings compared");
    if n > 0 {
        assert!(n >= 1500, "only {n} drawings compared");
    }
    failures.report("drawings_match");
}

#[test]
fn differences_are_located() {
    assert_eq!(difference("c", "svg", "abc", "abc"), None);
    let d = difference("c", "svg", "abXd", "abYd").unwrap();
    assert!(
        d.starts_with("c: svg differs at character 2 (lengths 4 and 4)"),
        "{d}"
    );
    assert!(d.contains("\"ab⟦Xd\"") && d.contains("\"ab⟦Yd\""), "{d}");
    let long = "x".repeat(200);
    let d = difference("c", "svg", &long, &format!("{long}!")).unwrap();
    assert!(d.contains(&format!("\"{}⟦\"", "x".repeat(80))), "{d}");
}

#[test]
fn json_reads_what_json_stringify_writes() {
    let v = json::parse(r#"[{"a":"q\"\\\n\u0001😀é","b":-1.5e2,"c":true,"d":null,"e":[]}]"#);
    let o = &v.as_arr()[0];
    assert_eq!(o.get("a").as_str(), Some("q\"\\\n\u{1}😀é"));
    assert_eq!(o.get("b").as_num(), -150.0);
    assert!(o.get("c").as_bool());
    assert_eq!(o.get("d").as_str(), None);
    assert!(o.get("e").as_arr().is_empty());
}

/// Writes `target/parity/rust-links.json`: the share link this crate makes for each share fixture and for every
/// distinct diagram input of the manifest, for `npm run rust:parity -- --check-links` to decode with `decodeShared`.
#[test]
fn writes_editor_links() {
    let Some(share) = read_parity(&parity_dir().join("share.json")) else {
        return;
    };
    let mut items: Vec<(String, String, Option<LookFile>)> = Vec::new();
    let look_of = |v: &json::Json| match v {
        json::Json::Obj(_) => Some(LookFile {
            path: v.get("path").as_str().unwrap_or_default().to_string(),
            text: v.get("text").as_str().unwrap_or_default().to_string(),
        }),
        _ => None,
    };
    for f in json::parse(&share).as_arr() {
        items.push((
            f.get("name").as_str().unwrap_or_default().to_string(),
            f.get("text").as_str().unwrap_or_default().to_string(),
            look_of(f.get("look")),
        ));
    }
    for c in cases() {
        let name = c.file.rsplit('/').next().unwrap_or_default().to_string();
        let look = if c.no_file {
            None
        } else {
            let (text, _) = fastdraw_render::disk::read_look(&c.abs(), c.look_path.as_deref());
            text.map(|text| LookFile {
                path: c.look_path.clone().unwrap_or_default(),
                text,
            })
        };
        if !items
            .iter()
            .any(|i| i.0 == name && i.1 == c.input && i.2 == look)
        {
            items.push((name, c.input.clone(), look));
        }
    }
    let rows: Vec<String> = items
        .iter()
        .map(|(name, text, look)| {
            let look_json = look.as_ref().map_or("null".to_string(), |l| {
                format!(
                    "{{\"path\":{},\"text\":{}}}",
                    json_string(&l.path),
                    json_string(&l.text)
                )
            });
            format!(
                "{{\"name\":{},\"text\":{},\"look\":{look_json},\"link\":{}}}",
                json_string(name),
                json_string(text),
                json_string(&editor_link(name, text, look.as_ref()))
            )
        })
        .collect();
    std::fs::write(
        parity_dir().join("rust-links.json"),
        format!("[{}]", rows.join(",")),
    )
    .unwrap();
}
