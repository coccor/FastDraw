//! node.ts: the file-system loaders of the command-line tool (reading a diagram's look file, its icon and font
//! folders), and the `node:path` functions they use, formatted as Node formats them on this platform.

use std::path::{Path, PathBuf};

use crate::fontmeta::font_meta;
use crate::iconfiles::{MAX_ICON_BYTES, MAX_ICON_FILES, with_icon_images};
use crate::js;
use crate::look::{IssueLevel, Look, LookIssue, parse_look};
use crate::parse::look_path;
use crate::scene::{Scene, build_scene};

/// A look file bigger than this is treated as unreadable (spec §4.1; the TypeScript has no limit).
pub const MAX_LOOK_BYTES: u64 = 1_000_000;

// ---- node:path -------------------------------------------------------------------------------------------------

const WINDOWS: bool = cfg!(windows);
/// `path.sep`
const SEP: char = if WINDOWS { '\\' } else { '/' };

fn is_sep(c: char) -> bool {
    c == '/' || (WINDOWS && c == '\\')
}

/// A path's root as `path.resolve` reads it: the device (`C:` or `\\server\share`, empty on Unix), whether it is
/// absolute, and the rest.
fn split_root(p: &str) -> (String, bool, &str) {
    let mut cs = p.chars();
    let (c0, c1) = (cs.next(), cs.next());
    if !WINDOWS {
        return match c0 {
            Some('/') => (String::new(), true, &p[1..]),
            _ => (String::new(), false, p),
        };
    }
    match (c0, c1) {
        (Some(a), Some(b)) if is_sep(a) && is_sep(b) => {
            // \\server\share: a UNC root, when both names are there
            let rest = &p[2..];
            let server_end = rest.find(is_sep).unwrap_or(rest.len());
            let after = &rest[server_end..];
            let share_from = after.len() - after.trim_start_matches(is_sep).len();
            let share = &after[share_from..];
            let share_end = share.find(is_sep).unwrap_or(share.len());
            if server_end > 0 && share_from > 0 && share_end > 0 {
                let device = format!("\\\\{}\\{}", &rest[..server_end], &share[..share_end]);
                (device, true, &share[share_end..])
            } else {
                (String::new(), true, &p[1..])
            }
        }
        (Some(a), _) if is_sep(a) => (String::new(), true, &p[1..]),
        (Some(a), Some(':')) if a.is_ascii_alphabetic() => {
            let rest = &p[2..];
            (p[..2].to_string(), rest.starts_with(is_sep), rest)
        }
        _ => (String::new(), false, p),
    }
}

/// `path.isAbsolute`
pub fn is_absolute(p: &str) -> bool {
    split_root(p).1
}

/// The current folder as Node's `process.cwd()` gives it.
fn cwd() -> String {
    std::env::current_dir().map_or_else(
        |_| String::from(SEP),
        |d| strip_verbatim(&d.to_string_lossy()),
    )
}

/// `\\?\C:\x` as `C:\x` and `\\?\UNC\srv\share` as `\\srv\share`: Node never writes the verbatim prefix.
fn strip_verbatim(p: &str) -> String {
    match p.strip_prefix(r"\\?\") {
        Some(rest) => match rest.strip_prefix(r"UNC\") {
            Some(unc) => format!(r"\\{unc}"),
            None => rest.to_string(),
        },
        None => p.to_string(),
    }
}

