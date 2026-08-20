//! 画像出力の入口（Tauri command）。
//!
//! 撮る中身は OS ごとに別物なので、ここは「どこへ置くか」だけを持つ。
//!
//! `export_html` と同じ約束で、**出力先はフロントから受け取らない**。受け取るのは元の
//! 文書の相対パスだけで、置き場はその拡張子を画像のものに替えて機械的に決める。
//! 出力先を渡せる作りにすると、任意の場所へ任意のバイト列を置ける口が空く。

use std::path::Path;

use tauri::Manager;

use crate::capture_logic::{extension, safe_file_stem, validate, ShotSpec};
use crate::workspace::resolve_in_root;

/// 撮った結果を置く。戻すのは表示用の相対パス。
///
/// `name` は一括生成のときだけ入る（表の 1 行から決まる出す名前）。**入っていても
/// 使うのは名前の部分だけ**で、置き場は元の文書と同じフォルダから動かない。
fn place(
    root: &Path,
    rel_path: &str,
    name: Option<&str>,
    spec: &ShotSpec,
    bytes: &[u8],
) -> Result<String, String> {
    let source = resolve_in_root(root, rel_path)?;
    let target = match name {
        None => source.with_extension(extension(&spec.format)),
        Some(name) => {
            let stem = safe_file_stem(name)?;
            source
                .parent()
                .ok_or_else(|| "置き場が分かりません".to_string())?
                .join(format!("{stem}.{}", extension(&spec.format)))
        }
    };
    std::fs::write(&target, bytes).map_err(|error| format!("書き出し失敗: {error}"))?;

    let canon_root =
        std::fs::canonicalize(root).map_err(|error| format!("ルート解決失敗: {error}"))?;
    Ok(target
        .strip_prefix(&canon_root)
        .map(|path| path.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| target.to_string_lossy().to_string()))
}

/// HTML を画像にして、元の文書の隣へ置く。
///
/// `html` はフロントが組み立てたプレビューそのもの。`spec` は寸法・倍率・形式。
#[tauri::command]
pub fn export_image(
    app: tauri::AppHandle,
    root: String,
    rel_path: String,
    html: String,
    spec: ShotSpec,
    name: Option<String>,
) -> Result<String, String> {
    // 撮る前に断れるものは断る。道具を立ち上げてから断ると原因が分かりにくい。
    validate(&spec)?;
    // 名前も撮る前に見る。100 枚の途中で名前だけを理由に止まると、
    // どこまで出たかを数え直すことになる。
    if let Some(name) = name.as_deref() {
        safe_file_stem(name)?;
    }

    let bytes = shoot(&app, &html, &spec)?;
    place(Path::new(&root), &rel_path, name.as_deref(), &spec, &bytes)
}

#[cfg(windows)]
fn shoot(app: &tauri::AppHandle, html: &str, spec: &ShotSpec) -> Result<Vec<u8>, String> {
    // 撮影用の WebView2 が使う作業場所。アプリの持ち物の中に置く。
    let work = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("作業場所が分かりません: {error}"))?
        .join("capture");
    crate::capture_win::capture(html, spec, &work)
}

#[cfg(not(windows))]
fn shoot(_app: &tauri::AppHandle, _html: &str, _spec: &ShotSpec) -> Result<Vec<u8>, String> {
    Err("この OS ではまだ画像を出せません。".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::capture_logic::ImageFormat;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU32, Ordering};

    struct TempRoot {
        path: PathBuf,
    }

    impl TempRoot {
        fn new(tag: &str) -> Self {
            static N: AtomicU32 = AtomicU32::new(0);
            let n = N.fetch_add(1, Ordering::SeqCst);
            let path =
                std::env::temp_dir().join(format!("mdbiz_{}_{}_{}", tag, std::process::id(), n));
            std::fs::create_dir_all(&path).expect("temp ルート作成");
            TempRoot { path }
        }

        fn file(&self, rel: &str, body: &str) {
            let p = self.path.join(rel);
            if let Some(parent) = p.parent() {
                std::fs::create_dir_all(parent).expect("親ディレクトリ作成");
            }
            std::fs::write(&p, body).expect("ファイル書き込み");
        }
    }

    impl Drop for TempRoot {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    fn png() -> ShotSpec {
        ShotSpec {
            width: 1200,
            height: 630,
            scale: 1.0,
            format: ImageFormat::Png { transparent: false },
        }
    }

    #[test]
    fn 名前を指さなければ元の文書の隣へ同じ名前で置く() {
        let root = TempRoot::new("place_default");
        root.file("docs/告知.md", "x");
        let out = place(&root.path, "docs/告知.md", None, &png(), b"PNG").expect("置けるはず");
        assert_eq!(out, "docs/告知.png");
        assert_eq!(
            std::fs::read(root.path.join("docs/告知.png")).expect("読める"),
            b"PNG"
        );
    }

    #[test]
    fn 名前を指すと同じフォルダの中でその名前になる() {
        let root = TempRoot::new("place_named");
        root.file("docs/雛形.md", "x");
        let out =
            place(&root.path, "docs/雛形.md", Some("春の新商品"), &png(), b"PNG").expect("置ける");
        assert_eq!(out, "docs/春の新商品.png");
        assert!(root.path.join("docs/春の新商品.png").exists());
        // 雛形そのものは触らない。
        assert!(!root.path.join("docs/雛形.png").exists());
    }

    #[test]
    fn 名前で外へ出ようとしたら置かない() {
        let root = TempRoot::new("place_escape");
        root.file("docs/雛形.md", "x");
        for name in ["../外", "サブ/中", ".."] {
            assert!(place(&root.path, "docs/雛形.md", Some(name), &png(), b"PNG").is_err());
        }
        assert!(!root.path.join("外.png").exists());
    }
}
