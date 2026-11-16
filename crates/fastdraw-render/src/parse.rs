//! parse.ts: the tokenizer shared by diagram files and look files, and scene.ts's `lookPath` and `withLook`
//! (they only need the tokenizer).

use crate::js::{is_js_space, js_trim, json_string};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TokKind {
    Str,
    Word,
    Prop,
}

/// q: a property whose value was written in quotes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Tok {
    pub t: TokKind,
    pub v: String,
    pub k: Option<String>,
    pub q: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Stmt {
    pub line: u32,
    pub end: u32,
    pub toks: Vec<Tok>,
}

// Comments: a line starting with "# " (or a bare "#"), or anything after "//".
pub fn strip_comment(s: &str) -> &str {
    let b = s.as_bytes();
    let mut in_q = false;
    let mut i = 0;
    while i < b.len() {
        let c = b[i];
        if c == b'\\' && in_q {
            // skips the escaped unit; a multi-byte character after it is never '"' or '/'
            i += 2;
            continue;
        }
        if c == b'"' {
            in_q = !in_q;
        } else if !in_q && c == b'/' && b.get(i + 1) == Some(&b'/') {
            return &s[..i];
        }
        i += 1;
    }
    s
}

// `^([A-Za-z][\w./#-]*)=([\s\S]*)$`: the key's length, when `buf` is a property.
fn prop_key_len(buf: &str) -> Option<usize> {
    let b = buf.as_bytes();
    if !b.first()?.is_ascii_alphabetic() {
        return None;
    }
    let n = b.iter().position(|&c| {
        !(c.is_ascii_alphanumeric() || matches!(c, b'_' | b'.' | b'/' | b'#' | b'-'))
    })?;
    (b[n] == b'=').then_some(n)
}

fn tokenize(s: &str) -> Vec<Tok> {
    let mut out = Vec::new();
    let mut it = s.char_indices().peekable();
    loop {
        while it.next_if(|&(_, c)| is_js_space(c)).is_some() {}
        let Some(&(start, first)) = it.peek() else {
            break;
        };
        let starts_quoted = first == '"';
        let mut buf = String::new();
        let mut in_q = false;
        while let Some((_, c)) = it.next_if(|&(_, c)| in_q || !is_js_space(c)) {
            if c == '"' {
                in_q = !in_q;
            } else if c == '\\' && in_q && it.peek().is_some() {
                let (_, e) = it.next().unwrap();
                buf.push(if e == 'n' { '\n' } else { e });
            } else {
                buf.push(c);
            }
        }
        if starts_quoted {
            out.push(Tok {
                t: TokKind::Str,
                v: buf,
                k: None,
                q: false,
            });
            continue;
        }
        // "/" and "#" so a legend key can carry a tint or a hex colour: swatch.muted/0.2=  swatch.#4a7c59=
        match prop_key_len(&buf) {
            Some(n) => {
                // q: the value was written in quotes, so an edit can write it back the same way
                let q = s.as_bytes().get(start + n + 1) == Some(&b'"');
                out.push(Tok {
                    t: TokKind::Prop,
                    k: Some(buf[..n].to_string()),
                    v: buf[n + 1..].to_string(),
                    q,
                });
            }
            None => out.push(Tok {
                t: TokKind::Word,
                v: buf,
                k: None,
                q: false,
            }),
        }
    }
    out
}

/// `src.split(/\r?\n/)`.
pub(crate) fn split_lines(src: &str) -> Vec<&str> {
    src.split('\n')
        .map(|l| l.strip_suffix('\r').unwrap_or(l))
        .collect()
}

// A statement is one line plus any following indented lines.
pub fn parse_statements(src: &str) -> Vec<Stmt> {
    let mut stmts: Vec<Stmt> = Vec::new();
    for (idx, raw) in split_lines(src).into_iter().enumerate() {
        let trimmed = js_trim(raw);
        if trimmed.is_empty() || trimmed == "#" || trimmed.starts_with("# ") {
            continue;
        }
        let text = strip_comment(raw);
        if js_trim(text).is_empty() {
            continue;
        }
        let toks = tokenize(text);
        let line = idx as u32 + 1;
        match stmts.last_mut() {
            Some(last) if raw.starts_with(is_js_space) => {
                last.toks.extend(toks);
                last.end = line;
            }
            _ => stmts.push(Stmt {
                line,
                end: line,
                toks,
            }),
        }
    }
    stmts
}

fn is_look_stmt(s: &Stmt) -> bool {
    s.toks
        .first()
        .is_some_and(|t| t.t == TokKind::Word && t.v == "look")
}

// The path in the diagram's `look "..."` statement, if it has one.
pub fn look_path(src: &str) -> Option<String> {
    let st = parse_statements(src).into_iter().find(is_look_stmt)?;
    st.toks.into_iter().nth(1).map(|t| t.v)
}