/// `path.resolve(...paths)`: absolute, `.` and `..` worked out, separators the platform's, no trailing separator.
fn resolve_all(paths: &[&str]) -> String {
    let mut device = String::new();
    let mut absolute = false;
    let mut tail: Vec<String> = Vec::new(); // the parts, rightmost last
    // right to left, then once more with the current folder, until the path is absolute (and, on Windows, has a drive)
    for i in (0..=paths.len()).rev() {
        let p: String = if i > 0 {
            paths[i - 1].to_string()
        } else if device.is_empty() {
            cwd()
        } else {
            // a drive-relative path: that drive's current folder, which is its root unless it is the cwd's drive
            let cwd = cwd();
            let (cd, _, _) = split_root(&cwd);
            if cd.eq_ignore_ascii_case(&device) {
                cwd
            } else {
                format!("{device}\\")
            }
        };
        if p.is_empty() {
            continue;
        }
        let (d, abs, rest) = split_root(&p);
        if !d.is_empty() {
            if device.is_empty() {
                device = d;
            } else if !d.eq_ignore_ascii_case(&device) {
                continue; // another drive: not part of this path
            }
        }
        if !absolute {
            tail.insert(0, rest.to_string());
            absolute = abs;
        }
        if absolute && (!device.is_empty() || !WINDOWS) {
            break;
        }
    }
    // normalizeString: an absolute path cannot climb above its root
    let mut parts: Vec<&str> = Vec::new();
    for seg in tail.iter().flat_map(|t| t.split(is_sep)) {
        match seg {
            "" | "." => {}
            ".." => {
                if parts.last().is_some_and(|l| *l != "..") {
                    parts.pop();
                } else if !absolute {
                    parts.push("..");
                }
            }
            s => parts.push(s),
        }
    }
    let joined = parts.join(&SEP.to_string());
    let out = format!(
        "{device}{}{joined}",
        if absolute {
            SEP.to_string()
        } else {
            String::new()
        }
    );
    if out.is_empty() { ".".into() } else { out }
}

/// `path.resolve(base, rel)`
pub fn resolve(base: &Path, rel: &str) -> PathBuf {
    PathBuf::from(resolve_all(&[&base.to_string_lossy(), rel]))
}

/// `path.resolve(p)`, as text: how Node writes a path in a message.
pub fn path_string(p: &Path) -> String {
    resolve_all(&[&p.to_string_lossy()])
}

/// `path.dirname(path.resolve(p))`
fn dirname(p: &str) -> String {
    resolve_all(&[p, ".."])
}

/// `path.relative(from, to)`: case-insensitive on Windows, and `to` itself when the roots differ.
fn relative(from: &str, to: &str) -> String {
    let (from, to) = (resolve_all(&[from]), resolve_all(&[to]));
    let same = |a: &str, b: &str| {
        if WINDOWS {
            a.to_lowercase() == b.to_lowercase()
        } else {
            a == b
        }
    };
    let (fd, _, fr) = split_root(&from);
    let (td, _, tr) = split_root(&to);
    if !same(&fd, &td) {
        return to.clone();
    }
    let fs: Vec<&str> = fr.split(is_sep).filter(|s| !s.is_empty()).collect();
    let ts: Vec<&str> = tr.split(is_sep).filter(|s| !s.is_empty()).collect();
    let common = fs.iter().zip(&ts).take_while(|(a, b)| same(a, b)).count();
    let mut out: Vec<&str> = vec![".."; fs.len() - common];
    out.extend(&ts[common..]);
    out.join(&SEP.to_string())
}

// ---- reading looks -----------------------------------------------------------------------------------------------

// A look is untrusted input, and what its folders hold ends up inside exported images. So a folder a look
// names (fontdir, icondir) must be a real folder inside the look's own folder, and only real files directly
// in it are read: no absolute paths, no climbing out with "..", no symbolic links.
pub fn look_folder(look_file: &Path, d: &str) -> Option<PathBuf> {
    if is_absolute(d) {
        return None;
    }
    let home = dirname(&look_file.to_string_lossy());
    let given = resolve_all(&[&home, d]);
    // realpathSync: the containment check is on the real folders
    let home_real = std::fs::canonicalize(&home).ok()?;
    let dir_real = std::fs::canonicalize(&given).ok()?;
    let rel = dir_real.strip_prefix(&home_real).ok()?;
    let rel = rel.to_string_lossy();
    if rel.starts_with("..") || !std::fs::symlink_metadata(&dir_real).ok()?.is_dir() {
        return None;
    }
    // realpathSync keeps the path as given when no link is on the way; otherwise it is where the links lead
    let real = strip_verbatim(&dir_real.to_string_lossy());
    let same = if WINDOWS {
        real.to_lowercase() == given.to_lowercase()
    } else {
        real == given
    };
    Some(PathBuf::from(if same { given } else { real }))
}

