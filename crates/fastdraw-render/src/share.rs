//! What the embed (editor/src/embed) decides about a diagram: the look it is drawn in on a dark page.

use crate::LookFile;
use crate::js::json_string;
use crate::look::Look;
use miniz_oxide::deflate::compress_to_vec;

/// The editor's address; the link is `new URL(editor).href` with the data as the hash.
const EDITOR: &str = "https://fastdraw.dev/edit/";

/// The look to draw a diagram in on a dark page (a bundled name, or a path relative to the look file), or None
/// to keep its own: what the look's `dark` line names (parseLook reads it into `dark`). A diagram with no look
/// line is in the built-in look, whose dark version is `night`, also when its look could not be parsed.
/// r#ref: the diagram's `look` line (None for the built-in look). (theme.ts darkCounterpart)
pub fn dark_counterpart(r#ref: Option<&str>, look: Option<&Look>) -> Option<String> {
    // look?.dark ?? (ref ? undefined : 'night'); an empty ref is falsy
    let v = match look.and_then(|l| l.dark.as_deref()) {
        Some(d) => Some(d),
        None if r#ref.is_some_and(|r| !r.is_empty()) => None,
        None => Some("night"),
    };
    // v && v !== ref
    v.filter(|v| !v.is_empty() && Some(*v) != r#ref)
        .map(str::to_string)
}

/// base64url without padding.
fn b64url(bytes: &[u8]) -> String {
    const A: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for c in bytes.chunks(3) {
        let n = (u32::from(c[0]) << 16)
            | (u32::from(*c.get(1).unwrap_or(&0)) << 8)
            | u32::from(*c.get(2).unwrap_or(&0));
        for i in 0..=c.len() {
            out.push(A[(n >> (18 - 6 * i) & 63) as usize] as char);
        }
    }
    out
}

/// The data of a share link: the diagram as JSON, deflate-raw compressed, base64url encoded.
/// (share.ts encodeShared; keys in the order `name`, `text`, `look`)
pub fn encode_shared(name: &str, text: &str, look: Option<&LookFile>) -> String {
    let mut json = format!(
        "{{\"name\":{},\"text\":{}",
        json_string(name),
        json_string(text)
    );
    if let Some(l) = look {
        json.push_str(&format!(
            ",\"look\":{{\"path\":{},\"text\":{}}}",
            json_string(&l.path),
            json_string(&l.text)
        ));
    }
    json.push('}');
    b64url(&compress_to_vec(json.as_bytes(), 6))
}

/// A link that opens the diagram in the online editor. (share.ts editorLink)
pub fn editor_link(name: &str, text: &str, look: Option<&LookFile>) -> String {
    format!("{EDITOR}#fdraw={}", encode_shared(name, text, look))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::look::{bundled_look, default_look, empty_look};

    fn unb64(s: &str) -> Vec<u8> {
        let mut bits = 0u32;
        let mut n = 0;
        let mut out = Vec::new();
        for c in s.bytes() {
            let v = match c {
                b'A'..=b'Z' => c - b'A',
                b'a'..=b'z' => c - b'a' + 26,
                b'0'..=b'9' => c - b'0' + 52,
                b'-' => 62,
                b'_' => 63,
                _ => panic!("not base64url: {c}"),
            };
            bits = bits << 6 | u32::from(v);
            n += 6;
            if n >= 8 {
                n -= 8;
                out.push((bits >> n) as u8);
                bits &= (1 << n) - 1;
            }
        }
        out
    }

    fn unpack(link: &str) -> String {
        let data = link
            .strip_prefix("https://fastdraw.dev/edit/#fdraw=")
            .unwrap();
        assert!(!data.contains(['+', '/', '=']));
        let raw = miniz_oxide::inflate::decompress_to_vec(&unb64(data)).unwrap();
        String::from_utf8(raw).unwrap()
    }

    #[test]
    fn base64url_lengths() {
        assert_eq!(b64url(b""), "");
        assert_eq!(b64url(b"f"), "Zg");
        assert_eq!(b64url(b"fo"), "Zm8");
        assert_eq!(b64url(b"foo"), "Zm9v");
        assert_eq!(b64url(&[0xfb, 0xff]), "-_8");
    }

    #[test]
    fn links() {
        assert_eq!(
            unpack(&editor_link("d.fdraw", "a: node", None)),
            r#"{"name":"d.fdraw","text":"a: node"}"#
        );
        let look = LookFile {
            path: "./t.look".into(),
            text: "color ink #000".into(),
        };
        assert_eq!(
            unpack(&editor_link("d.fdraw", "a: node", Some(&look))),
            r#"{"name":"d.fdraw","text":"a: node","look":{"path":"./t.look","text":"color ink #000"}}"#
        );
        assert_eq!(
            unpack(&editor_link("é\"", "\n😀", None)),
            r#"{"name":"é\"","text":"\n😀"}"#
        );
    }

    #[test]
    fn dark_counterparts_named() {
        let night = bundled_look("night").unwrap();
        assert_eq!(dark_counterpart(Some("night"), Some(&night)), None);
        let engraved = bundled_look("engraved").unwrap();
        assert_eq!(dark_counterpart(Some("engraved"), Some(&engraved)), None);
    }

    #[test]
    fn dark_counterparts() {
        let with_dark = |d: &str| Look {
            dark: Some(d.to_string()),
            ..empty_look()
        };
        // the built-in look's dark version is night, also when the look could not be parsed
        assert_eq!(
            dark_counterpart(None, Some(&default_look())).as_deref(),
            Some("night")
        );
        assert_eq!(dark_counterpart(None, None).as_deref(), Some("night"));
        assert_eq!(dark_counterpart(Some(""), None).as_deref(), Some("night"));
        // a look with no dark line keeps itself
        assert_eq!(
            dark_counterpart(Some("./a.look"), Some(&empty_look())),
            None
        );
        assert_eq!(dark_counterpart(Some("./a.look"), None), None);
        // what the dark line names, unless it is the look itself
        let sketch = bundled_look("sketch").unwrap();
        assert_eq!(
            dark_counterpart(Some("sketch"), Some(&sketch)),
            sketch.dark.clone()
        );
        assert_eq!(
            dark_counterpart(Some("night"), Some(&with_dark("night"))),
            None
        );
        assert_eq!(
            dark_counterpart(Some("./a.look"), Some(&with_dark("./a-night.look"))).as_deref(),
            Some("./a-night.look")
        );
        assert_eq!(dark_counterpart(None, Some(&with_dark(""))), None);
    }
}
