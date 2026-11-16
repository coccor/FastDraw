//! iconfiles.ts: icons a team keeps as SVG files in a folder next to its look (`icondir "./icons"`): colour icons,
//! vendor sets and so on. A file is never parsed or inlined: it is drawn as an image from a data URI, which
//! browsers and the PNG renderer load with scripts and outside requests switched off. That is what makes it safe to
//! show an icon file that came from somewhere else.

use crate::js;
use crate::look::Look;

pub const MAX_ICON_BYTES: usize = 300_000;
pub const MAX_ICON_FILES: usize = 3000;
const PREFIX: &str = "data:image/svg+xml;base64,";

/// `/^data:image\/svg\+xml;base64,[A-Za-z0-9+/]+=*$/` and shorter than `MAX_ICON_BYTES * 1.4`.
pub fn is_icon_uri(v: &str) -> bool {
    if (js::utf16_len(v) as f64) >= MAX_ICON_BYTES as f64 * 1.4 {
        return false;
    }
    let Some(rest) = v.strip_prefix(PREFIX) else {
        return false;
    };
    let body = rest.trim_start_matches(|c: char| c.is_ascii_alphanumeric() || c == '+' || c == '/');
    let padding = body.trim_start_matches('=');
    padding.is_empty() && body.len() < rest.len()
}

/// "10021-icon-service-Virtual-Machine.svg" -> "virtual-machine"; "Load Balancer.svg" -> "load-balancer"
pub fn icon_name(file: &str) -> String {
    // .replace(/\.svg$/i, ''): ASCII case-insensitive
    let stem = match file.len().checked_sub(4).and_then(|at| file.get(at..)) {
        Some(tail) if tail.eq_ignore_ascii_case(".svg") => &file[..file.len() - 4],
        _ => file,
    };
    // .toLowerCase().replace(/[^a-z0-9]+/g, '-')
    let mut dashed = String::with_capacity(stem.len());
    let mut in_run = false;
    for c in stem.to_lowercase().chars() {
        if c.is_ascii_lowercase() || c.is_ascii_digit() {
            dashed.push(c);
            in_run = false;
        } else {
            if !in_run {
                dashed.push('-');
            }
            in_run = true;
        }
    }
    // .replace(/^\d+-icon-service-/, '')
    let digits = dashed.bytes().take_while(u8::is_ascii_digit).count();
    let name = match dashed[digits..].strip_prefix("-icon-service-") {
        Some(rest) if digits > 0 => rest,
        _ => &dashed,
    };
    // .replace(/^-+|-+$/g, '')
    name.trim_matches('-').to_string()
}

/// `/<svg[\s>]/i`
fn has_svg_tag(head: &str) -> bool {
    let b = head.as_bytes();
    (0..b.len()).any(|i| {
        b[i] == b'<'
            && b.get(i + 1..i + 4)
                .is_some_and(|t| t.eq_ignore_ascii_case(b"svg"))
            && head[i + 4..]
                .chars()
                .next()
                .is_some_and(|c| c == '>' || js::is_js_space(c))
    })
}

/// `btoa` of the bytes.
fn base64(bytes: &[u8]) -> String {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let n = chunk
            .iter()
            .enumerate()
            .fold(0u32, |n, (i, &b)| n | (u32::from(b) << (16 - 8 * i)));
        for i in 0..4 {
            if i <= chunk.len() {
                out.push(char::from(ALPHABET[((n >> (18 - 6 * i)) & 63) as usize]));
            } else {
                out.push('=');
            }
        }
    }
    out
}

/// A data URI for an SVG file, or None when it is empty, too big, or not an SVG.
pub fn svg_data_uri(bytes: &[u8]) -> Option<String> {
    if bytes.is_empty() || bytes.len() > MAX_ICON_BYTES {
        return None;
    }
    let head = String::from_utf8_lossy(&bytes[..bytes.len().min(2000)]);
    // TextDecoder drops a byte order mark
    let head = head.strip_prefix('\u{FEFF}').unwrap_or(&head);
    if !has_svg_tag(head) {
        return None;
    }
    Some(format!("{PREFIX}{}", base64(bytes)))
}

