//! JavaScript semantics the renderer depends on: number formatting, rounding, parsing, maths and
//! UTF-16 string behaviour, reproduced so the output matches Node's character for character.

use std::cmp::Ordering;

/// `String(n)`.
pub fn num_str(n: f64) -> String {
    if n.is_nan() {
        "NaN".to_string()
    } else if n == f64::INFINITY {
        "Infinity".to_string()
    } else if n == f64::NEG_INFINITY {
        "-Infinity".to_string()
    } else if n == 0.0 {
        "0".to_string()
    } else {
        ryu_js::Buffer::new().format_finite(n).to_string()
    }
}

/// `Math.round`: halves go toward +Infinity, and results of -0 are kept.
pub fn round(x: f64) -> f64 {
    if !x.is_finite() || x == 0.0 {
        return x;
    }
    let f = x.floor();
    let r = if x - f >= 0.5 { f + 1.0 } else { f };
    if r == 0.0 && x < 0.0 { -0.0 } else { r }
}

/// Whether JavaScript counts `c` as white space or a line terminator (what `trim` and `\s` match).
pub fn is_js_space(c: char) -> bool {
    matches!(
        c,
        '\t' | '\n' | '\u{B}' | '\u{C}' | '\r' | ' ' | '\u{A0}' | '\u{1680}' | '\u{2000}'
            ..='\u{200A}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202F}'
                | '\u{205F}'
                | '\u{3000}'
                | '\u{FEFF}'
    )
}

/// `String.prototype.trim`.
pub fn js_trim(s: &str) -> &str {
    s.trim_matches(is_js_space)
}

/// `+v` (ECMAScript StringToNumber).
pub fn to_number(s: &str) -> f64 {
    let t = js_trim(s);
    if t.is_empty() {
        return 0.0;
    }
    let b = t.as_bytes();
    if b.len() > 2 && b[0] == b'0' {
        let radix = match b[1] {
            b'x' | b'X' => 16,
            b'o' | b'O' => 8,
            b'b' | b'B' => 2,
            _ => 0,
        };
        if radix != 0 {
            return parse_radix(&t[2..], radix);
        }
    }
    let (neg, body) = match b[0] {
        b'+' => (false, &t[1..]),
        b'-' => (true, &t[1..]),
        _ => (false, t),
    };
    if body == "Infinity" {
        return if neg {
            f64::NEG_INFINITY
        } else {
            f64::INFINITY
        };
    }
    if !is_decimal_literal(body) {
        return f64::NAN;
    }
    match body.parse::<f64>() {
        Ok(v) if neg => -v,
        Ok(v) => v,
        Err(_) => f64::NAN,
    }
}

fn parse_radix(digits: &str, radix: u32) -> f64 {
    let mut exact: u128 = 0;
    let mut approx: f64 = 0.0;
    let mut fits = true;
    for c in digits.chars() {
        let Some(d) = c.to_digit(radix) else {
            return f64::NAN;
        };
        approx = approx * f64::from(radix) + f64::from(d);
        if fits {
            match exact
                .checked_mul(u128::from(radix))
                .and_then(|v| v.checked_add(u128::from(d)))
            {
                Some(v) => exact = v,
                None => fits = false,
            }
        }
    }
    if fits { exact as f64 } else { approx }
}

/// StrUnsignedDecimalLiteral without `Infinity`: digits, optional fraction, optional exponent.
fn is_decimal_literal(s: &str) -> bool {
    let b = s.as_bytes();
    let mut i = 0;
    while i < b.len() && b[i].is_ascii_digit() {
        i += 1;
    }
    let mut digits = i;
    if i < b.len() && b[i] == b'.' {
        i += 1;
        let start = i;
        while i < b.len() && b[i].is_ascii_digit() {
            i += 1;
        }
        digits += i - start;
    }
    if digits == 0 {
        return false;
    }
    if i < b.len() && (b[i] == b'e' || b[i] == b'E') {
        i += 1;
        if i < b.len() && (b[i] == b'+' || b[i] == b'-') {
            i += 1;
        }
        let start = i;
        while i < b.len() && b[i].is_ascii_digit() {
            i += 1;
        }
        if i == start {
            return false;
        }
    }
    i == b.len()
}

/// `isNaN(+v)`.
pub fn is_nan_str(s: &str) -> bool {
    to_number(s).is_nan()
}

