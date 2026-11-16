//! Parity with the TypeScript renderer (spec §8.1). `npm run rust:parity` (tools/rust-parity.ts) writes the
//! TypeScript's answers to `target/parity/`; each stage below runs the Rust port on the same inputs and compares.
//! Without `target/parity/manifest.json` the stages print a note and pass, unless `FASTDRAW_PARITY_REQUIRED=1`.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

use fastdraw_render::js::{json_string, num_str};
use fastdraw_render::look::{Look, bundled_look, color, default_look, parse_look};
use fastdraw_render::parse::look_path;

/// The repository root.
fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .unwrap()
        .to_path_buf()
}

fn parity_dir() -> PathBuf {
    root().join("target").join("parity")
}

/// One case of `manifest.json`.
#[allow(dead_code)] // fields are compared by later stages
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

#[allow(dead_code)] // used by later stages
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
    let path = parity_dir().join("manifest.json");
    let Ok(text) = std::fs::read_to_string(&path) else {
        if std::env::var("FASTDRAW_PARITY_REQUIRED").is_ok_and(|v| v == "1") {
            panic!(
                "{} is missing: run npm run rust:parity first",
                path.display()
            );
        }
        println!(
            "{} is missing: run npm run rust:parity first",
            path.display()
        );
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
#[allow(dead_code)] // used by later stages
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
/// objects, `icons` as names, `dark` null when absent. `images` are left out (see `looks_match`).
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
        ("guidance".into(), strs(&look.guidance)),
        ("issues".into(), Json::Arr(issues)),
        ("dark".into(), look.dark.as_deref().map_or(Json::Null, s)),
    ])
}

/// The script's look dump without `images`, in the same text form as `look_json`.
fn expected_look_json(want: &json::Json) -> json::Json {
    match want {
        json::Json::Obj(o) => {
            json::Json::Obj(o.iter().filter(|(k, _)| k != "images").cloned().collect())
        }
        other => other.clone(),
    }
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
    let Ok(index) = std::fs::read_to_string(dir.join("index.json")) else {
        println!(
            "{} is missing: run npm run rust:parity first",
            dir.display()
        );
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
            Some(file) => {
                let src = std::fs::read_to_string(root().join(file)).unwrap();
                parse_look(&src, path)
            }
            None if name == "default" => (*default_look()).clone(),
            None => (*bundled_look(name).unwrap()).clone(),
        };
        // `images` are filled from the icon folders by the caller (withIconImages), not by the look parser, so they
        // are never compared here (the images stage compares them).
        failures.check(
            name,
            "look",
            &dump(&expected_look_json(&want)),
            &dump(&look_json(&got)),
        );
        n += 1;
    }
    assert!(n >= 10, "only {n} looks compared");
    failures.report("looks_match");
}

