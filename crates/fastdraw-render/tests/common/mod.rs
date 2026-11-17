//! Shared by the integration tests: the repository root, the parity-file reader and a small JSON reader.
#![allow(dead_code)] // each test binary uses a different part

use std::path::{Path, PathBuf};

/// The repository root.
pub fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .unwrap()
        .to_path_buf()
}

/// The text of a file the parity script writes (`npm run rust:parity`), or None with a note when it is
/// missing. With `FASTDRAW_PARITY_REQUIRED=1` a missing file panics instead, so CI cannot pass by skipping.
pub fn read_parity(path: &Path) -> Option<String> {
    match std::fs::read_to_string(path) {
        Ok(text) => Some(text),
        Err(_) => {
            let msg = format!(
                "{} is missing: run npm run rust:parity first",
                path.display()
            );
            if std::env::var("FASTDRAW_PARITY_REQUIRED").is_ok_and(|v| v == "1") {
                panic!("{msg}");
            }
            println!("{msg}");
            None
        }
    }
}

/// A small JSON reader for the script's output (the crate takes no JSON dependency).
pub mod json {
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
        /// A number; the strings "NaN", "Infinity" and "-Infinity" (which JSON cannot hold) read as those values.
        pub fn as_num(&self) -> f64 {
            match self {
                Json::Num(n) => *n,
                Json::Str(s) if s == "Infinity" => f64::INFINITY,
                Json::Str(s) if s == "-Infinity" => f64::NEG_INFINITY,
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
        /// The `\uXXXX` escape at the cursor when it is a low surrogate (then consumed); otherwise None, and nothing
        /// is consumed.
        fn low_surrogate(&mut self) -> Option<u32> {
            let esc = self.s.get(self.i..self.i + 6)?;
            if !esc.starts_with(b"\\u") {
                return None;
            }
            let lo = u32::from_str_radix(std::str::from_utf8(&esc[2..]).ok()?, 16).ok()?;
            if !(0xDC00..0xE000).contains(&lo) {
                return None;
            }
            self.i += 6;
            Some(lo)
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
                                // a high surrogate pairs only with a low one right after it
                                let lo = if (0xD800..0xDC00).contains(&hi) {
                                    self.low_surrogate()
                                } else {
                                    None
                                };
                                let cp = match lo {
                                    Some(lo) => 0x10000 + ((hi - 0xD800) << 10) + (lo - 0xDC00),
                                    None => hi,
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
