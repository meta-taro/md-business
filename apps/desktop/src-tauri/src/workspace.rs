//! 文書ワークスペースの Tauri コマンド（DOC-SPEC-DESKTOP-2026-0001 §5 / §8）。
//!
//! `scan_documents` … ルート配下を再帰走査し、正本（`.md` / `.tsv`）と参考データ
//!                     （`.json` / `.xml`）を相対パスで返す。
//! `read_document`  … 上記の単一ファイルを UTF-8 で読む（パストラバーサル防止）。
//! 書き込み（`write_document` / `create_document`）は正本の `.md` / `.tsv` のみ。
//!
//! Tauri ランタイムに依存しない純関数（`*_impl`）へロジックを寄せ、`#[cfg(test)]`
//! から実 FS（temp ディレクトリ）に対して単体テストする。`#[tauri::command]` 側は
//! 薄いラッパに徹する（§7.3「ロジックを純関数へ抽出し単体化」）。

use serde::{Deserialize, Serialize};
use std::path::{Component, Path, PathBuf};
use tauri::State;

use crate::watch::{record_self_write, WatchState};

/// 走査で得た 1 ファイル。`rel_path` はルートからの相対パスで区切りは "/" に正規化済み。
/// serde は camelCase 化してフロント（`{ relPath, name, ext }`）と一致させる。
#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DocEntry {
    pub rel_path: String,
    pub name: String,
    pub ext: String,
}

/// 走査結果。`truncated` は深さ / 件数上限で打ち切った場合に true。
#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub entries: Vec<DocEntry>,
    pub truncated: bool,
}

/// 書き込める拡張子（小文字比較）。正本は `.md` + `.tsv` だけ（設計書 §1.3）。
const WRITABLE_EXTS: [&str; 2] = ["md", "tsv"];
/// 走査・読み取りの対象拡張子（小文字比較）。正本に加えて、参考データの `.json` / `.xml`。
/// 読めるが書けない——書き込みは `WRITABLE_EXTS` が別に塞ぐ。
/// ファイル監視（watch_logic）でも同じ対象範囲を共有する。
pub(crate) const ALLOWED_EXTS: [&str; 4] = ["md", "tsv", "json", "xml"];
/// ディレクトリのネスト上限（設計書 §3.2）。超過分は打ち切り truncated=true。
const MAX_DEPTH: usize = 12;
/// 収集ファイル数の上限（設計書 §3.2）。超過分は打ち切り truncated=true。
const MAX_ENTRIES: usize = 5_000;

/// 走査から除外するディレクトリ名。ドット始まり（`.git` 等）と既知のビルド生成物。
/// 走査（scan）とファイル監視（watch_logic）で同じ除外判定を共有する。
pub(crate) fn is_excluded_dir(name: &str) -> bool {
    name.starts_with('.') || matches!(name, "node_modules" | "dist" | "build")
}

/// パスの拡張子を小文字化して返す。拡張子なしは None。
fn lower_ext(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
}

/// パスの拡張子が走査・読み取りの対象なら小文字化して返す。対象外・拡張子なしは None。
fn allowed_ext(path: &Path) -> Option<String> {
    lower_ext(path).filter(|e| ALLOWED_EXTS.contains(&e.as_str()))
}

/// 書き込んでよい拡張子か。参考データ（`.json` / `.xml`）はここで落ちる。
fn is_writable_ext(path: &Path) -> bool {
    lower_ext(path).is_some_and(|e| WRITABLE_EXTS.contains(&e.as_str()))
}

/// ルート配下の既存ファイルを解決する（読み取り系コマンドの入口ゲート）。
///
/// `canonicalize` 後に root 配下判定して `../` / シンボリックリンク脱出を封じ、拡張子を
/// 走査対象（`ALLOWED_EXTS`）に限る。ツリーに出ていないファイルを相対パス指定で読ませない。
pub(crate) fn resolve_in_root(root: &Path, rel_path: &str) -> Result<PathBuf, String> {
    let canon_root = std::fs::canonicalize(root).map_err(|e| format!("ルート解決失敗: {}", e))?;
    let canon = std::fs::canonicalize(root.join(rel_path))
        .map_err(|e| format!("ファイル解決失敗: {}", e))?;
    if !canon.starts_with(&canon_root) {
        return Err("ルート外へのアクセスは拒否されます".to_string());
    }
    if allowed_ext(&canon).is_none() {
        return Err("対象は .md / .tsv / .json / .xml のみです".to_string());
    }
    Ok(canon)
}

/// ルート配下を再帰走査し、対象拡張子（`ALLOWED_EXTS`）を収集する（Tauri 非依存の実体）。
/// 除外ディレクトリはスキップし、深さ / 件数上限で打ち切って truncated=true を返す。
pub fn scan_documents_impl(root: &Path) -> Result<ScanResult, String> {
    if !root.is_dir() {
        return Err(format!(
            "ルートがディレクトリではありません: {}",
            root.display()
        ));
    }
    let mut entries: Vec<DocEntry> = Vec::new();
    let mut truncated = false;
    walk(root, root, 0, &mut entries, &mut truncated)?;
    // readdir 順は OS 依存のため rel_path で安定ソート（フロント buildTree でも再ソートするが決定化しておく）。
    entries.sort_by(|a, b| a.rel_path.cmp(&b.rel_path));
    Ok(ScanResult { entries, truncated })
}

/// `dir`（深さ `depth`）配下を再帰し、対象拡張子のファイルを `out` に収集する。
/// 除外ディレクトリはスキップ、深さ / 件数超過は `truncated` を立てて打ち切る。
fn walk(
    root: &Path,
    dir: &Path,
    depth: usize,
    out: &mut Vec<DocEntry>,
    truncated: &mut bool,
) -> Result<(), String> {
    let read_dir = std::fs::read_dir(dir)
        .map_err(|e| format!("ディレクトリ読み取り失敗 {}: {}", dir.display(), e))?;
    // readdir を一旦集めてパス順に並べる（決定的な走査順）。
    let mut children: Vec<PathBuf> = read_dir.filter_map(|r| r.ok()).map(|e| e.path()).collect();
    children.sort();

    for path in children {
        if out.len() >= MAX_ENTRIES {
            *truncated = true;
            return Ok(());
        }
        let file_name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue, // 非 UTF-8 名はスキップ
        };

        if path.is_dir() {
            if is_excluded_dir(&file_name) {
                continue;
            }
            if depth + 1 > MAX_DEPTH {
                // 上限より深い階層は辿らず打ち切り。
                *truncated = true;
                continue;
            }
            walk(root, &path, depth + 1, out, truncated)?;
        } else if path.is_file() {
            if let Some(ext) = allowed_ext(&path) {
                let rel = path
                    .strip_prefix(root)
                    .map_err(|e| format!("相対パス化失敗: {}", e))?;
                let rel_path = rel.to_string_lossy().replace('\\', "/");
                out.push(DocEntry {
                    rel_path,
                    name: file_name,
                    ext,
                });
            }
        }
    }
    Ok(())
}

