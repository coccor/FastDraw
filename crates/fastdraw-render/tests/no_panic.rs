//! `render` never fails (its documented contract), so it must not panic either, on any text. Every coverage fixture
//! and every example is mutated (cut short, a line dropped, a token replaced by an awkward value) and drawn light and
//! dark with the fixture's own path as its file, and its share link made; any panic fails the test.
//!
//! There are far more mutations than can be drawn in a few seconds, so a fixed, evenly spread sample is drawn: every
//! `stride`-th mutation of the whole stream, which keeps each kind of mutation and each fixture in the sample.
//! `FASTDRAW_NO_PANIC_STRIDE=1` draws them all.

use std::panic::{AssertUnwindSafe, catch_unwind};
use std::path::{Path, PathBuf};

use fastdraw_render::{Source, editor_link, render};

mod common;
use common::root;

/// The values a token is replaced by.
const TOKENS: [&str; 10] = [
    "0", "-1", "1e400", "NaN", "_", "\"\"", "@", "->", "x9", "+0,+0",
];

/// Every `.fdraw` file under `dir`, in a fixed order.
fn fdraw_files(dir: &Path, out: &mut Vec<PathBuf>) {
    let mut entries: Vec<PathBuf> = std::fs::read_dir(dir)
        .unwrap_or_else(|e| panic!("{}: {e}", dir.display()))
        .map(|e| e.unwrap().path())
        .collect();
    entries.sort();
    for p in entries {
        if p.is_dir() {
            fdraw_files(&p, out);
        } else if p.extension().is_some_and(|x| x == "fdraw") {
            out.push(p);
        }
    }
}

/// A string made only when called.
type Lazy<'a> = &'a dyn Fn() -> String;

/// Each mutation of `text`, passed to `each` as a description and the mutated text, both made only when called
/// (most mutations are not drawn, and copying the text for each would cost more than drawing the sample).
fn mutations(text: &str, each: &mut dyn FnMut(Lazy, Lazy)) {
    // the text cut short at each character boundary
    for (i, _) in text.char_indices().skip(1) {
        each(&|| format!("cut at byte {i}"), &|| text[..i].to_string());
    }
    let lines: Vec<&str> = text.split_inclusive('\n').collect();
    // each line dropped
    for i in 0..lines.len() {
        let drop = || {
            let mut t = String::with_capacity(text.len());
            for (j, l) in lines.iter().enumerate() {
                if j != i {
                    t.push_str(l);
                }
            }
            t
        };
        each(&|| format!("line {} dropped", i + 1), &drop);
    }
    // each token (a run of characters other than white space) replaced by each awkward value
    let mut start = 0;
    for (i, line) in lines.iter().enumerate() {
        let mut tokens = Vec::new();
        let mut from = None;
        for (j, c) in line.char_indices() {
            match (c.is_whitespace(), from) {
                (false, None) => from = Some(j),
                (true, Some(f)) => {
                    tokens.push((f, j));
                    from = None;
                }
                _ => {}
            }
        }
        if let Some(f) = from {
            tokens.push((f, line.len()));
        }
        for (a, b) in tokens {
            for v in TOKENS {
                each(
                    &|| format!("line {} token {:?} -> {v}", i + 1, &line[a..b]),
                    &|| format!("{}{v}{}", &text[..start + a], &text[start + b..]),
                );
            }
        }
        start += line.len();
    }
}

#[test]
fn render_never_panics_on_mutated_fixtures() {
    let root = root();
    let mut files = Vec::new();
    fdraw_files(
        &root.join("crates/fastdraw-render/tests/coverage"),
        &mut files,
    );
    fdraw_files(&root.join("examples"), &mut files);
    assert!(files.len() > 50, "fixtures not found: {}", files.len());
    // a debug build draws about ten times slower
    let default_stride = if cfg!(debug_assertions) { 5471 } else { 547 };
    let stride: usize = std::env::var("FASTDRAW_NO_PANIC_STRIDE")
        .ok()
        .and_then(|s| s.parse().ok())
        .filter(|&s| s > 0)
        .unwrap_or(default_stride);

    let started = std::time::Instant::now();
    let (mut seen, mut drawn) = (0usize, 0usize);
    let mut panics = Vec::new();
    for file in &files {
        let bytes = std::fs::read(file).unwrap();
        let text = String::from_utf8_lossy(&bytes);
        let name = file.file_name().unwrap().to_string_lossy().into_owned();
        mutations(&text, &mut |what, make| {
            seen += 1;
            if seen % stride != 0 {
                return;
            }
            drawn += 1;
            let t = make();
            let r = catch_unwind(AssertUnwindSafe(|| {
                for dark in [false, true] {
                    let d = render(&Source {
                        text: &t,
                        file: Some(file),
                        dark,
                    });
                    editor_link(&name, &t, d.look.as_ref());
                }
            }));
            if r.is_err() {
                panics.push(format!("{} ({})", file.display(), what()));
            }
        });
    }
    println!(
        "{drawn} of {seen} mutations of {} files drawn in {:?}",
        files.len(),
        started.elapsed()
    );
    assert!(
        panics.is_empty(),
        "{} mutations panicked:\n{}",
        panics.len(),
        panics.join("\n")
    );
}