#[test]
fn colors_match() {
    let path = parity_dir().join("colors.json");
    let Ok(text) = std::fs::read_to_string(&path) else {
        println!(
            "{} is missing: run npm run rust:parity first",
            path.display()
        );
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

/// A small JSON reader for the script's output (the crate takes no JSON dependency).
#[allow(dead_code)] // the accessors are for later stages
mod json {
    #[derive(Debug, Clone, PartialEq)]
    pub enum Json {
        Null,
        Bool(bool),
        Num(f64),
        Str(String),
        Arr(Vec<Json>),
        /// keys in the order written
        Obj(Vec<(String, Json)>),
    }

    const NULL: Json = Json::Null;

    impl Json {
        pub fn get(&self, key: &str) -> &Json {
            match self {
                Json::Obj(o) => o.iter().find(|(k, _)| k == key).map_or(&NULL, |(_, v)| v),
                _ => &NULL,
            }
        }
        pub fn as_str(&self) -> Option<&str> {
            match self {
                Json::Str(s) => Some(s),
                _ => None,
            }
        }
        pub fn as_bool(&self) -> bool {
            matches!(self, Json::Bool(true))
        }
        pub fn as_num(&self) -> f64 {
            match self {
                Json::Num(n) => *n,
                _ => f64::NAN,
            }
        }
        pub fn as_arr(&self) -> &[Json] {
            match self {
                Json::Arr(a) => a,
                _ => &[],
            }
        }
    }

    pub fn parse(s: &str) -> Json {
        let mut p = Parser {
            s: s.as_bytes(),
            i: 0,
        };
        let v = p.value();
        p.ws();
        assert_eq!(p.i, p.s.len(), "trailing text in JSON");
        v
    }

    struct Parser<'a> {
        s: &'a [u8],
        i: usize,
    }

    impl Parser<'_> {
        fn ws(&mut self) {
            while self.i < self.s.len() && matches!(self.s[self.i], b' ' | b'\t' | b'\n' | b'\r') {
                self.i += 1;
            }
        }
        fn eat(&mut self, lit: &str) -> bool {
            let ok = self.s[self.i..].starts_with(lit.as_bytes());
            if ok {
                self.i += lit.len();
            }
            ok
        }
        fn value(&mut self) -> Json {
            self.ws();
            let c = self.s[self.i];
            match c {
                b'{' => {
                    self.i += 1;
                    let mut o = Vec::new();
                    self.ws();
                    if !self.eat("}") {
                        loop {
                            self.ws();
                            let k = self.string();
                            self.ws();
                            assert!(self.eat(":"), "expected ':' at {}", self.i);
                            o.push((k, self.value()));
                            self.ws();
                            if self.eat("}") {
                                break;
                            }
                            assert!(self.eat(","), "expected ',' at {}", self.i);
                        }
                    }
                    Json::Obj(o)
                }
                b'[' => {
                    self.i += 1;
                    let mut a = Vec::new();
                    self.ws();
                    if !self.eat("]") {
                        loop {
                            a.push(self.value());
                            self.ws();
                            if self.eat("]") {
                                break;
                            }
                            assert!(self.eat(","), "expected ',' at {}", self.i);
                        }
                    }
                    Json::Arr(a)
                }
                b'"' => Json::Str(self.string()),
                _ if self.eat("null") => Json::Null,
                _ if self.eat("true") => Json::Bool(true),
                _ if self.eat("false") => Json::Bool(false),
                _ => {
                    let start = self.i;
                    while self.i < self.s.len()
                        && matches!(
                            self.s[self.i],
                            b'-' | b'+' | b'.' | b'e' | b'E' | b'0'..=b'9'
                        )
                    {
                        self.i += 1;
                    }
                    let t = std::str::from_utf8(&self.s[start..self.i]).unwrap();
                    Json::Num(
                        t.parse()
                            .unwrap_or_else(|_| panic!("bad JSON number {t:?} at {start}")),
                    )
                }
            }
        }
        fn hex4(&mut self) -> u32 {
            let t = std::str::from_utf8(&self.s[self.i..self.i + 4]).unwrap();
            self.i += 4;
            u32::from_str_radix(t, 16).unwrap()
        }
        fn string(&mut self) -> String {
            assert!(self.eat("\""), "expected a string at {}", self.i);
            let mut out = Vec::new();
            loop {
                let c = self.s[self.i];
                self.i += 1;
                match c {
                    b'"' => break,
                    b'\\' => {
                        let e = self.s[self.i];
                        self.i += 1;
                        let ch = match e {
                            b'n' => '\n',
                            b'r' => '\r',
                            b't' => '\t',
                            b'b' => '\u{8}',
                            b'f' => '\u{c}',
                            b'u' => {
                                let hi = self.hex4();
                                let cp = if (0xD800..0xDC00).contains(&hi)
                                    && self.s[self.i..].starts_with(b"\\u")
                                {
                                    self.i += 2;
                                    let lo = self.hex4();
                                    0x10000 + ((hi - 0xD800) << 10) + (lo - 0xDC00)
                                } else {
                                    hi
                                };
                                // a lone surrogate (JSON.stringify escapes them) has no `char`
                                char::from_u32(cp).unwrap_or('\u{FFFD}')
                            }
                            other => other as char,
                        };
                        let mut buf = [0; 4];
                        out.extend_from_slice(ch.encode_utf8(&mut buf).as_bytes());
                    }
                    _ => out.push(c),
                }
            }
            String::from_utf8(out).unwrap()
        }
    }
}