/// ルートと相対パスを結合・正規化し、root 配下の対象拡張子のみ UTF-8 で読む（Tauri 非依存の実体）。
/// `canonicalize` 後に root 配下判定（`../` / シンボリックリンク脱出を封じる・設計書 §8.1）。
pub fn read_document_impl(root: &Path, rel_path: &str) -> Result<String, String> {
    let canon_root = std::fs::canonicalize(root).map_err(|e| format!("ルート解決失敗: {}", e))?;
    let canon = std::fs::canonicalize(root.join(rel_path))
        .map_err(|e| format!("ファイル解決失敗: {}", e))?;
    if !canon.starts_with(&canon_root) {
        return Err("ルート外へのアクセスは拒否されます".to_string());
    }
    if allowed_ext(&canon).is_none() {
        return Err("開けるのは .md / .tsv / .json / .xml のみです".to_string());
    }
    let bytes = std::fs::read(&canon).map_err(|e| format!("読み取り失敗: {}", e))?;
    String::from_utf8(bytes).map_err(|_| "UTF-8 として不正なファイルです".to_string())
}

/// ルート配下の正本（md/tsv）へ UTF-8 本文を書き戻す（Tauri 非依存の実体）。
/// read と同じく canonicalize 後に root 配下判定でパストラバーサル（`../` / シンボリック
/// リンク脱出）を封じ、対象は既存の `.md` / `.tsv` に限定する（参考データの `.json` / `.xml` は
/// 読めても書けない）。新規作成は `create_document` の担当で、canonicalize は実在ファイルに
/// のみ成功するため、存在しない相対パスは Err。
pub fn write_document_impl(root: &Path, rel_path: &str, content: &str) -> Result<(), String> {
    let canon_root = std::fs::canonicalize(root).map_err(|e| format!("ルート解決失敗: {}", e))?;
    let canon = std::fs::canonicalize(root.join(rel_path))
        .map_err(|e| format!("ファイル解決失敗: {}", e))?;
    if !canon.starts_with(&canon_root) {
        return Err("ルート外へのアクセスは拒否されます".to_string());
    }
    if !is_writable_ext(&canon) {
        return Err("書き込めるのは .md / .tsv のみです".to_string());
    }
    std::fs::write(&canon, content).map_err(|e| format!("書き込み失敗: {}", e))
}

/// ルート配下に新規の正本（md/tsv）を作成する（Tauri 非依存の実体）。
///
/// 新規ファイルは `canonicalize` できないため、**親ディレクトリ**を canonicalize して
/// root 配下判定する（`../` / シンボリックリンク脱出を封じる）。親は既存であることを要求し
/// （MVP は中間ディレクトリを自動生成しない）、拡張子は `.md` / `.tsv` に限定、既存同名は
/// 上書きせず Err（`write_document` と役割分担）。
pub fn create_document_impl(root: &Path, rel_path: &str, content: &str) -> Result<(), String> {
    let canon_root = std::fs::canonicalize(root).map_err(|e| format!("ルート解決失敗: {}", e))?;
    let target = canon_root.join(rel_path);

    // 拡張子ゲート（作成しようとするファイル名で判定）。
    if !is_writable_ext(&target) {
        return Err("作成できるのは .md / .tsv のみです".to_string());
    }

    // 親ディレクトリを解決し root 配下か判定（新規ファイル自体は canonicalize できないため）。
    let parent = target
        .parent()
        .ok_or_else(|| "親ディレクトリが不正です".to_string())?;
    let canon_parent =
        std::fs::canonicalize(parent).map_err(|e| format!("保存先フォルダ解決失敗: {}", e))?;
    if !canon_parent.starts_with(&canon_root) {
        return Err("ルート外へのアクセスは拒否されます".to_string());
    }

    // ファイル名部分を解決済み親へ結合（`..` はファイル名にならず None → Err）。
    let file_name = target
        .file_name()
        .ok_or_else(|| "ファイル名が不正です".to_string())?;
    let final_path = canon_parent.join(file_name);

    // 新規作成専用。既存は上書きしない。
    if final_path.exists() {
        return Err("同名ファイルが既に存在します".to_string());
    }

    std::fs::write(&final_path, content).map_err(|e| format!("書き込み失敗: {}", e))
}