pub fn plain_files(
    dir: &Path,
    ext: fn(&str) -> bool,
    max_bytes: u64,
    max_files: usize,
) -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut names: Vec<String> = entries
        .filter_map(|e| e.ok().map(|e| e.file_name().to_string_lossy().into_owned()))
        .filter(|n| ext(n))
        .collect();
    names.sort_by(|a, b| js::utf16_cmp(a, b));
    let dir = dir.to_string_lossy();
    let mut out = Vec::new();
    for f in names {
        if out.len() >= max_files {
            break;
        }
        let full = PathBuf::from(format!("{dir}{SEP}{f}"));
        // unreadable: skipped
        if let Ok(st) = std::fs::symlink_metadata(&full)
            && st.is_file()
            && !st.file_type().is_symlink()
            && st.len() <= max_bytes
        {
            out.push(full);
        }
    }
    out
}

/// `/\.<ext>$/i` for an ASCII extension (with its dot).
fn ends_with_ci(name: &str, ext: &str) -> bool {
    name.len() >= ext.len()
        && name.as_bytes()[name.len() - ext.len()..].eq_ignore_ascii_case(ext.as_bytes())
}
fn is_svg(n: &str) -> bool {
    ends_with_ci(n, ".svg")
}
fn is_font(n: &str) -> bool {
    ends_with_ci(n, ".ttf") || ends_with_ci(n, ".otf")
}

// The SVG files in the look's icon folders. Only *.svg files directly inside a folder are read.
fn icon_files(look_file: &Path, look: &mut Look) -> Vec<(String, Vec<u8>)> {
    let mut out = Vec::new();
    for d in look.icon_dirs.clone() {
        let Some(dir) = look_folder(look_file, &d) else {
            look.issues.push(LookIssue {
                line: 0,
                level: IssueLevel::Warn,
                msg: format!(
                    "icon folder not used: {d} (icondir must be a folder inside the folder that holds the look file)"
                ),
                file: None,
            });
            continue;
        };
        let skip = dir.to_string_lossy().len() + 1;
        for full in plain_files(
            &dir,
            is_svg,
            MAX_ICON_BYTES as u64,
            MAX_ICON_FILES - out.len(),
        ) {
            // a file that cannot be read after all is left out
            if let Ok(bytes) = std::fs::read(&full) {
                out.push((full.to_string_lossy()[skip..].to_string(), bytes));
            }
        }
    }
    out
}

pub fn with_icons(look_file: &Path, mut look: Look) -> Look {
    if look.icon_dirs.is_empty() {
        return look;
    }
    let files = icon_files(look_file, &mut look);
    with_icon_images(&look, files)
}

// The font files a look brings with its `fontdir` lines, and a note for every family the look
// names that neither those folders nor the bundled fonts provide.
pub fn look_fonts(look_file: Option<&Path>, look: &Look) -> (Vec<PathBuf>, Vec<String>) {
    let files: Vec<PathBuf> = match look_file {
        Some(lf) => look
            .font_dirs
            .iter()
            .flat_map(|d| {
                look_folder(lf, d)
                    .map_or_else(Vec::new, |dir| plain_files(&dir, is_font, 20_000_000, 200))
            })
            .collect(),
        None => Vec::new(),
    };
    let mut have: Vec<String> = crate::data::bundled_font_families().to_vec();
    for f in &files {
        if let Some(m) = std::fs::read(f).ok().and_then(|b| font_meta(&b)) {
            have.push(m.family.to_lowercase());
        }
    }
    const GENERIC: [&str; 5] = ["sans-serif", "serif", "monospace", "helvetica", "system-ui"];
    let mut missing: Vec<String> = Vec::new();
    for fam in look.fonts.values() {
        let low = fam.to_lowercase();
        if !missing.contains(fam) && !have.contains(&low) && !GENERIC.contains(&low.as_str()) {
            missing.push(fam.clone());
        }
    }
    (files, missing)
}

/// The look file's text, as `readFileSync(…, 'utf8')` reads it (a BOM kept, bad bytes as U+FFFD), or None when it
/// cannot be read or is over `MAX_LOOK_BYTES`.
fn read_text(full: &Path) -> Option<String> {
    if std::fs::metadata(full).ok()?.len() > MAX_LOOK_BYTES {
        return None;
    }
    std::fs::read(full)
        .ok()
        .map(|b| String::from_utf8_lossy(&b).into_owned())
}

