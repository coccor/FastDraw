//! icons.ts, iconStyle.ts and the extended-icon behaviour of extendedIcons.ts: the icon registry. The crate always
//! behaves as if `loadExtendedIcons()` had run (spec section 4.2): the core set is plain data, and the rest is
//! inflated the first time a name is not in the core set or the full list is needed.
//!
//! A `Look` holds its icons as an `IconMap`: the look's own icons laid over the shared built-in set, which is never
//! copied. The TypeScript copies every icon into each look's `Map`; the order of `Map` keys is kept here (a name the
//! look redefines keeps its place, a new one goes last).

use std::sync::OnceLock;

use indexmap::IndexMap;

use crate::data::{IconData, IconWeight, core_icons, extended_icons, weight_width};
use crate::js;
use crate::look::Look;

/// The side of the box the built-in icons are drawn in.
pub const ICON_BOX: f64 = 256.0;

/// Icon name to SVG path data. Built-in icons are filled shapes in a 256x256 box; a look's own are outlines in a
/// 24x24 box, drawn with a line.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct IconMap {
    /// the look's own icons, in the order they were set
    own: IndexMap<String, Vec<String>>,
    /// whether the built-in icons are underneath
    builtin: bool,
}

fn index(weight: IconWeight) -> usize {
    weight as usize
}

/// A name's entry in `pick` of the core set, else of the extended set (inflated only on a core miss).
fn shared<'a, T>(
    name: &str,
    pick: impl Fn(&'a IconData) -> &'a IndexMap<String, T>,
) -> Option<&'a T> {
    pick(core_icons())
        .get(name)
        .or_else(|| pick(extended_icons()).get(name))
}

fn is_shared(name: &str) -> bool {
    shared(name, |d| &d.paths[index(IconWeight::Regular)]).is_some()
}

impl IconMap {
    /// An empty map, with no built-in icons.
    pub fn new() -> Self {
        Self::default()
    }

    /// A map holding the built-in icons (`new Map(Object.entries(ICONS))`), without copying them.
    pub fn builtin() -> Self {
        Self {
            own: IndexMap::new(),
            builtin: true,
        }
    }

    pub fn get(&self, name: &str) -> Option<&[String]> {
        if let Some(p) = self.own.get(name) {
            return Some(p);
        }
        if !self.builtin {
            return None;
        }
        shared(name, |d| &d.paths[index(IconWeight::Regular)]).map(Vec::as_slice)
    }

    /// `Map.prototype.set`: an existing name keeps its position, a new one goes last.
    pub fn set(&mut self, name: String, paths: Vec<String>) {
        self.own.insert(name, paths);
    }

    /// The names, in `Map` order: the built-in icons (core, then extended), then the look's new ones.
    /// Inflates the extended set.
    pub fn keys(&self) -> impl Iterator<Item = &str> {
        let builtin = self.builtin;
        let regular = index(IconWeight::Regular);
        let base = builtin.then(|| {
            core_icons().paths[regular]
                .keys()
                .chain(extended_icons().paths[regular].keys())
        });
        base.into_iter().flatten().map(String::as_str).chain(
            self.own
                .keys()
                .map(String::as_str)
                .filter(move |k| !builtin || !is_shared(k)),
        )
    }

    /// `look.icons.get(name) === ICONS[name]`: the name is a built-in icon the look has not redefined.
    pub fn is_builtin_value(&self, name: &str) -> bool {
        self.builtin && !self.own.contains_key(name) && is_shared(name)
    }
}

/// Other words people reach for (`ICON_WORDS`), core then extended: a search for "email" finds mail and "k8s"
/// finds pod. Search only: the icon's name in a diagram is still the one above.
pub fn icon_words() -> &'static IndexMap<String, String> {
    static WORDS: OnceLock<IndexMap<String, String>> = OnceLock::new();
    WORDS.get_or_init(|| {
        let mut words = core_icons().words.clone();
        // Object.assign: a name already there keeps its place and takes the new value
        for (k, v) in &extended_icons().words {
            words.insert(k.clone(), v.clone());
        }
        words
    })
}

/// Does the icon called `name` answer to `word`, by its name or the words above?
pub fn icon_matches(name: &str, word: &str) -> bool {
    let w = join_spaces(&js::js_trim(word).to_lowercase());
    if w.is_empty() || name.contains(&w) {
        return true;
    }
    let squashed = w.replace('-', "");
    match icon_words().get(name) {
        Some(words) if !words.is_empty() => {
            words.split(' ').any(|x| x.starts_with(&w) || x == squashed)
        }
        _ => false,
    }
}

/// `replace(/\s+/g, '-')`
fn join_spaces(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut in_space = false;
    for c in s.chars() {
        if js::is_js_space(c) {
            if !in_space {
                out.push('-');
            }
            in_space = true;
        } else {
            out.push(c);
            in_space = false;
        }
    }
    out
}

/// How a built-in icon is drawn in each style: which Phosphor layers, in its 256 box. The renderer and the
/// editor's icon tiles both draw from here, so a tile looks like the icon on the canvas.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IconStyle {
    Outline,
    Solid,
    Duotone,
}

/// A built-in icon is one the look has not redrawn with its own `icon` statement (or an icon file).
pub fn is_built_in(look: &Look, name: &str) -> bool {
    !look.images.contains_key(name) && look.icons.is_builtin_value(name)
}

/// The outline weight nearest a line width, given in the icon's 256 box; regular when none is asked for.
pub fn weight_for(width: Option<f64>) -> IconWeight {
    let Some(width) = width.filter(|w| *w > 0.0) else {
        return IconWeight::Regular;
    };
    let mut best = weight_width()[0];
    for b in weight_width() {
        if (b.1 - width).abs() < (best.1 - width).abs() {
            best = b;
        }
    }
    best.0
}