/// A copy of the look with icon images added. `files` are SVG files, by file name. A file replaces nothing the
/// look already has an image for; the files are taken in file-name order.
pub fn with_icon_images(look: &Look, files: Vec<(String, Vec<u8>)>) -> Look {
    let mut images = look.images.clone();
    let mut files = files;
    files.sort_by(|a, b| js::locale_cmp(&a.0, &b.0));
    for (file, bytes) in &files {
        let name = icon_name(file);
        let uri = if !name.is_empty() && js::utf16_len(&name) <= 80 {
            svg_data_uri(bytes)
        } else {
            None
        };
        if let Some(uri) = uri
            && images.len() < MAX_ICON_FILES
            && !images.contains_key(&name)
        {
            images.insert(name, uri);
        }
    }
    Look {
        images,
        ..look.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::look::empty_look;

    #[test]
    fn names_from_files() {
        assert_eq!(
            icon_name("10021-icon-service-Virtual-Machine.svg"),
            "virtual-machine"
        );
        assert_eq!(icon_name("Load Balancer.svg"), "load-balancer");
        assert_eq!(icon_name("Load Balancer.SVG"), "load-balancer");
        assert_eq!(icon_name("--a__b--.svg"), "a-b");
        assert_eq!(icon_name("10021-other.svg"), "10021-other");
        assert_eq!(icon_name(".svg"), "");
        assert_eq!(icon_name("é.svg"), "");
        assert_eq!(icon_name("svg"), "svg");
    }

    #[test]
    fn data_uris() {
        assert_eq!(
            svg_data_uri(b"<svg></svg>").as_deref(),
            Some("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=")
        );
        assert_eq!(svg_data_uri(b"<html>"), None);
        assert_eq!(svg_data_uri(b""), None);
        assert_eq!(svg_data_uri(b"<svgx>"), None);
        assert!(svg_data_uri(b"\xEF\xBB\xBF <SVG\n>").is_some());
        let mut big = b"<svg>".to_vec();
        big.resize(MAX_ICON_BYTES, b' ');
        assert!(svg_data_uri(&big).is_some());
        big.push(b' ');
        assert_eq!(svg_data_uri(&big), None);
        // every length of padding
        assert_eq!(base64(b"a"), "YQ==");
        assert_eq!(base64(b"ab"), "YWI=");
        assert_eq!(base64(b"abc"), "YWJj");
    }

    #[test]
    fn uris_are_checked() {
        assert!(is_icon_uri("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="));
        assert!(is_icon_uri("data:image/svg+xml;base64,AA"));
        assert!(!is_icon_uri("data:image/svg+xml;base64,"));
        assert!(!is_icon_uri("data:image/svg+xml;base64,=="));
        assert!(!is_icon_uri("data:image/svg+xml;base64,AA=A"));
        assert!(!is_icon_uri("data:image/png;base64,AA"));
        assert!(!is_icon_uri(&format!("{PREFIX}{}", "A".repeat(420_000))));
    }

    #[test]
    fn images_are_added_in_file_name_order() {
        let svg = |t: &str| format!("<svg>{t}</svg>").into_bytes();
        let mut look = empty_look();
        look.images
            .insert("kept".into(), "data:image/svg+xml;base64,AA".into());
        let out = with_icon_images(
            &look,
            vec![
                ("b.svg".into(), svg("b")),
                ("A-1.svg".into(), svg("a")),
                ("kept.svg".into(), svg("x")),
                ("note.txt".into(), b"text".to_vec()),
                ("a-1.svg".into(), svg("dup")),
                (format!("{}.svg", "n".repeat(81)), svg("long")),
            ],
        );
        let names: Vec<_> = out.images.keys().map(String::as_str).collect();
        assert_eq!(names, ["kept", "a-1", "b"]);
        // "a-1.svg" sorts before "A-1.svg", so its image wins
        assert_eq!(out.images["a-1"], svg_data_uri(&svg("dup")).unwrap());
        assert_eq!(look.images.len(), 1);
    }
}