/// ルート配下のファイル / フォルダの名前を変更する（Tauri 非依存の実体）。
///
/// 受け取るのは「名前だけ」で、移動には使わせない（区切り文字・`.` / `..` を拒否）。対象は
/// `canonicalize` 後に root 配下判定してパストラバーサルを封じ、ファイルなら変更後も走査対象の
/// 拡張子を要求する（拡張子を変えると走査対象から外れ、ツリーから消えて行方不明になるため）。
/// 正本（`.md` / `.tsv`）と参考データ（`.json` / `.xml`）をまたぐ改名も拒否する（書ける /
/// 書けないが入れ替わるため）。既存の名前とぶつかる場合は上書きせず Err。戻り値は走査と同じ "/" 区切りの
/// 新しい相対パス（呼び出し側が開き直しに使う）。
pub fn rename_entry_impl(root: &Path, rel_path: &str, new_name: &str) -> Result<String, String> {
    let name = new_name.trim();
    if name.is_empty() {
        return Err("名前を入力してください".to_string());
    }
    if name.contains('/') || name.contains('\\') {
        return Err("名前に区切り文字は使えません".to_string());
    }
    if name == "." || name == ".." {
        return Err("その名前は使えません".to_string());
    }
    // OS が受け付けない文字は、分かりにくい OS エラーになる前に理由を付けて返す。
    if name.contains(|c: char| matches!(c, ':' | '*' | '?' | '"' | '<' | '>' | '|') || c.is_control())
    {
        return Err("名前に使えない文字が含まれています".to_string());
    }

    let canon_root = std::fs::canonicalize(root).map_err(|e| format!("ルート解決失敗: {}", e))?;
    let canon =
        std::fs::canonicalize(root.join(rel_path)).map_err(|e| format!("対象の解決失敗: {}", e))?;
    // ルート自身の改名は、開いているフォルダごと足元を崩すので対象外。
    if !canon.starts_with(&canon_root) || canon == canon_root {
        return Err("ルート外へのアクセスは拒否されます".to_string());
    }

    let is_dir = canon.is_dir();
    if !is_dir {
        let new_path = Path::new(name);
        if allowed_ext(&canon).is_none() || allowed_ext(new_path).is_none() {
            return Err("対応拡張子は .md / .tsv / .json / .xml のみです".to_string());
        }
        // 正本（書ける）と参考データ（読むだけ）をまたぐ改名は拒否する。またげてしまうと、
        // 開いたままの文書が保存できなくなったり、逆に読むだけのはずの資料が書けるようになる。
        if is_writable_ext(&canon) != is_writable_ext(new_path) {
            return Err("正本（.md / .tsv）と参考データ（.json / .xml）はまたげません".to_string());
        }
    }

    let target = canon
        .parent()
        .ok_or_else(|| "親ディレクトリが不正です".to_string())?
        .join(name);
    // 大文字小文字を区別しない FS では、綴りだけ直す改名も「既存」に見える。同じ実体なら通す。
    let same_entry = std::fs::canonicalize(&target)
        .map(|t| t == canon)
        .unwrap_or(false);
    if target.exists() && !same_entry {
        return Err("同じ名前が既に存在します".to_string());
    }

    std::fs::rename(&canon, &target).map_err(|e| format!("名前の変更に失敗: {}", e))?;

    let rel = target
        .strip_prefix(&canon_root)
        .map_err(|_| "相対パスの組み立てに失敗しました".to_string())?;
    Ok(rel
        .components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join("/"))
}

/// パスが今も開けるディレクトリかを返す。
///
/// 履歴に残したフォルダは、移動・削除・外付けや共有ドライブの切断で消えることがある。
/// 開いてから走査エラーで気付かせるのではなく、一覧の時点で開けないものを示すために使う。
/// 走査と違い中身は見ないので、件数の多い履歴でも一覧表示のたびに呼べる。
pub fn directory_exists_impl(path: &Path) -> bool {
    path.is_dir()
}

/// 文書と同じ場所へ HTML を書き出す（Tauri 非依存の実体）。成功で書き出し先の相対パス。
///
/// **出力先はフロントから受け取らない。** 受け取るのは元の `.md` の相対パスだけで、
/// 書き出し先はその拡張子を `.html` に替えて機械的に決める。出力先を渡せる作りにすると、
/// 書き込める場所がプレビューの持ち主より広くなる（`.md` しか書けない `write_document`
/// の脇に、任意の場所へ任意の中身を置ける口が空く）。
///
/// 生成物なので既存の `.html` は上書きする。作り直すたびに別名が増えるほうが困る。
pub fn export_html_impl(root: &Path, rel_path: &str, html: &str) -> Result<String, String> {
    let source = resolve_in_root(root, rel_path)?;
    if lower_ext(&source).as_deref() != Some("md") {
        return Err("HTML にできるのは .md のみです".to_string());
    }
    let target = source.with_extension("html");
    std::fs::write(&target, html).map_err(|e| format!("書き出し失敗: {}", e))?;

    // 表示用に相対パスへ戻す。resolve_in_root が root 配下を保証済み。
    let canon_root = std::fs::canonicalize(root).map_err(|e| format!("ルート解決失敗: {}", e))?;
    Ok(target
        .strip_prefix(&canon_root)
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| target.to_string_lossy().to_string()))
}

/// フロントから `invoke("export_html", { root, relPath, html })` で呼ぶ薄いラッパ。
/// 成功で書き出し先の相対パス、失敗はメッセージ。
#[tauri::command]
pub fn export_html(root: String, rel_path: String, html: String) -> Result<String, String> {
    export_html_impl(Path::new(&root), &rel_path, &html)
}

/// 静的サイトの書き出し先フォルダ名（ルート直下）。走査の除外対象でもあるので、
/// ここへ書いても文書ツリーには出てこない（＝生成物が正本に混ざらない）。
const SITE_DIR: &str = "dist";

/// サイトに置ける拡張子。ページと書式だけ。ここを広げると、任意の中身を任意の名前で
/// 置ける口になる（画像は今のところ運ぶ実体が無い——プレビューが通さないため）。
const SITE_EXTS: [&str; 2] = ["html", "css"];

/// 書き出す 1 ファイル。`path` は `dist/` から見た相対パス（`/` 区切り）。
#[derive(Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct SiteFile {
    pub path: String,
    pub content: String,
}

/// 書き出しの結果。どこへ何件置いたかだけ返す。
#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
pub struct SiteWriteResult {
    pub dir: String,
    pub count: usize,
}

/// サイト内の相対パスとして受け付けてよいか確かめ、`dist/` からの相対パスを返す。
///
/// 通すのは「普通の名前」だけ。`..`（上へ出る）・先頭の `/`（絶対）・`C:`（ドライブ指定）は
/// いずれも `Component::Normal` にならないので、この一点で塞げる。
fn site_relative_path(path: &str) -> Result<PathBuf, String> {
    let normalized = path.replace('\\', "/");
    let candidate = Path::new(&normalized);
    if !candidate
        .components()
        .all(|c| matches!(c, Component::Normal(_)))
    {
        return Err(format!("サイト内に置けない場所を指しています: {}", path));
    }
    match lower_ext(candidate) {
        Some(ext) if SITE_EXTS.contains(&ext.as_str()) => Ok(candidate.to_path_buf()),
        _ => Err(format!(
            "サイトに置けるのは .html / .css のみです: {}",
            path
        )),
    }
}

