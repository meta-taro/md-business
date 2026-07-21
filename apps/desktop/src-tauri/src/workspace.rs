//! 文書ワークスペースの Tauri コマンド（DOC-SPEC-DESKTOP-2026-0001 §5 / §8）。
//!
//! `scan_documents` … ルート配下を再帰走査し `.md` / `.tsv` のみを相対パスで返す。
//! `read_document`  … ルート配下の単一 md/tsv を UTF-8 で読む（パストラバーサル防止）。
//!
//! Tauri ランタイムに依存しない純関数（`*_impl`）へロジックを寄せ、`#[cfg(test)]`
//! から実 FS（temp ディレクトリ）に対して単体テストする。`#[tauri::command]` 側は
//! 薄いラッパに徹する（§7.3「ロジックを純関数へ抽出し単体化」）。

use serde::Serialize;
use std::path::{Path, PathBuf};

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

/// 走査対象の拡張子（小文字比較）。範囲は `.md` + `.tsv` に限定（設計書 §1.3）。
const ALLOWED_EXTS: [&str; 2] = ["md", "tsv"];
/// ディレクトリのネスト上限（設計書 §3.2）。超過分は打ち切り truncated=true。
const MAX_DEPTH: usize = 12;
/// 収集ファイル数の上限（設計書 §3.2）。超過分は打ち切り truncated=true。
const MAX_ENTRIES: usize = 5_000;

/// 走査から除外するディレクトリ名。ドット始まり（`.git` 等）と既知のビルド生成物。
fn is_excluded_dir(name: &str) -> bool {
    name.starts_with('.') || matches!(name, "node_modules" | "dist" | "build")
}

/// パスの拡張子が許可対象なら小文字化して返す。対象外・拡張子なしは None。
fn allowed_ext(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .filter(|e| ALLOWED_EXTS.contains(&e.as_str()))
}

/// ルート配下を再帰走査し `.md` / `.tsv` を収集する（Tauri 非依存の実体）。
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

/// `dir`（深さ `depth`）配下を再帰し、md/tsv を `out` に収集する。
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

/// ルートと相対パスを結合・正規化し、root 配下の md/tsv のみ UTF-8 で読む（Tauri 非依存の実体）。
/// `canonicalize` 後に root 配下判定（`../` / シンボリックリンク脱出を封じる・設計書 §8.1）。
pub fn read_document_impl(root: &Path, rel_path: &str) -> Result<String, String> {
    let canon_root = std::fs::canonicalize(root).map_err(|e| format!("ルート解決失敗: {}", e))?;
    let canon = std::fs::canonicalize(root.join(rel_path))
        .map_err(|e| format!("ファイル解決失敗: {}", e))?;
    if !canon.starts_with(&canon_root) {
        return Err("ルート外へのアクセスは拒否されます".to_string());
    }
    if allowed_ext(&canon).is_none() {
        return Err("対応拡張子は .md / .tsv のみです".to_string());
    }
    let bytes = std::fs::read(&canon).map_err(|e| format!("読み取り失敗: {}", e))?;
    String::from_utf8(bytes).map_err(|_| "UTF-8 として不正なファイルです".to_string())
}

/// フロントから `invoke("scan_documents", { root })` で呼ぶ薄いラッパ。
#[tauri::command]
pub fn scan_documents(root: String) -> Result<ScanResult, String> {
    scan_documents_impl(Path::new(&root))
}

/// フロントから `invoke("read_document", { root, relPath })` で呼ぶ薄いラッパ。
/// Tauri が camelCase(`relPath`) → snake_case(`rel_path`) を自動変換する。
#[tauri::command]
pub fn read_document(root: String, rel_path: String) -> Result<String, String> {
    read_document_impl(Path::new(&root), &rel_path)
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
}