// `^[a-z][a-z0-9-]*$`
fn is_bare_name(s: &str) -> bool {
    let b = s.as_bytes();
    b.first().is_some_and(u8::is_ascii_lowercase)
        && b.iter()
            .all(|&c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
}

// The diagram drawn with another look: its look statement now names `look` (a bundled name, or a
// path to a .look file relative to the diagram). The statement is rewritten where it stands, or added
// at the end when the diagram has none, so every other line keeps its number.
pub fn with_look(src: &str, look: &str) -> String {
    let line = format!(
        "look {}",
        if is_bare_name(look) {
            look.to_string()
        } else {
            json_string(look)
        }
    );
    let mut lines: Vec<&str> = split_lines(src);
    let sts: Vec<Stmt> = parse_statements(src)
        .into_iter()
        .filter(is_look_stmt)
        .collect();
    if sts.is_empty() {
        // src.replace(/\s*$/, '')
        return format!("{}\n{}\n", src.trim_end_matches(is_js_space), line);
    }
    for (i, s) in sts.iter().enumerate() {
        for l in s.line..=s.end {
            lines[l as usize - 1] = if l == s.line && i == 0 { &line } else { "" };
        }
    }
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokens() {
        let s = parse_statements(
            "a: node \"Hi \\\"there\\\"\" at 10,20 fill=accent/0.2 label=\"x y\" // note\n  sub=\"two\"\n# c\nb: node",
        );
        assert_eq!(s.len(), 2);
        assert_eq!((s[0].line, s[0].end), (1, 2));
        assert_eq!(s[0].toks[2].v, "Hi \"there\"");
        assert_eq!(s[0].toks[2].t, TokKind::Str);
        assert_eq!(s[0].toks[5].k.as_deref(), Some("fill"));
        assert!(!s[0].toks[5].q);
        assert!(s[0].toks[6].q);
        assert_eq!(s[0].toks.last().unwrap().k.as_deref(), Some("sub"));
        assert_eq!((s[1].line, s[1].end), (4, 4));
    }

    #[test]
    fn bom_and_crlf() {
        let s = parse_statements("\u{FEFF}a: node\r\nb: node\r\n");
        assert_eq!(s.len(), 2);
        assert_eq!(s[0].toks[0].v, "a:");
    }

    fn word(v: &str) -> Tok {
        Tok {
            t: TokKind::Word,
            v: v.into(),
            k: None,
            q: false,
        }
    }
    fn string(v: &str) -> Tok {
        Tok {
            t: TokKind::Str,
            v: v.into(),
            k: None,
            q: false,
        }
    }
    fn prop(k: &str, v: &str, q: bool) -> Tok {
        Tok {
            t: TokKind::Prop,
            v: v.into(),
            k: Some(k.into()),
            q,
        }
    }

    // Expected values printed by Node from src/parse.ts.
    #[test]
    fn quotes_escapes_and_continuations() {
        let s = parse_statements("x a=\"b\"c=d k= \"q\\\\ \\n\" //c\n\t  y 1 #z\n\u{a0}z\n\"a\\");
        assert_eq!(s.len(), 2);
        assert_eq!((s[0].line, s[0].end), (1, 3));
        assert_eq!(
            s[0].toks,
            vec![
                word("x"),
                prop("a", "bc=d", true),
                prop("k", "", false),
                string("q\\ \n"),
                word("y"),
                word("1"),
                word("#z"),
                word("z"),
            ]
        );
        assert_eq!(s[1].toks, vec![string("a\\")]);
    }

    #[test]
    fn comment_lines() {
        let s = parse_statements("  lead\nx\n#\n# k\n#k\n  // only\n  w");
        let got: Vec<_> = s.iter().map(|s| (s.line, s.end, s.toks.len())).collect();
        assert_eq!(got, vec![(1, 1, 1), (2, 2, 1), (5, 7, 2)]);
        assert_eq!(strip_comment("a \"//x\" // y"), "a \"//x\" ");
        assert_eq!(strip_comment("a \"\\\"//\" b"), "a \"\\\"//\" b");
    }

    #[test]
    fn look_lines() {
        assert_eq!(
            look_path("look \"./x.look\"\na: node").as_deref(),
            Some("./x.look")
        );
        assert_eq!(look_path("look\nlook x"), None);
        assert_eq!(
            look_path("\"look\" x\nlook=1\nlook y").as_deref(),
            Some("y")
        );
        assert_eq!(with_look("a: node\n", "night"), "a: node\nlook night\n");
        assert_eq!(
            with_look("look a\nb: node\nlook c\n", "./t.look"),
            "look \"./t.look\"\nb: node\n\n"
        );
        assert_eq!(
            with_look("a\r\nlook \"x y\"\r\n  more\r\nlook b", "Bad Name"),
            "a\nlook \"Bad Name\"\n\n"
        );
        assert_eq!(with_look("a  \n\n \t", "night"), "a\nlook night\n");
    }
}
