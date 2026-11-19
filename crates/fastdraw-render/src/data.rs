//! The crate's data, generated from the TypeScript by `npm run rust:data` (tools/rust-data.ts); never
//! edited by hand. Files in `data/`:
//!
//! Strings are `u32 LE length + UTF-8 bytes`; every list is preceded by its `u32 LE count`.
//! - `looks.txt`: text, records `name\0source\0`; the default look first under the empty name, then the
//!   bundled looks in `BUNDLED_LOOKS` order.
//! - `widths.bin`: `u32 n` + n `u16` (`WIDTH_CHARS` as UTF-16 units); `u32` families; per family: string
//!   name, `u32` weights; per weight (ascending): `u32` weight, `u32 n`, n `i16 LE` widths.
//! - `icons-core.bin.deflate`, `icons-extended.bin.deflate`: raw deflate of: list of names; then for each
//!   weight thin, light, regular, bold, fill: `u32` count + (string name, list of string paths); then the
//!   duotone tint the same way; then the words: `u32` count + (string name, string words).
//! - `fonts.bin.deflate`: raw deflate of `u32` count + (string file name, `u32` length + bytes), in
//!   file-name order, ligature features turned off.
//! - `font-families.txt`: the lowercased family of each bundled font, one per line, in the same order.

use indexmap::IndexMap;
use miniz_oxide::inflate::decompress_to_vec;
use std::sync::OnceLock;

const LOOKS: &str = include_str!("../data/looks.txt");
const WIDTHS: &[u8] = include_bytes!("../data/widths.bin");
const ICONS_CORE: &[u8] = include_bytes!("../data/icons-core.bin.deflate");
const ICONS_EXTENDED: &[u8] = include_bytes!("../data/icons-extended.bin.deflate");
const FONTS: &[u8] = include_bytes!("../data/fonts.bin.deflate");
const FONT_FAMILIES: &str = include_str!("../data/font-families.txt");

/// The text between the first and second NUL of `looks.txt`: the default look.
const fn default_look() -> &'static str {
    let bytes = LOOKS.as_bytes();
    let mut end = 1;
    while end < bytes.len() && bytes[end] != 0 {
        end += 1;
    }
    let (head, _) = bytes.split_at(end);
    let (_, text) = head.split_at(1);
    match std::str::from_utf8(text) {
        Ok(s) => s,
        Err(_) => panic!("looks.txt is not UTF-8"),
    }
}

/// FastDraw's default look.
pub const DEFAULT_LOOK: &str = default_look();

/// The bundled looks, name to source, in `BUNDLED_LOOKS` order.
pub fn bundled_looks() -> &'static IndexMap<&'static str, &'static str> {
    static LOOKS_MAP: OnceLock<IndexMap<&'static str, &'static str>> = OnceLock::new();
    LOOKS_MAP.get_or_init(|| {
        let mut parts = LOOKS.split('\0');
        let mut map = IndexMap::new();
        let mut first = true;
        while let (Some(name), Some(source)) = (parts.next(), parts.next()) {
            if first {
                first = false; // the default look, under the empty name
                continue;
            }
            map.insert(name, source);
        }
        map
    })
}

/// A cursor over a binary data file.
struct Reader<'a>(&'a [u8]);

impl<'a> Reader<'a> {
    fn take(&mut self, n: usize) -> &'a [u8] {
        let (head, rest) = self.0.split_at(n);
        self.0 = rest;
        head
    }
    fn u16(&mut self) -> u16 {
        u16::from_le_bytes(self.take(2).try_into().unwrap())
    }
    fn i16(&mut self) -> i16 {
        i16::from_le_bytes(self.take(2).try_into().unwrap())
    }
    fn u32(&mut self) -> u32 {
        u32::from_le_bytes(self.take(4).try_into().unwrap())
    }
    fn len(&mut self) -> usize {
        self.u32() as usize
    }
    fn bytes(&mut self) -> &'a [u8] {
        let n = self.len();
        self.take(n)
    }
    fn string(&mut self) -> String {
        String::from_utf8(self.bytes().to_vec()).expect("data is UTF-8")
    }
    fn strings(&mut self) -> Vec<String> {
        let n = self.len();
        (0..n).map(|_| self.string()).collect()
    }
}

/// Characters whose widths `font_widths` holds, as UTF-16 code units.
pub fn width_chars() -> &'static [u16] {
    &widths().0
}

/// Family (lowercase) to weights ascending to widths in hundredths of an em (-1: not in the font), one per
/// entry of `width_chars`.
pub fn font_widths() -> &'static IndexMap<String, Vec<(u32, Vec<i16>)>> {
    &widths().1
}

type Widths = (Vec<u16>, IndexMap<String, Vec<(u32, Vec<i16>)>>);

fn widths() -> &'static Widths {
    static WIDTHS_DATA: OnceLock<Widths> = OnceLock::new();
    WIDTHS_DATA.get_or_init(|| {
        let mut r = Reader(WIDTHS);
        let n = r.len();
        let chars = (0..n).map(|_| r.u16()).collect();
        let mut families = IndexMap::new();
        for _ in 0..r.len() {
            let name = r.string();
            let count = r.len();
            let weights = (0..count)
                .map(|_| {
                    let weight = r.u32();
                    let n = r.len();
                    (weight, (0..n).map(|_| r.i16()).collect())
                })
                .collect();
            families.insert(name, weights);
        }
        (chars, families)
    })
}