/// `p.toLowerCase().endsWith('.look')`
fn is_look_path(p: &str) -> bool {
    p.to_lowercase().ends_with(".look")
}

// A diagram file is untrusted input, and its look path is read from disk and embedded in exports.
// Only files named *.look are ever read, so a diagram cannot pull in some other file.
// Returns the text, and whether the path was refused for not ending in .look.
pub fn read_look(file: &Path, p: Option<&str>) -> (Option<String>, bool) {
    let Some(p) = p.filter(|p| !p.is_empty()) else {
        return (None, false);
    };
    if !is_look_path(p) {
        return (None, true);
    }
    let full = resolve_all(&[&dirname(&file.to_string_lossy()), p]);
    (read_text(Path::new(&full)), false)
}

/// The scene of a diagram whose text is `src` and whose file is `file`, with its look read from disk.
pub fn load_scene(file: &Path, src: &str) -> Scene {
    let p = look_path(src);
    let (text, refused) = read_look(file, p.as_deref());
    let look_file = text.as_ref().map(|_| {
        resolve(
            Path::new(&dirname(&file.to_string_lossy())),
            p.as_deref().unwrap(),
        )
    });
    let look = text
        .as_deref()
        .zip(look_file.as_deref())
        .map(|(t, lf)| with_icons(lf, parse_look(t, p.as_deref().unwrap())));
    let mut sc = build_scene(src, look, &file.to_string_lossy());
    let (files, missing) = look_fonts(look_file.as_deref(), &sc.look);
    sc.font_files = Some(
        files
            .iter()
            .map(|f| f.to_string_lossy().into_owned())
            .collect(),
    );
    for fam in missing {
        sc.issues.push(LookIssue {
            line: 1,
            level: IssueLevel::Warn,
            msg: format!(
                "the look names the font \"{fam}\", but no TTF or OTF file for it was found, so text will be drawn in a fallback font; put its files in a folder next to the look and add  fontdir \"./fonts\"  to the look"
            ),
            file: None,
        });
    }
    if refused {
        let p = p.unwrap_or_default();
        for i in &mut sc.issues {
            if i.msg.starts_with("look file not found") {
                i.msg = format!("the look path must end in .look; \"{p}\" was not read");
            }
        }
    }
    sc
}

/// The text of the look file `p` names, read from the diagram's folder: `readLook` plus the 1 MB limit.
pub fn read_look_text(file: &Path, p: Option<&str>) -> Option<String> {
    read_look(file, p).0
}

// How a diagram at `file` names the look file `target`: a path from the diagram's folder.
pub fn look_ref_text(file: &Path, target: &Path) -> String {
    let rel =
        relative(&dirname(&file.to_string_lossy()), &target.to_string_lossy()).replace(SEP, "/");
    if rel.starts_with('.') || is_absolute(&rel) {
        rel
    } else {
        format!("./{rel}")
    }
}