/// The two layers of a built-in icon: a tint drawn under it (duotone, or an outline with icon.fill), and the icon
/// itself, filled in its colour.
pub fn icon_layers(name: &str, style: IconStyle, weight: IconWeight) -> (Vec<String>, Vec<String>) {
    let layer = |w: IconWeight| {
        shared(name, |d| &d.paths[index(w)])
            .cloned()
            .unwrap_or_default()
    };
    if style == IconStyle::Solid {
        return (Vec::new(), layer(IconWeight::Fill));
    }
    let tint = shared(name, |d| &d.tint).cloned().unwrap_or_default();
    (tint, layer(weight))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(v: &[&str]) -> Vec<String> {
        v.iter().map(|x| x.to_string()).collect()
    }

    #[test]
    fn set_keeps_map_order() {
        let mut m = IconMap::new();
        m.set("a".into(), s(&["M0"]));
        m.set("b".into(), s(&["M1"]));
        m.set("a".into(), s(&["M2"]));
        assert_eq!(m.keys().collect::<Vec<_>>(), ["a", "b"]);
        assert_eq!(m.get("a"), Some(&s(&["M2"])[..]));
        assert_eq!(m.get("c"), None);
    }

    #[test]
    fn builtin_has_every_icon_in_order() {
        let m = IconMap::builtin();
        // Object.keys(ICON_WEIGHTS.regular).length after loadExtendedIcons() in Node
        assert_eq!(m.keys().count(), 1594);
        let core = core_icons().paths[index(IconWeight::Regular)].len();
        assert_eq!(core, 128);
        let keys: Vec<_> = m.keys().collect();
        assert_eq!(keys[0], "active-directory");
        let core_names: Vec<&str> = core_icons().names.iter().map(String::as_str).collect();
        assert_eq!(&keys[..core], &core_names[..]);
        assert!(m.get("user").is_some_and(|p| !p.is_empty()));
        // an extended icon is found too
        let ext = extended_icons().paths[index(IconWeight::Regular)]
            .keys()
            .next()
            .unwrap();
        assert!(m.get(ext).is_some());
        assert_eq!(m.get("no-such-icon"), None);
    }

    #[test]
    fn own_icons_lay_over_the_builtin_set() {
        let mut m = IconMap::builtin();
        let before: Vec<String> = m.keys().map(str::to_string).collect();
        assert!(m.is_builtin_value("user"));
        m.set("user".into(), s(&["M0"]));
        m.set("zzz-new".into(), s(&["M1"]));
        assert!(!m.is_builtin_value("user"));
        assert!(!m.is_builtin_value("zzz-new"));
        assert!(m.is_builtin_value("server"));
        assert_eq!(m.get("user"), Some(&s(&["M0"])[..]));
        let after: Vec<&str> = m.keys().collect();
        assert_eq!(after.len(), before.len() + 1);
        let old: Vec<&str> = before.iter().map(String::as_str).collect();
        assert_eq!(&after[..before.len()], &old[..]);
        assert_eq!(after.last(), Some(&"zzz-new"));
        assert!(!IconMap::new().is_builtin_value("user"));
    }

    #[test]
    fn extended_names_do_not_overlap_core() {
        // The lookups try the core set first; Object.assign would let the extended one win on a shared name.
        for w in 0..5 {
            let (c, e) = (&core_icons().paths[w], &extended_icons().paths[w]);
            assert!(e.keys().all(|k| !c.contains_key(k)), "weight {w}");
        }
        let (c, e) = (&core_icons().tint, &extended_icons().tint);
        assert!(e.keys().all(|k| !c.contains_key(k)));
    }

    #[test]
    fn matches_names_and_words() {
        assert!(icon_matches("mail", "email"));
        assert!(icon_matches("pod", "k8s"));
        assert!(icon_matches("load-balancer", "Load Balancer"));
        assert!(icon_matches("load-balancer", "l-b"));
        assert!(icon_matches("anything", "  "));
        assert!(!icon_matches("mail", "kubernetes"));
        assert_eq!(
            icon_words().get("mail").map(String::as_str),
            Some("email inbox smtp")
        );
        assert!(icon_words().len() >= 1587);
    }

    #[test]
    fn weight_follows_line_width() {
        assert_eq!(weight_for(None), IconWeight::Regular);
        assert_eq!(weight_for(Some(0.0)), IconWeight::Regular);
        assert_eq!(weight_for(Some(f64::NAN)), IconWeight::Regular);
        assert_eq!(weight_for(Some(13.0)), IconWeight::Light);
        assert_eq!(weight_for(Some(2.0)), IconWeight::Thin);
        assert_eq!(weight_for(Some(100.0)), IconWeight::Bold);
        assert_eq!(weight_for(Some(8.0)), IconWeight::Thin); // a tie keeps the first
    }

    #[test]
    fn layers_by_style() {
        let regular = &core_icons().paths[index(IconWeight::Regular)]["user"];
        let fill = &core_icons().paths[index(IconWeight::Fill)]["user"];
        let (tint, front) = icon_layers("user", IconStyle::Outline, IconWeight::Regular);
        assert_eq!((&tint, &front), (&core_icons().tint["user"], regular));
        assert_eq!(
            icon_layers("user", IconStyle::Solid, IconWeight::Bold),
            (Vec::new(), fill.clone())
        );
        let (_, bold) = icon_layers("user", IconStyle::Duotone, IconWeight::Bold);
        assert_eq!(&bold, &core_icons().paths[index(IconWeight::Bold)]["user"]);
        assert_eq!(
            icon_layers("nope", IconStyle::Duotone, IconWeight::Regular),
            (Vec::new(), Vec::new())
        );
    }
}