/// `n.toFixed(digits)`, exact: ties on the exact binary value round up in magnitude, as the spec says.
pub fn to_fixed(x: f64, digits: u32) -> String {
    if x.is_nan() {
        return "NaN".to_string();
    }
    if x.abs() >= 1e21 {
        return num_str(x);
    }
    if x < 0.0 {
        return format!("-{}", to_fixed(-x, digits));
    }
    let digits = digits as usize;
    // 1100 fractional digits write any double exactly.
    let exact = format!("{:.1100}", x.abs());
    let (int_part, frac_part) = exact.split_once('.').unwrap_or((&exact, ""));
    let mut kept: Vec<u8> = int_part.bytes().collect();
    kept.extend(frac_part.bytes().take(digits));
    if frac_part.as_bytes().get(digits).is_some_and(|&d| d >= b'5') {
        let mut i = kept.len();
        loop {
            if i == 0 {
                kept.insert(0, b'1');
                break;
            }
            i -= 1;
            if kept[i] == b'9' {
                kept[i] = b'0';
            } else {
                kept[i] += 1;
                break;
            }
        }
    }
    let int_len = kept.len() - digits;
    let mut out: String = kept[..int_len].iter().map(|&b| b as char).collect();
    if digits > 0 {
        out.push('.');
        out.extend(kept[int_len..].iter().map(|&b| b as char));
    }
    out
}

/// `Math.hypot`, V8's algorithm: scale by the largest value and add with Kahan compensation.
pub fn hypot(values: &[f64]) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    let mut max = 0.0f64;
    let mut any_nan = false;
    for v in values {
        let a = v.abs();
        if a.is_nan() {
            any_nan = true;
        } else if a > max {
            max = a;
        }
    }
    if max == f64::INFINITY {
        return f64::INFINITY;
    }
    if any_nan {
        return f64::NAN;
    }
    if max == 0.0 {
        return 0.0;
    }
    let mut sum = 0.0f64;
    let mut compensation = 0.0f64;
    for v in values {
        let n = v.abs() / max;
        let summand = n * n - compensation;
        let preliminary = sum + summand;
        compensation = (preliminary - sum) - summand;
        sum = preliminary;
    }
    sum.sqrt() * max
}

/// `Math.sin`.
pub fn sin(x: f64) -> f64 {
    libm::sin(x)
}

/// `Math.cos`.
pub fn cos(x: f64) -> f64 {
    libm::cos(x)
}

/// `Math.atan2`.
pub fn atan2(y: f64, x: f64) -> f64 {
    libm::atan2(y, x)
}

/// `Math.cbrt`.
pub fn cbrt(x: f64) -> f64 {
    libm::cbrt(x)
}

/// `Math.log10`.
pub fn log10(x: f64) -> f64 {
    libm::log10(x)
}

/// `Math.pow` / `**`: libm's `pow`, with JavaScript's differences (NaN where C gives 1).
pub fn pow(x: f64, y: f64) -> f64 {
    if y.is_nan() || (y.is_infinite() && x.abs() == 1.0) {
        return f64::NAN;
    }
    libm::pow(x, y)
}

/// `Math.max(a, b)`: NaN if either is NaN, and +0 above -0.
pub fn max(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else if a == 0.0 && b == 0.0 {
        if a.is_sign_negative() { b } else { a }
    } else if a > b {
        a
    } else {
        b
    }
}

/// `Math.min(a, b)`: NaN if either is NaN, and -0 below +0.
pub fn min(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else if a == 0.0 && b == 0.0 {
        if a.is_sign_negative() { a } else { b }
    } else if a < b {
        a
    } else {
        b
    }
}

/// `parseFloat(s)`: the longest decimal prefix after leading white space, NaN when there is none.
pub fn parse_float(s: &str) -> f64 {
    let t = s.trim_start_matches(is_js_space);
    let b = t.as_bytes();
    let mut i = 0;
    if matches!(b.first(), Some(b'+' | b'-')) {
        i = 1;
    }
    let neg = b.first() == Some(&b'-');
    if t[i..].starts_with("Infinity") {
        return if neg {
            f64::NEG_INFINITY
        } else {
            f64::INFINITY
        };
    }
    let digits = |mut j: usize| {
        while j < b.len() && b[j].is_ascii_digit() {
            j += 1;
        }
        j
    };
    let int_end = digits(i);
    let mut end = int_end;
    let mut mantissa = int_end > i;
    if b.get(end) == Some(&b'.') {
        let frac_end = digits(end + 1);
        if frac_end > end + 1 || mantissa {
            mantissa = mantissa || frac_end > end + 1;
            end = frac_end;
        }
    }
    if !mantissa {
        return f64::NAN;
    }
    if matches!(b.get(end), Some(b'e' | b'E')) {
        let mut j = end + 1;
        if matches!(b.get(j), Some(b'+' | b'-')) {
            j += 1;
        }
        let exp_end = digits(j);
        if exp_end > j {
            end = exp_end;
        }
    }
    let mut text = t[..end].to_string();
    if text.ends_with('.') {
        text.pop();
    }
    text.replace(".e", "e")
        .replace(".E", "E")
        .parse()
        .unwrap_or(f64::NAN)
}