/// The folder a look file's relative paths start from (`dirname(resolve(file))`).
pub fn folder_of(file: &Path) -> PathBuf {
    PathBuf::from(dirname(&file.to_string_lossy()))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A fresh folder under the system's temporary folder, removed when dropped.
    struct TempDir(PathBuf);
    impl TempDir {
        fn new(name: &str) -> TempDir {
            let dir =
                std::env::temp_dir().join(format!("fastdraw-render-{name}-{}", std::process::id()));
            let _ = std::fs::remove_dir_all(&dir);
            std::fs::create_dir_all(&dir).unwrap();
            TempDir(dir)
        }
        fn put(&self, rel: &str, bytes: &[u8]) -> PathBuf {
            let p = self.0.join(rel);
            std::fs::create_dir_all(p.parent().unwrap()).unwrap();
            std::fs::write(&p, bytes).unwrap();
            p
        }
    }
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn look_folders_stay_inside() {
        let t = TempDir::new("folders");
        let look = t.put("team.look", b"");
        t.put("icons/a.svg", b"<svg/>");
        t.put("plain.txt", b"");
        std::fs::create_dir_all(t.0.join("..odd")).unwrap();
        let outside = TempDir::new("folders-outside");
        assert_eq!(
            look_folder(&look, "./icons"),
            Some(PathBuf::from(path_string(&t.0.join("icons"))))
        );
        assert_eq!(
            look_folder(&look, "icons/"),
            Some(PathBuf::from(path_string(&t.0.join("icons"))))
        );
        assert_eq!(
            look_folder(&look, "."),
            Some(PathBuf::from(path_string(&t.0)))
        );
        assert_eq!(look_folder(&look, "/abs"), None);
        assert_eq!(look_folder(&look, "C:\\abs"), None);
        assert_eq!(look_folder(&look, "../out"), None);
        assert_eq!(look_folder(&look, "./plain.txt"), None);
        assert_eq!(look_folder(&look, "./missing"), None);
        // relative() starts with "..": refused like a folder outside
        assert_eq!(look_folder(&look, "./..odd"), None);
        let link = t.0.join("link");
        #[cfg(unix)]
        let linked = std::os::unix::fs::symlink(&outside.0, &link).is_ok();
        #[cfg(windows)]
        let linked = std::os::windows::fs::symlink_dir(&outside.0, &link).is_ok();
        if linked {
            assert_eq!(look_folder(&look, "./link"), None);
        }
    }

    #[test]
    fn plain_files_in_order() {
        let t = TempDir::new("plain");
        for n in ["b.svg", "C.svg", "a.SVG", "é.svg", "z.svg", "note.txt"] {
            t.put(n, b"<svg/>");
        }
        t.put("big.svg", &[b' '; 101]);
        std::fs::create_dir_all(t.0.join("dir.svg")).unwrap();
        let dir = PathBuf::from(path_string(&t.0));
        let names = |v: Vec<PathBuf>| -> Vec<String> {
            v.iter()
                .map(|p| p.file_name().unwrap().to_string_lossy().into_owned())
                .collect()
        };
        // UTF-16 order; the big file, the folder and other extensions skipped
        assert_eq!(
            names(plain_files(&dir, is_svg, 100, 100)),
            ["C.svg", "a.SVG", "b.svg", "z.svg", "é.svg"]
        );
        // the limit counts the files taken
        assert_eq!(names(plain_files(&dir, is_svg, 100, 2)), ["C.svg", "a.SVG"]);
        assert_eq!(
            names(plain_files(&dir, is_svg, 100, 0)),
            Vec::<String>::new()
        );
        assert_eq!(
            plain_files(&dir, is_svg, 100, 1)[0].to_string_lossy(),
            format!("{}{SEP}C.svg", dir.to_string_lossy())
        );
    }

    #[test]
    fn look_files_are_read_with_limits() {
        let t = TempDir::new("read");
        let diagram = t.0.join("d.fdraw");
        t.put("x.txt", b"color ink #000");
        t.put("ok.look", b"color ink #000");
        t.put("big.look", &vec![b' '; 1_000_001]);
        t.put("edge.look", &vec![b' '; 1_000_000]);
        t.put("bad.look", &[0xff, 0xfe, 0x41]);
        assert_eq!(read_look(&diagram, Some("./x.txt")), (None, true));
        assert_eq!(read_look(&diagram, None), (None, false));
        assert_eq!(read_look(&diagram, Some("")), (None, false));
        assert!(!read_look(&diagram, Some("./ok.LOOK")).1);
        assert_eq!(
            read_look(&diagram, Some("./ok.look")),
            (Some("color ink #000".into()), false)
        );
        assert_eq!(read_look(&diagram, Some("./missing.look")), (None, false));
        assert_eq!(read_look(&diagram, Some("./big.look")), (None, false));
        assert_eq!(
            read_look(&diagram, Some("./edge.look")).0.map(|s| s.len()),
            Some(1_000_000)
        );
        // bad bytes as U+FFFD, the way Node's readFileSync(…, 'utf8') reads them; parses without a panic
        let bad = read_look(&diagram, Some("./bad.look")).0.unwrap();
        assert_eq!(bad, "\u{FFFD}\u{FFFD}A");
        let _ = parse_look(&bad, "./bad.look");
    }

    #[test]
    fn paths_as_node_writes_them() {
        if WINDOWS {
            assert_eq!(resolve_all(&["c:/x/./y/../z/", "a\\\\b/"]), r"c:\x\z\a\b");
            assert_eq!(resolve_all(&[r"C:\x", "/y"]), r"C:\y");
            assert_eq!(resolve_all(&[r"C:\x", "D:y"]), r"D:\y");
            assert_eq!(resolve_all(&[r"C:\x", "C:y"]), r"C:\x\y");
            assert_eq!(resolve_all(&[r"\\srv\sh\a", r"..\..\b"]), r"\\srv\sh\b");
            assert_eq!(relative(r"C:\a\b", r"c:\A\c\d"), r"..\c\d");
            assert_eq!(relative(r"C:\a", r"D:\b"), r"D:\b");
            assert_eq!(relative(r"C:\a", r"C:\a"), "");
            assert!(
                !is_absolute("C:abs")
                    && is_absolute("/abs")
                    && is_absolute(r"C:\abs")
                    && is_absolute("C:/x")
            );
            assert_eq!(strip_verbatim(r"\\?\C:\x"), r"C:\x");
            assert_eq!(strip_verbatim(r"\\?\UNC\srv\sh"), r"\\srv\sh");
            assert_eq!(
                look_ref_text(Path::new(r"C:\d\a.fdraw"), Path::new(r"C:\d\looks\n.look")),
                "./looks/n.look"
            );
            assert_eq!(
                look_ref_text(Path::new(r"C:\d\e\a.fdraw"), Path::new(r"C:\d\n.look")),
                "../n.look"
            );
            assert_eq!(
                look_ref_text(Path::new(r"C:\d\a.fdraw"), Path::new(r"D:\n.look")),
                "D:/n.look"
            );
        } else {
            assert_eq!(resolve_all(&["/x/./y/../z/", "a//b/"]), "/x/z/a/b");
            assert_eq!(resolve_all(&["/x", "/y", ".."]), "/");
            assert_eq!(relative("/a/b", "/a/c/d"), "../c/d");
            assert_eq!(
                look_ref_text(Path::new("/d/a.fdraw"), Path::new("/d/looks/n.look")),
                "./looks/n.look"
            );
        }
        // relative paths start from the current folder
        assert_eq!(path_string(Path::new("x")), format!("{}{SEP}x", cwd()));
    }

    #[test]
    fn fonts_of_a_look() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../examples/look-test");
        let lf = PathBuf::from(path_string(&root.join("fira.look")));
        let look = parse_look(&std::fs::read_to_string(&lf).unwrap(), "./fira.look");
        let (files, missing) = look_fonts(Some(&lf), &look);
        let names: Vec<_> = files
            .iter()
            .map(|f| f.file_name().unwrap().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, ["FiraSans-Regular.ttf", "FiraSans-SemiBold.ttf"]);
        assert!(missing.is_empty(), "{missing:?}");
        // without the look file, the folder is not read and Fira Sans is missing; generic and bundled families never are
        let mut look = look;
        look.fonts.insert("x".into(), "Geist".into());
        look.fonts.insert("y".into(), "Sans-Serif".into());
        look.fonts.insert("z".into(), "Fira Sans".into());
        let (files, missing) = look_fonts(None, &look);
        assert!(files.is_empty());
        assert_eq!(missing, ["Fira Sans"]);
    }

    #[test]
    fn icon_folders() {
        let t = TempDir::new("icons");
        let lf = t.put("t.look", b"");
        t.put("icons/Load Balancer.svg", b"<svg></svg>");
        t.put("icons/x.txt", b"<svg></svg>");
        let mut look = parse_look("icondir \"./icons\"\nicondir \"../out\"", "./t.look");
        look.issues.clear();
        let out = with_icons(&lf, look);
        assert_eq!(out.images.keys().collect::<Vec<_>>(), ["load-balancer"]);
        assert_eq!(out.issues.len(), 1);
        assert_eq!(
            out.issues[0].msg,
            "icon folder not used: ../out (icondir must be a folder inside the folder that holds the look file)"
        );
        // no icon folders: the look as it is
        let plain = with_icons(&lf, parse_look("", "x"));
        assert!(plain.images.is_empty() && plain.issues.is_empty());
    }
}
