//! What the embed (editor/src/embed) decides about a diagram: the look it is drawn in on a dark page.

use crate::look::Look;

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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::look::{bundled_look, default_look, empty_look};

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
