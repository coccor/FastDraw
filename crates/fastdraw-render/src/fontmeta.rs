//! fontmeta.ts: reads the family name, weight and italic flag out of a TTF or OTF file, so the editor can
//! register a look's own fonts and the command line can tell which families it has.

use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FontMeta {
    pub family: String,
    pub weight: u32,
    pub italic: bool,
}

// DataView reads: big-endian, and out of range is a RangeError (None here, which font_meta turns into "not a font").
fn u16_at(b: &[u8], o: usize) -> Option<u16> {
    Some(u16::from_be_bytes([*b.get(o)?, *b.get(o.checked_add(1)?)?]))
}
fn u32_at(b: &[u8], o: usize) -> Option<u32> {
    Some(u32::from_be_bytes(
        b.get(o..o.checked_add(4)?)?.try_into().ok()?,
    ))
}

pub fn font_meta(b: &[u8]) -> Option<FontMeta> {
    let tag = u32_at(b, 0)?;
    if tag != 0x0001_0000 && tag != 0x4f54_544f && tag != 0x7472_7565 {
        return None; // TrueType, 'OTTO', 'true'
    }
    let mut tables: HashMap<[u8; 4], usize> = HashMap::new();
    let n = usize::from(u16_at(b, 4)?);
    if 12 + n * 16 > b.len() {
        return None;
    }
    for i in 0..n {
        let o = 12 + i * 16;
        tables.insert(
            [b[o], b[o + 1], b[o + 2], b[o + 3]],
            u32_at(b, o + 8)? as usize,
        );
    }
    let name = *tables.get(b"name")?;
    // Font files are untrusted: every offset is checked against the file size, names are
    // capped, and a record is only decoded when it is one we still need.
    if name + 6 > b.len() {
        return None;
    }
    let count = usize::from(u16_at(b, name + 2)?);
    let store = name + usize::from(u16_at(b, name + 4)?);
    if name + 6 + count * 12 > b.len() {
        return None;
    }
    let mut found: HashMap<u32, String> = HashMap::new();
    let mut i = 0;
    while i < count && found.len() < 4 {
        let r = name + 6 + i * 12;
        i += 1;
        let platform = u16_at(b, r)?;
        let id = u16_at(b, r + 6)?;
        let len = usize::from(u16_at(b, r + 8)?);
        let off = store + usize::from(u16_at(b, r + 10)?);
        if (id != 1 && id != 16) || (platform != 3 && platform != 0 && platform != 1) {
            continue;
        }
        let key = u32::from(id) * 10 + u32::from(platform == 1); // prefer the Unicode records
        if found.contains_key(&key) || len > 256 || off + len > b.len() {
            continue;
        }
        let s: String = if platform == 1 {
            // String.fromCharCode of each byte: Latin-1
            b[off..off + len].iter().map(|&c| char::from(c)).collect()
        } else {
            // UTF-16BE; a lone surrogate (which a Rust string cannot hold) becomes U+FFFD
            let units =
                (0..len / 2).map(|k| u16::from_be_bytes([b[off + 2 * k], b[off + 2 * k + 1]]));
            char::decode_utf16(units)
                .map(|c| c.unwrap_or(char::REPLACEMENT_CHARACTER))
                .collect()
        };
        if !s.is_empty() {
            found.insert(key, s);
        }
    }
    let family = [160, 161, 10, 11]
        .iter()
        .find_map(|k| found.get(k))?
        .clone();
    let os2 = tables.get(b"OS/2").copied().filter(|&o| o + 64 <= b.len());
    let weight = os2.map_or(Some(400), |o| u16_at(b, o + 4))?;
    let italic = os2.map_or(Some(false), |o| u16_at(b, o + 62).map(|v| v & 1 == 1))?;
    Some(FontMeta {
        family,
        weight: if (1..=1000).contains(&weight) {
            u32::from(weight)
        } else {
            400
        },
        italic,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn examples() -> std::path::PathBuf {
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../examples")
    }

    #[test]
    fn reads_a_look_font() {
        let b = std::fs::read(examples().join("look-test/fonts/FiraSans-SemiBold.ttf")).unwrap();
        assert_eq!(
            font_meta(&b),
            Some(FontMeta {
                family: "Fira Sans".into(),
                weight: 600,
                italic: false
            })
        );
    }

    #[test]
    fn reads_the_bundled_fonts() {
        // every bundled font's family is the one the data script recorded for it
        let families = crate::data::bundled_font_families();
        for ((name, bytes), fam) in crate::data::fonts().iter().zip(families) {
            assert_eq!(
                &font_meta(bytes).unwrap().family.to_lowercase(),
                fam,
                "{name}"
            );
        }
    }

    #[test]
    fn refuses_what_is_not_a_font() {
        assert_eq!(font_meta(b""), None);
        assert_eq!(font_meta(b"OTTO"), None);
        assert_eq!(font_meta(b"\x00\x01\x00\x00\x00\x05"), None);
        // a table directory naming a 'name' table past the end of the file
        let mut b =
            b"\x00\x01\x00\x00\x00\x01\x00\x00\x00\x00\x00\x00name\x00\x00\x00\x00\x00\x00\xff\xff"
                .to_vec();
        b.extend([0; 4]);
        assert_eq!(font_meta(&b), None);
    }
}
