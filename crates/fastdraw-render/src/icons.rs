//! icons.ts: the icon registry. A `Look` holds its icons as an `IconMap`, a JavaScript `Map` of name to path data
//! (insertion order; setting an existing name keeps its place).

use indexmap::IndexMap;

/// Icon name to SVG path data, drawn as outlines in a 24x24 box.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct IconMap {
    map: IndexMap<String, Vec<String>>,
}

impl IconMap {
    /// An empty map (the built-in icons are added by a later task).
    pub fn new() -> Self {
        Self::default()
    }

    pub fn get(&self, name: &str) -> Option<&[String]> {
        self.map.get(name).map(Vec::as_slice)
    }

    /// `Map.prototype.set`: an existing name keeps its position, a new one goes last.
    pub fn set(&mut self, name: String, paths: Vec<String>) {
        self.map.insert(name, paths);
    }

    /// The names, in insertion order.
    pub fn keys(&self) -> impl Iterator<Item = &str> {
        self.map.keys().map(String::as_str)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn set_keeps_map_order() {
        let mut m = IconMap::new();
        m.set("a".into(), vec!["M0".into()]);
        m.set("b".into(), vec!["M1".into()]);
        m.set("a".into(), vec!["M2".into()]);
        assert_eq!(m.keys().collect::<Vec<_>>(), ["a", "b"]);
        assert_eq!(m.get("a"), Some(&["M2".to_string()][..]));
        assert_eq!(m.get("c"), None);
    }
}