/// 開いているフォルダの `dist/` へサイト一式を書き出す（Tauri 非依存の実体）。
///
/// 単一 HTML 書き出しと同じく、**出力先はフロントから受け取らない**。受け取るのは
/// `dist/` の中での相対パスだけで、その手前は常にルート直下の `dist/` に固定する。
///
/// 既にあるファイルは上書きするが、**もう作られなかったファイルは消さない**。`dist/` は
/// 他のビルド成果物の置き場でもありうるので、こちらの判断でフォルダごと掃除しない。
/// （消えた文書のページが残る場合は、利用者が `dist/` を消してから出し直す）
pub fn export_site_impl(root: &Path, files: &[SiteFile]) -> Result<SiteWriteResult, String> {
    if files.is_empty() {
        return Err("書き出すページがありません".to_string());
    }
    let canon_root = std::fs::canonicalize(root).map_err(|e| format!("ルート解決失敗: {}", e))?;
    if !canon_root.is_dir() {
        return Err("ルートがディレクトリではありません".to_string());
    }

    // 先に全部確かめる。途中まで書いてから断ると、混ざった状態の dist/ が残る。
    let targets = files
        .iter()
        .map(|file| {
            site_relative_path(&file.path)
                .map(|rel| (canon_root.join(SITE_DIR).join(rel), &file.content))
        })
        .collect::<Result<Vec<_>, String>>()?;

    for (target, content) in &targets {
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("フォルダ作成失敗 {}: {}", parent.display(), e))?;
        }
        std::fs::write(target, content)
            .map_err(|e| format!("書き出し失敗 {}: {}", target.display(), e))?;
    }

    Ok(SiteWriteResult {
        dir: SITE_DIR.to_string(),
        count: targets.len(),
    })
}

/// フロントから `invoke("export_site", { root, files })` で呼ぶ薄いラッパ。
#[tauri::command]
pub fn export_site(root: String, files: Vec<SiteFile>) -> Result<SiteWriteResult, String> {
    export_site_impl(Path::new(&root), &files)
}

/// フロントから `invoke("scan_documents", { root })` で呼ぶ薄いラッパ。
#[tauri::command]
pub fn scan_documents(root: String) -> Result<ScanResult, String> {
    scan_documents_impl(Path::new(&root))
}

/// フロントから `invoke("directory_exists", { path })` で呼ぶ薄いラッパ。
#[tauri::command]
pub fn directory_exists(path: String) -> bool {
    directory_exists_impl(Path::new(&path))
}

/// フロントから `invoke("read_document", { root, relPath })` で呼ぶ薄いラッパ。
/// Tauri が camelCase(`relPath`) → snake_case(`rel_path`) を自動変換する。
#[tauri::command]
pub fn read_document(root: String, rel_path: String) -> Result<String, String> {
    read_document_impl(Path::new(&root), &rel_path)
}

/// フロントから `invoke("write_document", { root, relPath, content })` で呼ぶ薄いラッパ。
/// 保存成功後に、その canonical パスを自己書き込みとして記録し、監視のエコー（自分の保存が
/// watcher で跳ね返って再読込・再走査される）を抑制する。
#[tauri::command]
pub fn write_document(
    state: State<WatchState>,
    root: String,
    rel_path: String,
    content: String,
) -> Result<(), String> {
    let root_path = Path::new(&root);
    write_document_impl(root_path, &rel_path, &content)?;
    if let Ok(canon) = std::fs::canonicalize(root_path.join(&rel_path)) {
        record_self_write(&state, canon);
    }
    Ok(())
}

/// フロントから `invoke("create_document", { root, relPath, content })` で呼ぶ薄いラッパ。
/// 新規検証シート（テンプレ）作成に使う。既存は上書きしない（`write_document` と分担）。
/// 作成成功後は自己書き込みとして記録し、監視のエコーを抑制する。
#[tauri::command]
pub fn create_document(
    state: State<WatchState>,
    root: String,
    rel_path: String,
    content: String,
) -> Result<(), String> {
    let root_path = Path::new(&root);
    create_document_impl(root_path, &rel_path, &content)?;
    if let Ok(canon) = std::fs::canonicalize(root_path.join(&rel_path)) {
        record_self_write(&state, canon);
    }
    Ok(())
}

