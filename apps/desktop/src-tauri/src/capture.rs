//! 画像出力の入口（Tauri command）。
//!
//! 撮る中身は OS ごとに別物なので、ここは「どこへ置くか」だけを持つ。
//!
//! `export_html` と同じ約束で、**出力先はフロントから受け取らない**。受け取るのは元の
//! 文書の相対パスだけで、置き場はその拡張子を画像のものに替えて機械的に決める。
//! 出力先を渡せる作りにすると、任意の場所へ任意のバイト列を置ける口が空く。

use std::path::Path;

use tauri::Manager;

use crate::capture_logic::{extension, validate, ShotSpec};
use crate::workspace::resolve_in_root;

/// 撮った結果を置く。戻すのは表示用の相対パス。
fn place(root: &Path, rel_path: &str, spec: &ShotSpec, bytes: &[u8]) -> Result<String, String> {
    let source = resolve_in_root(root, rel_path)?;
    let target = source.with_extension(extension(&spec.format));
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
) -> Result<String, String> {
    // 撮る前に断れるものは断る。道具を立ち上げてから断ると原因が分かりにくい。
    validate(&spec)?;

    let bytes = shoot(&app, &html, &spec)?;
    place(Path::new(&root), &rel_path, &spec, &bytes)
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