/// An icon style. The discriminant indexes `IconData::paths`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IconWeight {
    Thin,
    Light,
    Regular,
    Bold,
    Fill,
}

/// Line width of each outline weight (`WEIGHT_WIDTH`; fill has none).
pub fn weight_width() -> [(IconWeight, f64); 4] {
    [
        (IconWeight::Thin, 4.0),
        (IconWeight::Light, 12.0),
        (IconWeight::Regular, 16.0),
        (IconWeight::Bold, 24.0),
    ]
}

/// A set of icons: names in order, paths per weight (indexed by `IconWeight`), the duotone tint, and the
/// search words.
#[derive(Debug)]
pub struct IconData {
    pub names: Vec<String>,
    pub paths: [IndexMap<String, Vec<String>>; 5],
    pub tint: IndexMap<String, Vec<String>>,
    pub words: IndexMap<String, String>,
}

fn list(r: &mut Reader) -> IndexMap<String, Vec<String>> {
    let n = r.len();
    (0..n).map(|_| (r.string(), r.strings())).collect()
}

fn load_icons(deflated: &[u8]) -> IconData {
    let raw = decompress_to_vec(deflated).expect("icon data inflates");
    let mut r = Reader(&raw);
    let names = r.strings();
    let paths = std::array::from_fn(|_| list(&mut r));
    let tint = list(&mut r);
    let n = r.len();
    let words = (0..n).map(|_| (r.string(), r.string())).collect();
    IconData {
        names,
        paths,
        tint,
        words,
    }
}

/// The icons every look starts with.
pub fn core_icons() -> &'static IconData {
    static CORE: OnceLock<IconData> = OnceLock::new();
    CORE.get_or_init(|| load_icons(ICONS_CORE))
}

/// The rest of Phosphor's icons, which the editor and command line load on demand. `names` lists them in
/// order; none is in `core_icons`.
pub fn extended_icons() -> &'static IconData {
    static EXTENDED: OnceLock<IconData> = OnceLock::new();
    EXTENDED.get_or_init(|| load_icons(ICONS_EXTENDED))
}

/// The bundled fonts (ligature features turned off), by file name, in file-name order.
pub fn fonts() -> &'static [(&'static str, Vec<u8>)] {
    static FONT_DATA: OnceLock<Vec<(&'static str, Vec<u8>)>> = OnceLock::new();
    FONT_DATA.get_or_init(|| {
        let raw = decompress_to_vec(FONTS).expect("font data inflates");
        let mut r = Reader(&raw);
        let n = r.len();
        (0..n)
            .map(|_| {
                // File names live as long as the program: the table is built once.
                let name: &'static str = Box::leak(r.string().into_boxed_str());
                (name, r.bytes().to_vec())
            })
            .collect()
    })
}

/// The lowercased family of each bundled font, in file-name order (one entry per file).
pub fn bundled_font_families() -> &'static [String] {
    static FAMILIES: OnceLock<Vec<String>> = OnceLock::new();
    FAMILIES.get_or_init(|| FONT_FAMILIES.lines().map(str::to_owned).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn looks_are_all_there() {
        let names: Vec<_> = bundled_looks().keys().copied().collect();
        assert_eq!(
            names,
            [
                "night",
                "reference",
                "reference-dark",
                "shade",
                "shade-dark",
                "sketch",
                "sketch-dark",
                "whiteboard",
                "whiteboard-dark"
            ]
        );
        assert!(DEFAULT_LOOK.contains("dark night"));
        assert!(DEFAULT_LOOK.starts_with("// FastDraw default look."));
    }

    #[test]
    fn widths_match_typescript() {
        assert_eq!(width_chars().len(), 109);
        let geist = &font_widths()["geist"];
        assert_eq!(geist[0].0, 400);
        assert_eq!(&geist[0].1[..3], &[25, 21, 35]);
        assert_eq!(font_widths()["libre franklin"][0].1[99], -1); // "→", not in the font
        assert!(
            font_widths()
                .values()
                .flatten()
                .all(|(_, w)| w.len() == 109)
        );
    }

    #[test]
    fn icons_load() {
        let regular = IconWeight::Regular as usize;
        assert!(core_icons().paths[regular].contains_key("database"));
        assert!(core_icons().paths[IconWeight::Thin as usize]["active-directory"][0].len() > 100);
        assert_eq!(core_icons().names.len(), 128);
        assert!(extended_icons().names.len() > 1000);
        assert!(
            extended_icons()
                .names
                .iter()
                .all(|n| !core_icons().paths[regular].contains_key(n.as_str()))
        );
        assert!(core_icons().words["database"].starts_with("db store"));
        assert!(extended_icons().words["acorn"].starts_with("savings nut"));
        assert_eq!(weight_width()[3], (IconWeight::Bold, 24.0));
    }

    #[test]
    fn fonts_inflate() {
        let f = fonts();
        assert_eq!(f.len(), 17);
        assert!(f.iter().any(|(n, _)| *n == "Geist-Regular.ttf"));
        assert!(
            f.iter()
                .all(|(_, b)| b.len() > 10_000 && (b[..4] == [0, 1, 0, 0] || &b[..4] == b"OTTO"))
        );
        assert_eq!(bundled_font_families().len(), 17);
        assert!(bundled_font_families().iter().any(|f| f == "sketch hand"));
    }
}