/// フロントから `invoke("rename_entry", { root, relPath, newName })` で呼ぶ薄いラッパ。
/// 左レールの右クリックメニュー「名前の変更」から使う。戻り値は新しい相対パス。
#[tauri::command]
pub fn rename_entry(root: String, rel_path: String, new_name: String) -> Result<String, String> {
    rename_entry_impl(Path::new(&root), &rel_path, &new_name)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    /// テスト専用の一意な temp ルート。Drop で後始末する。
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

        fn file(&self, rel: &str, body: &str) -> PathBuf {
            let p = self.path.join(rel);
            if let Some(parent) = p.parent() {
                std::fs::create_dir_all(parent).expect("親ディレクトリ作成");
            }
            std::fs::write(&p, body).expect("ファイル書き込み");
            p
        }
    }

    impl Drop for TempRoot {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    fn rel_paths(result: &ScanResult) -> Vec<String> {
        result.entries.iter().map(|e| e.rel_path.clone()).collect()
    }

    // ── scan_documents_impl ──────────────────────────────────────────────

    #[test]
    fn scan_md_tsv_のみ収集し他拡張子は無視する() {
        let root = TempRoot::new("scan_ext");
        root.file("a.md", "# a");
        root.file("b.tsv", "x\ty");
        root.file("c.txt", "ignore");
        root.file("d.png", "ignore");
        let result = scan_documents_impl(&root.path).expect("走査成功");
        assert_eq!(rel_paths(&result), vec!["a.md", "b.tsv"]);
        assert!(!result.truncated);
    }

    #[test]
    fn scan_参考データのjson_xmlも収集する() {
        let root = TempRoot::new("scan_data_ext");
        root.file("a.json", "{}");
        root.file("b.xml", "<r/>");
        let result = scan_documents_impl(&root.path).expect("走査成功");
        assert_eq!(rel_paths(&result), vec!["a.json", "b.xml"]);
    }

    #[test]
    fn scan_サブディレクトリを再帰しrel_pathはスラッシュ区切り() {
        let root = TempRoot::new("scan_rec");
        root.file("docs/sub/c.tsv", "x");
        let result = scan_documents_impl(&root.path).expect("走査成功");
        assert_eq!(rel_paths(&result), vec!["docs/sub/c.tsv"]);
        let entry = &result.entries[0];
        assert_eq!(entry.name, "c.tsv");
        assert_eq!(entry.ext, "tsv");
    }

    #[test]
    fn scan_除外ディレクトリはスキップする() {
        let root = TempRoot::new("scan_excl");
        root.file("keep.md", "ok");
        root.file(".git/config.md", "hidden");
        root.file("node_modules/pkg/readme.md", "dep");
        root.file("dist/out.md", "built");
        root.file("build/out.md", "built");
        let result = scan_documents_impl(&root.path).expect("走査成功");
        assert_eq!(rel_paths(&result), vec!["keep.md"]);
    }

    #[test]
    fn scan_拡張子は小文字化して収集する() {
        let root = TempRoot::new("scan_lower");
        root.file("A.MD", "# a");
        let result = scan_documents_impl(&root.path).expect("走査成功");
        assert_eq!(result.entries.len(), 1);
        assert_eq!(result.entries[0].ext, "md");
        assert_eq!(result.entries[0].name, "A.MD");
    }

    #[test]
    fn scan_空フォルダはentries空truncated偽() {
        let root = TempRoot::new("scan_empty");
        let result = scan_documents_impl(&root.path).expect("走査成功");
        assert!(result.entries.is_empty());
        assert!(!result.truncated);
    }

    #[test]
    fn scan_存在しないルートはエラー() {
        let missing = std::env::temp_dir().join("mdbiz_missing_root_zzz");
        let _ = std::fs::remove_dir_all(&missing);
        assert!(scan_documents_impl(&missing).is_err());
    }

    #[test]
    fn scan_深さ上限を超えたら打ち切りtruncated真() {
        let root = TempRoot::new("scan_depth");
        // MAX_DEPTH(12) を超えるネスト。深い md は収集されず truncated=true。
        let mut deep = String::new();
        for _ in 0..(MAX_DEPTH + 2) {
            deep.push_str("n/");
        }
        root.file(&format!("{}too_deep.md", deep), "deep");
        root.file("shallow.md", "ok");
        let result = scan_documents_impl(&root.path).expect("走査成功");
        assert!(result.truncated, "深さ超過で truncated=true になる");
        assert!(
            rel_paths(&result).iter().all(|p| !p.contains("too_deep")),
            "上限より深いファイルは収集されない"
        );
        assert!(rel_paths(&result).contains(&"shallow.md".to_string()));
    }

    #[test]
    fn scan_日本語のファイル名とディレクトリ名を保って収集する() {
        // 業務文書のファイル名は日本語が既定と考えてよい。走査結果の名前と相対パスが
        // 入力どおりに保たれること（文字化け・脱落がないこと）を担保する。
        let root = TempRoot::new("scan_ja");
        root.file("設計書/基本設計書.md", "# 設計");
        root.file("検証シート/受発注ワークフロー.tsv", "No.\t項目");
        let result = scan_documents_impl(&root.path).expect("走査成功");
        assert_eq!(
            rel_paths(&result),
            vec!["検証シート/受発注ワークフロー.tsv", "設計書/基本設計書.md"]
        );
        let names: Vec<&str> = result.entries.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, vec!["受発注ワークフロー.tsv", "基本設計書.md"]);
    }

    #[test]
    fn scan_韓国語中国語のファイル名も保って収集する() {
        // UI は en/ja/zh/ko を出すため、ファイル名も同じ言語圏で運用されうる。
        let root = TempRoot::new("scan_ko_zh");
        root.file("설계서/기본설계서.md", "# 설계");
        root.file("设计文档/概要设计.md", "# 设计");
        let result = scan_documents_impl(&root.path).expect("走査成功");
        assert_eq!(
            rel_paths(&result),
            vec!["设计文档/概要设计.md", "설계서/기본설계서.md"]
        );
    }

    #[test]
    fn scan_全角括弧やスペースを含む名前も収集する() {
        // 「請求書（2026年6月分） 控え.md」のような名前は実務で普通に現れる。
        let root = TempRoot::new("scan_ja_sym");
        let name = "請求書（2026年6月分）　控え.md";
        root.file(name, "本文");
        let result = scan_documents_impl(&root.path).expect("走査成功");
        assert_eq!(rel_paths(&result), vec![name]);
    }

    // ── read_document_impl ───────────────────────────────────────────────

    #[test]
    fn read_md本文をutf8で読む() {
        let root = TempRoot::new("read_md");
        root.file("a.md", "# タイトル\n本文");
        let body = read_document_impl(&root.path, "a.md").expect("読込成功");
        assert_eq!(body, "# タイトル\n本文");
    }

    #[test]
    fn read_サブディレクトリのtsvを読む() {
        let root = TempRoot::new("read_tsv");
        root.file("docs/x.tsv", "col1\tcol2");
        let body = read_document_impl(&root.path, "docs/x.tsv").expect("読込成功");
        assert_eq!(body, "col1\tcol2");
    }

    #[test]
    fn read_ルート外へのトラバーサルは拒否する() {
        let root = TempRoot::new("read_trav");
        root.file("inside.md", "ok");
        // ルートの親に秘密ファイルを置き、../ で脱出を試みる。
        let outside = root.path.parent().unwrap().join("mdbiz_secret_outside.md");
        std::fs::write(&outside, "secret").expect("外部ファイル作成");
        let result = read_document_impl(&root.path, "../mdbiz_secret_outside.md");
        let _ = std::fs::remove_file(&outside);
        assert!(result.is_err(), "root 外は Err");
    }

    #[test]
    fn read_md_tsv以外の拡張子は拒否する() {
        let root = TempRoot::new("read_ext");
        root.file("c.txt", "text");
        assert!(read_document_impl(&root.path, "c.txt").is_err());
    }

    #[test]
    fn read_存在しないファイルはエラー() {
        let root = TempRoot::new("read_missing");
        assert!(read_document_impl(&root.path, "nope.md").is_err());
    }

    #[test]
    fn read_日本語のファイル名とディレクトリ名で読める() {
        let root = TempRoot::new("read_ja");
        root.file("検証シート/受発注ワークフロー.tsv", "No.:number\t項目\t結果");
        let body =
            read_document_impl(&root.path, "検証シート/受発注ワークフロー.tsv").expect("読込成功");
        assert_eq!(body, "No.:number\t項目\t結果");
    }

    // ── write_document_impl ──────────────────────────────────────────────

    #[test]
    fn write_md本文を書き戻す() {
        let root = TempRoot::new("write_md");
        root.file("a.md", "旧本文");
        write_document_impl(&root.path, "a.md", "# 新タイトル\n新本文").expect("書込成功");
        let body = read_document_impl(&root.path, "a.md").expect("読込成功");
        assert_eq!(body, "# 新タイトル\n新本文");
    }

    #[test]
    fn write_サブディレクトリのtsvを書き戻す() {
        let root = TempRoot::new("write_tsv");
        root.file("docs/x.tsv", "old");
        write_document_impl(&root.path, "docs/x.tsv", "col1\tcol2").expect("書込成功");
        let body = read_document_impl(&root.path, "docs/x.tsv").expect("読込成功");
        assert_eq!(body, "col1\tcol2");
    }

    #[test]
    fn write_ルート外へのトラバーサルは拒否し外部ファイルを変更しない() {
        let root = TempRoot::new("write_trav");
        root.file("inside.md", "ok");
        let outside = root.path.parent().unwrap().join("mdbiz_wsecret_outside.md");
        std::fs::write(&outside, "secret").expect("外部ファイル作成");
        let result = write_document_impl(&root.path, "../mdbiz_wsecret_outside.md", "上書き試行");
        let after = std::fs::read_to_string(&outside).unwrap_or_default();
        let _ = std::fs::remove_file(&outside);
        assert!(result.is_err(), "root 外は Err");
        assert_eq!(after, "secret", "外部ファイルは書き換えられない");
    }

    #[test]
    fn write_md_tsv以外の拡張子は拒否する() {
        let root = TempRoot::new("write_ext");
        root.file("c.txt", "text");
        assert!(write_document_impl(&root.path, "c.txt", "上書き試行").is_err());
        // 拒否時は元の内容が保たれる。
        assert_eq!(read_document_impl_raw(&root.path, "c.txt"), "text");
    }

    #[test]
    fn write_参考データのjson_xmlは拒否する() {
        // 読めるが書けない。参考データは正本ではないので、書き戻し経路を backend で塞ぐ。
        let root = TempRoot::new("write_data_ext");
        root.file("a.json", "{}");
        root.file("b.xml", "<r/>");
        assert!(write_document_impl(&root.path, "a.json", "{\"x\":1}").is_err());
        assert!(write_document_impl(&root.path, "b.xml", "<r>x</r>").is_err());
        assert_eq!(read_document_impl_raw(&root.path, "a.json"), "{}");
        assert_eq!(read_document_impl_raw(&root.path, "b.xml"), "<r/>");
    }

    #[test]
    fn write_存在しないファイルはエラー() {
        // canonicalize は実在パスにのみ成功するため、write は既存のみ（新規は create_document）。
        let root = TempRoot::new("write_missing");
        assert!(write_document_impl(&root.path, "nope.md", "本文").is_err());
    }

    #[test]
    fn write_日本語のファイル名へ書き戻せる() {
        let root = TempRoot::new("write_ja");
        root.file("検証シート/受発注ワークフロー.tsv", "旧");
        write_document_impl(&root.path, "検証シート/受発注ワークフロー.tsv", "新\t内容")
            .expect("書込成功");
        let body =
            read_document_impl(&root.path, "検証シート/受発注ワークフロー.tsv").expect("読込成功");
        assert_eq!(body, "新\t内容");
    }

    // ── create_document_impl ─────────────────────────────────────────────

    #[test]
    fn create_新規mdをルート直下に作成できる() {
        let root = TempRoot::new("create_md");
        create_document_impl(&root.path, "新規.md", "# 見出し\n本文").expect("作成成功");
        let body = read_document_impl(&root.path, "新規.md").expect("読込成功");
        assert_eq!(body, "# 見出し\n本文");
    }

    #[test]
    fn create_既存サブディレクトリに新規tsvを作成できる() {
        let root = TempRoot::new("create_tsv_sub");
        // 親ディレクトリは既存とする（MVP は親を自動生成しない）。
        std::fs::create_dir_all(root.path.join("docs")).expect("親作成");
        create_document_impl(&root.path, "docs/検証.tsv", "No.:number\t項目").expect("作成成功");
        let body = read_document_impl(&root.path, "docs/検証.tsv").expect("読込成功");
        assert_eq!(body, "No.:number\t項目");
    }

    #[test]
    fn create_既存ファイルは上書きしない() {
        let root = TempRoot::new("create_exists");
        root.file("a.tsv", "既存内容");
        let result = create_document_impl(&root.path, "a.tsv", "上書き試行");
        assert!(result.is_err(), "同名既存は Err");
        assert_eq!(
            read_document_impl(&root.path, "a.tsv").expect("読込成功"),
            "既存内容",
            "既存ファイルは書き換えられない"
        );
    }

    #[test]
    fn create_md_tsv以外の拡張子は拒否する() {
        let root = TempRoot::new("create_ext");
        assert!(create_document_impl(&root.path, "c.txt", "text").is_err());
        assert!(!root.path.join("c.txt").exists(), "拒否時はファイルを作らない");
    }

    #[test]
    fn create_参考データのjson_xmlは拒否する() {
        // 参考データは外部の資料であって、このアプリで起こす文書ではない。
        let root = TempRoot::new("create_data_ext");
        assert!(create_document_impl(&root.path, "a.json", "{}").is_err());
        assert!(create_document_impl(&root.path, "b.xml", "<r/>").is_err());
        assert!(!root.path.join("a.json").exists());
        assert!(!root.path.join("b.xml").exists());
    }

    #[test]
    fn create_ルート外へのトラバーサルは拒否し外部ファイルを作らない() {
        let root = TempRoot::new("create_trav");
        let outside_name = "mdbiz_csecret_outside.md";
        let outside = root.path.parent().unwrap().join(outside_name);
        let _ = std::fs::remove_file(&outside);
        let result = create_document_impl(&root.path, "../mdbiz_csecret_outside.md", "外部作成試行");
        let created = outside.exists();
        let _ = std::fs::remove_file(&outside);
        assert!(result.is_err(), "root 外は Err");
        assert!(!created, "root 外にファイルを作らない");
    }

    #[test]
    fn create_親ディレクトリが存在しなければエラー() {
        // MVP は親を自動生成しない。存在しない中間ディレクトリ指定は Err。
        let root = TempRoot::new("create_no_parent");
        assert!(create_document_impl(&root.path, "missing/新規.tsv", "本文").is_err());
    }

    /// 拡張子チェックを迂回してファイル内容を確認するためのテスト補助。
    fn read_document_impl_raw(root: &Path, rel: &str) -> String {
        std::fs::read_to_string(root.join(rel)).unwrap_or_default()
    }

    // ── directory_exists_impl ────────────────────────────────────────────

    #[test]
    fn exists_実在するディレクトリはtrue() {
        let root = TempRoot::new("exists_dir");
        assert!(directory_exists_impl(&root.path));
    }

    #[test]
    fn exists_消えたディレクトリはfalse() {
        let root = TempRoot::new("exists_gone");
        let gone = root.path.join("削除済みフォルダ");
        std::fs::create_dir_all(&gone).expect("作成");
        assert!(directory_exists_impl(&gone));
        std::fs::remove_dir_all(&gone).expect("削除");
        assert!(!directory_exists_impl(&gone));
    }

    #[test]
    fn exists_ファイルはディレクトリではないのでfalse() {
        let root = TempRoot::new("exists_file");
        let file = root.file("a.md", "# a");
        assert!(!directory_exists_impl(&file));
    }

    #[test]
    fn exists_空文字は存在しない扱い() {
        assert!(!directory_exists_impl(Path::new("")));
    }

    #[test]
    fn exists_日本語のディレクトリ名でも判定できる() {
        let root = TempRoot::new("exists_ja");
        let dir = root.path.join("業務/検証シート");
        std::fs::create_dir_all(&dir).expect("作成");
        assert!(directory_exists_impl(&dir));
    }

    // ── rename_entry_impl ────────────────────────────────────────────────

    #[test]
    fn rename_ファイル名を変更し新しい相対パスを返す() {
        let root = TempRoot::new("ren_file");
        root.file("a.md", "# a");
        let rel = rename_entry_impl(&root.path, "a.md", "b.md").expect("改名成功");
        assert_eq!(rel, "b.md");
        assert!(!root.path.join("a.md").exists());
        assert_eq!(
            std::fs::read_to_string(root.path.join("b.md")).expect("読み取り"),
            "# a"
        );
    }

    #[test]
    fn rename_サブディレクトリ内でも親の位置は保つ() {
        let root = TempRoot::new("ren_sub");
        root.file("docs/検証/旧名.tsv", "x\ty");
        let rel = rename_entry_impl(&root.path, "docs/検証/旧名.tsv", "新名.tsv").expect("改名成功");
        assert_eq!(rel, "docs/検証/新名.tsv");
    }

    #[test]
    fn rename_フォルダも名前を変更できる() {
        let root = TempRoot::new("ren_dir");
        root.file("旧フォルダ/a.md", "# a");
        let rel = rename_entry_impl(&root.path, "旧フォルダ", "新フォルダ").expect("改名成功");
        assert_eq!(rel, "新フォルダ");
        assert!(root.path.join("新フォルダ/a.md").is_file());
    }

    #[test]
    fn rename_名前に区切り文字を含む場合は移動させない() {
        let root = TempRoot::new("ren_sep");
        root.file("a.md", "# a");
        assert!(rename_entry_impl(&root.path, "a.md", "sub/b.md").is_err());
        assert!(rename_entry_impl(&root.path, "a.md", "sub\\b.md").is_err());
        assert!(root.path.join("a.md").is_file());
    }

    #[test]
    fn rename_親へ抜ける名前は拒否する() {
        let root = TempRoot::new("ren_dots");
        root.file("a.md", "# a");
        assert!(rename_entry_impl(&root.path, "a.md", "..").is_err());
        assert!(rename_entry_impl(&root.path, "a.md", ".").is_err());
    }

    #[test]
    fn rename_空の名前は拒否する() {
        let root = TempRoot::new("ren_empty");
        root.file("a.md", "# a");
        assert!(rename_entry_impl(&root.path, "a.md", "   ").is_err());
    }

    #[test]
    fn rename_使えない文字を含む名前は拒否する() {
        let root = TempRoot::new("ren_bad_char");
        root.file("a.md", "# a");
        assert!(rename_entry_impl(&root.path, "a.md", "a:b.md").is_err());
        assert!(rename_entry_impl(&root.path, "a.md", "a?b.md").is_err());
    }

    #[test]
    fn rename_既存の名前とぶつかる場合は上書きしない() {
        let root = TempRoot::new("ren_dup");
        root.file("a.md", "# a");
        root.file("b.md", "# b");
        assert!(rename_entry_impl(&root.path, "a.md", "b.md").is_err());
        assert_eq!(
            std::fs::read_to_string(root.path.join("b.md")).expect("読み取り"),
            "# b"
        );
    }

    #[test]
    fn rename_大文字小文字だけの変更は通す() {
        let root = TempRoot::new("ren_case");
        root.file("a.md", "# a");
        let rel = rename_entry_impl(&root.path, "a.md", "A.md").expect("改名成功");
        assert_eq!(rel, "A.md");
    }

    #[test]
    fn rename_対応外の拡張子へは変更できない() {
        let root = TempRoot::new("ren_ext");
        root.file("a.md", "# a");
        assert!(rename_entry_impl(&root.path, "a.md", "a.txt").is_err());
        assert!(root.path.join("a.md").is_file());
    }

    #[test]
    fn rename_正本と参考データをまたぐ改名は拒否する() {
        // 改名で書ける / 書けないが入れ替わると、開いたまま保存できなくなる。
        let root = TempRoot::new("ren_cross");
        root.file("a.md", "# a");
        root.file("b.json", "{}");
        assert!(rename_entry_impl(&root.path, "a.md", "a.json").is_err());
        assert!(rename_entry_impl(&root.path, "b.json", "b.md").is_err());
        assert!(root.path.join("a.md").is_file());
        assert!(root.path.join("b.json").is_file());
    }

    #[test]
    fn rename_参考データどうしの改名は通す() {
        let root = TempRoot::new("ren_data");
        root.file("a.json", "{}");
        let rel = rename_entry_impl(&root.path, "a.json", "b.json").expect("改名成功");
        assert_eq!(rel, "b.json");
    }

    #[test]
    fn rename_ルート外の対象は拒否する() {
        let root = TempRoot::new("ren_outside");
        root.file("a.md", "# a");
        assert!(rename_entry_impl(&root.path, "../a.md", "b.md").is_err());
        assert!(rename_entry_impl(&root.path, "", "b").is_err());
    }
    // ── export_html_impl ─────────────────────────────────────────────────

    #[test]
    fn 書き出し先は元の_md_と同じ場所の同名_html() {
        let root = TempRoot::new("export_ok");
        root.file("設計書/基本設計書.md", "---
schema: spec/v1
---
");

        let written = export_html_impl(&root.path, "設計書/基本設計書.md", "<!doctype html>")
            .expect("書き出し成功");

        assert_eq!(written, "設計書/基本設計書.html");
        let out = root.path.join("設計書/基本設計書.html");
        assert_eq!(std::fs::read_to_string(out).unwrap(), "<!doctype html>");
    }

    // 生成物なので上書きしてよい。作り直すたびに別名が増えるほうが困る。
    #[test]
    fn 既存の_html_は上書きする() {
        let root = TempRoot::new("export_overwrite");
        root.file("a.md", "# a");
        root.file("a.html", "古い");

        export_html_impl(&root.path, "a.md", "新しい").expect("書き出し成功");

        assert_eq!(
            std::fs::read_to_string(root.path.join("a.html")).unwrap(),
            "新しい"
        );
    }

    // .tsv は表として編集するもので、プレビューを持たない。
    #[test]
    fn 元が_md_でなければ断る() {
        let root = TempRoot::new("export_ext");
        root.file("a.tsv", "#! md-business:test-spec-tsv/v1
");

        assert!(export_html_impl(&root.path, "a.tsv", "<html>").is_err());
        assert!(!root.path.join("a.html").exists());
    }

    #[test]
    fn ルート外を指すパスは断る() {
        let root = TempRoot::new("export_escape");
        root.file("a.md", "# a");

        assert!(export_html_impl(&root.path, "../a.md", "<html>").is_err());
    }

    #[test]
    fn 無いファイルは断る() {
        let root = TempRoot::new("export_absent");

        assert!(export_html_impl(&root.path, "none.md", "<html>").is_err());
    }

    // ── export_site_impl ─────────────────────────────────────────────────

    fn site_file(path: &str, content: &str) -> SiteFile {
        SiteFile {
            path: path.to_string(),
            content: content.to_string(),
        }
    }

    #[test]
    fn サイトは_dist_配下へ書き出す() {
        let root = TempRoot::new("site_ok");

        let result = export_site_impl(
            &root.path,
            &[
                site_file("index.html", "<!doctype html>"),
                site_file("assets/markdown.css", "body{}"),
            ],
        )
        .expect("書き出し成功");

        assert_eq!(result.dir, "dist");
        assert_eq!(result.count, 2);
        assert_eq!(
            std::fs::read_to_string(root.path.join("dist/index.html")).unwrap(),
            "<!doctype html>"
        );
        assert_eq!(
            std::fs::read_to_string(root.path.join("dist/assets/markdown.css")).unwrap(),
            "body{}"
        );
    }

    #[test]
    fn 階層のあるページは親フォルダごと作る() {
        let root = TempRoot::new("site_nested");

        export_site_impl(&root.path, &[site_file("設計/基本設計書.html", "<h1>")])
            .expect("書き出し成功");

        assert!(root.path.join("dist/設計/基本設計書.html").is_file());
    }

    // ページは生成物。作り直すたびに別名が増えるほうが困る（単一 HTML と同じ扱い）。
    #[test]
    fn サイトの既存ファイルは上書きする() {
        let root = TempRoot::new("site_overwrite");
        root.file("dist/index.html", "古い");

        export_site_impl(&root.path, &[site_file("index.html", "新しい")]).expect("書き出し成功");

        assert_eq!(
            std::fs::read_to_string(root.path.join("dist/index.html")).unwrap(),
            "新しい"
        );
    }

    // 途中まで書いてから断ると、混ざった状態の dist/ が残る。先に全部確かめる。
    #[test]
    fn 上へ出るパスが_1_つでもあれば何も書かない() {
        let root = TempRoot::new("site_escape");

        assert!(export_site_impl(
            &root.path,
            &[site_file("a.html", "<h1>"), site_file("../外.html", "<h1>")]
        )
        .is_err());

        assert!(!root.path.join("dist/a.html").exists());
        assert!(!root.path.join("外.html").exists());
    }

    #[test]
    fn サイトの絶対パスは断る() {
        let root = TempRoot::new("site_abs");

        assert!(export_site_impl(&root.path, &[site_file("/tmp/x.html", "<h1>")]).is_err());
        assert!(export_site_impl(&root.path, &[site_file("C:/x.html", "<h1>")]).is_err());
    }

    // dist/ に置くのは描いたページと CSS だけ。ここを広げると、任意の中身を
    // 任意の名前で置ける口になる。
    #[test]
    fn html_と_css_以外は断る() {
        let root = TempRoot::new("site_ext");

        assert!(export_site_impl(&root.path, &[site_file("a.exe", "MZ")]).is_err());
        assert!(export_site_impl(&root.path, &[site_file("a.md", "# a")]).is_err());
        assert!(export_site_impl(&root.path, &[site_file("noext", "x")]).is_err());
    }

    // 空の dist/ を作っても、利用者には何が起きたか分からない。
    #[test]
    fn 空の一覧は断る() {
        let root = TempRoot::new("site_empty");

        assert!(export_site_impl(&root.path, &[]).is_err());
        assert!(!root.path.join("dist").exists());
    }

    #[test]
    fn ルートがフォルダでなければ断る() {
        let root = TempRoot::new("site_noroot");

        assert!(export_site_impl(
            &root.path.join("無いフォルダ"),
            &[site_file("a.html", "<h1>")]
        )
        .is_err());
    }
}