/// `Math.imul`.
pub fn imul(a: i32, b: i32) -> i32 {
    a.wrapping_mul(b)
}

/// `s.length`.
pub fn utf16_len(s: &str) -> usize {
    s.encode_utf16().count()
}

/// `s.slice(start, end)` on UTF-16 code units, with negative indices counting from the end.
/// A cut through a surrogate pair gives U+FFFD, as a `String` holds no lone surrogate.
pub fn utf16_slice(s: &str, start: isize, end: Option<isize>) -> String {
    let units: Vec<u16> = s.encode_utf16().collect();
    let len = units.len() as isize;
    let resolve = |i: isize| if i < 0 { (len + i).max(0) } else { i.min(len) };
    let from = resolve(start);
    let to = end.map_or(len, resolve);
    if from >= to {
        return String::new();
    }
    String::from_utf16_lossy(&units[from as usize..to as usize])
}

/// `JSON.stringify(s)` for a string.
pub fn json_string(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\u{8}' => out.push_str("\\b"),
            '\u{C}' => out.push_str("\\f"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

/// The default `Array.prototype.sort` order: by UTF-16 code units.
pub fn utf16_cmp(a: &str, b: &str) -> Ordering {
    a.encode_utf16().cmp(b.encode_utf16())
}

/// ICU's order of printable ASCII at primary strength; letters are listed as lower/upper pairs.
const ICU_ASCII_ORDER: &str = " _-,;:!?.'\"()[]{}@*/\\&#%`^+<=>|~$0123456789aAbBcCdDeEfFgGhHiIjJkKlLmMnNoOpPqQrRsStTuUvVwWxXyYzZ";

fn primary_rank(c: char) -> i64 {
    if c.is_ascii() {
        let c = c.to_ascii_lowercase();
        if let Some(i) = ICU_ASCII_ORDER.find(c) {
            let letters = ICU_ASCII_ORDER.find('a').unwrap_or(0);
            // Fold case: a letter's lower and upper forms share one rank.
            return if i >= letters {
                (letters + (i - letters) / 2) as i64
            } else {
                i as i64
            };
        }
        // Control characters sort before everything printable.
        return i64::from(c as u32) - 1000;
    }
    1000 + i64::from(c as u32)
}

/// `localeCompare`: an approximation of ICU's root collation, exact for ASCII (spec section 5).
/// Punctuation is not ignored; case differences only break ties, lowercase first.
pub fn locale_cmp(a: &str, b: &str) -> Ordering {
    let primary = a.chars().map(primary_rank).cmp(b.chars().map(primary_rank));
    if primary != Ordering::Equal {
        return primary;
    }
    for (x, y) in a.chars().zip(b.chars()) {
        if x != y {
            // Same primary rank, so only case differs: lowercase first.
            return if x.is_ascii_lowercase() {
                Ordering::Less
            } else {
                Ordering::Greater
            };
        }
    }
    Ordering::Equal
}

#[cfg(test)]
#[allow(clippy::approx_constant)] // expected values are what Node prints
mod tests {

    #[test]
    fn min_max_follow_math() {
        assert!(max(f64::NAN, 1.0).is_nan() && min(1.0, f64::NAN).is_nan());
        assert!(max(-0.0, 0.0).is_sign_positive() && max(0.0, -0.0).is_sign_positive());
        assert!(min(0.0, -0.0).is_sign_negative() && min(-0.0, 0.0).is_sign_negative());
        assert_eq!((max(0.0, -3.0), min(255.0, 300.5)), (0.0, 255.0));
    }

    #[test]
    fn parse_float_takes_the_longest_prefix() {
        for (s, want) in [
            ("0.5", 0.5),
            ("1.2.3", 1.2),
            (".5", 0.5),
            ("5.", 5.0),
            ("  -2.5e2x", -250.0),
            ("1e", 1.0),
            ("1.e2", 100.0),
            ("Infinityx", f64::INFINITY),
            ("007", 7.0),
        ] {
            assert_eq!(parse_float(s), want, "{s}");
        }
        for s in [".", "..5", "", "-", "e5", "abc"] {
            assert!(parse_float(s).is_nan(), "{s}");
        }
    }
    use super::*;
    use std::cmp::Ordering;

    #[test]
    fn numbers_print_like_js() {
        assert_eq!(num_str(0.1 + 0.2), "0.30000000000000004");
        assert_eq!(num_str(1e21), "1e+21");
        assert_eq!(num_str(-0.0), "0");
        assert_eq!(num_str(123e-20), "1.23e-18");
        assert_eq!(num_str(5e-7), "5e-7");
        assert_eq!(num_str(9007199254740994.0), "9007199254740994");
        assert_eq!(num_str(f64::INFINITY), "Infinity");
        assert_eq!(num_str(f64::NAN), "NaN");
    }
    #[test]
    fn round_like_js() {
        assert_eq!(round(2.5), 3.0);
        assert_eq!(round(-2.5), -2.0);
        assert!(round(-0.4).is_sign_negative());
        assert_eq!(round(0.49999999999999994), 0.0);
    }
    #[test]
    fn unary_plus_like_js() {
        assert_eq!(to_number(" 12 "), 12.0);
        assert_eq!(to_number(""), 0.0);
        assert_eq!(to_number("0x1f"), 31.0);
        assert_eq!(to_number("1e3"), 1000.0);
        assert_eq!(to_number(".5"), 0.5);
        assert_eq!(to_number("5."), 5.0);
        assert_eq!(to_number("-Infinity"), f64::NEG_INFINITY);
        assert!(to_number("12px").is_nan());
        assert!(to_number("-").is_nan());
        assert!(to_number("1e400").is_infinite());
        assert_eq!(to_number("\u{FEFF}7"), 7.0);
    }
    #[test]
    fn maths_like_v8() {
        assert_eq!(hypot(&[3.0, 4.0]), 5.0);
        assert_eq!(hypot(&[0.1, 0.7]), 0.7071067811865476);
        assert_eq!(hypot(&[123.456, 7.89]), 123.707865699801);
        assert_eq!(hypot(&[1e200, 1e200]), 1.414213562373095e200);
        assert_eq!(hypot(&[-2.5, 1.0 / 3.0]), 2.522124325070259);
        assert_eq!(cbrt(0.3), 0.6694329500821695);
        assert_eq!(cbrt(12.5), 2.3207944168063896);
        assert_eq!(pow(0.7, 2.4), 0.42484968054675043);
        assert_eq!(pow(0.42, 1.0 / 2.4), 0.6966594581646747);
        assert_eq!(sin(1.2345), 0.9439833239445111);
        assert_eq!(cos(2.5), -0.8011436155469337);
        assert_eq!(atan2(0.3, -0.7), 2.7367008673047097);
        assert_eq!(log10(1234.5), 3.091491094267951);
    }
    #[test]
    fn to_fixed_like_js() {
        assert_eq!(to_fixed(0.0625, 5), "0.06250");
        assert_eq!(to_fixed(20.0 / 256.0, 5), "0.07813");
        assert_eq!(to_fixed(1.0 / 3.0, 5), "0.33333");
    }
    #[test]
    fn strings_like_js() {
        assert_eq!(utf16_len("a😀"), 3);
        assert_eq!(utf16_slice("héllo", 1, Some(-1)), "éll");
        assert_eq!(js_trim("\u{FEFF} a \u{3000}"), "a");
        assert_eq!(
            json_string("a\"b\\c\nd\u{1}é"),
            "\"a\\\"b\\\\c\\nd\\u0001é\""
        );
        assert_eq!(utf16_cmp("Z", "a"), Ordering::Less);
        assert_eq!(utf16_cmp("\u{FF5E}", "😀"), Ordering::Greater);
        let mut v = vec!["b.svg", "A.svg", "a-b.svg", "a.svg", "10.svg", "2.svg"];
        v.sort_by(|a, b| locale_cmp(a, b));
        assert_eq!(v, ["10.svg", "2.svg", "a-b.svg", "a.svg", "A.svg", "b.svg"]);
    }
}

#[cfg(test)]
mod edge_tests {
    use super::*;

    #[test]
    fn to_fixed_edges() {
        assert_eq!(to_fixed(0.5, 0), "1");
        assert_eq!(to_fixed(2.5, 0), "3");
        assert_eq!(to_fixed(1.005, 2), "1.00");
        assert_eq!(to_fixed(-1e-7, 2), "-0.00");
        assert_eq!(to_fixed(9.9999999, 2), "10.00");
        assert_eq!(to_fixed(-0.0, 1), "0.0");
        assert_eq!(to_fixed(123.456, 0), "123");
    }

    #[test]
    fn parsing_and_maths_edges() {
        assert_eq!(to_number("0b101"), 5.0);
        assert!(to_number("0x").is_nan());
        assert_eq!(to_number("+.5e1"), 5.0);
        assert!(to_number("1_0").is_nan());
        assert!(to_number("\u{85} 1").is_nan());
        assert!(is_nan_str("abc") && !is_nan_str(" 4 "));
        assert!(pow(1.0, f64::INFINITY).is_nan());
        assert_eq!(hypot(&[f64::NAN, f64::INFINITY]), f64::INFINITY);
        assert_eq!(imul(0x7fff_ffff, 2), -2);
        assert_eq!(utf16_slice("a😀b", 0, Some(2)), "a\u{FFFD}");
    }
}
