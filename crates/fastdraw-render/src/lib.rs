#![forbid(unsafe_code)]
//! FastDraw's diagram renderer, in Rust. Output matches the TypeScript renderer character for character.

use std::path::{Path, PathBuf};

pub mod data;
pub mod iconfiles;
pub mod icons;
pub mod js;
pub mod look;
pub mod parse;
pub mod router;
pub mod sketch;

/// One diagram to draw.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Source<'a> {
    pub text: &'a str,
    pub file: Option<&'a Path>,
    pub dark: bool,
}

/// The result of drawing a diagram.
#[derive(Debug, Clone, PartialEq)]
pub struct Drawing {
    /// Standalone SVG; text names font families, no `@font-face`.
    pub svg: String,
    /// The look's paper colour (sRGB).
    pub paper: [u8; 3],
    /// x, y, w, h in diagram units.
    pub bounds: [f64; 4],
    /// Errors and warnings, as `loadScene` reports them.
    pub issues: Vec<Issue>,
    /// TTF/OTF files from the look's fontdir.
    pub font_files: Vec<PathBuf>,
    /// The diagram's own `.look` file, as read (for the share link).
    pub look: Option<LookFile>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Issue {
    pub line: u32,
    pub level: Level,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Level {
    Error,
    Warning,
}

/// A look file: its path as written in the diagram, and its text.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LookFile {
    pub path: String,
    pub text: String,
}

/// This crate's version, the same as the npm package's.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Draws a diagram. Never fails.
pub fn render(_source: &Source) -> Drawing {
    todo!("render is ported in a later task")
}

/// The share link that opens a diagram in the online editor.
pub fn editor_link(_name: &str, _text: &str, _look: Option<&LookFile>) -> String {
    todo!("editor_link is ported in a later task")
}

/// The bundled fonts, inflated on first call.
pub fn fonts() -> &'static [(&'static str, Vec<u8>)] {
    todo!("fonts is ported in a later task")
}
