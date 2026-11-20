//! 本モードで文書に書き込んだ線の保存（文書ごとの別ファイル）。
//!
//! 線は Markdown 本体に混ぜない。本文は人が書いた正本で、手書きの跡は読む人ごとの書き込みに
//! すぎない。混ぜると差分が線の座標で埋まり、本文の変化が読めなくなる。
//!
//! 置き場所はルート直下の `.md-business/ink/<文書の相対パス>.json`。文書の隣に置くと
//! `.json` は一覧に出る種類なので、文書の数だけ線のファイルが並ぶ。隠しフォルダは
//! 一覧にも監視にも出ない。

use std::path::{Path, PathBuf};

/// 線の保存先（ルートからの相対）。
const INK_DIR: [&str; 2] = [".md-business", "ink"];
/// 1 文書ぶんの線の上限。線は座標の並びなので、これを超えるのは壊れた入力とみなす。
const MAX_INK_BYTES: usize = 8 * 1024 * 1024;

/// 文書の相対パスから線の保存先を引く。文書は root 配下に実在する `.md` に限る。
///
/// 文書を canonicalize して root 配下判定する（`../` / シンボリックリンク脱出を封じる）。
/// 保存先は解決済みの相対パスから組むので、`..` が混ざる余地が無い。
fn ink_path(root: &Path, doc_rel_path: &str) -> Result<(PathBuf, PathBuf), String> {
    let canon_root = std::fs::canonicalize(root).map_err(|e| format!("ルート解決失敗: {}", e))?;
    let canon_doc = std::fs::canonicalize(root.join(doc_rel_path))
        .map_err(|e| format!("文書解決失敗: {}", e))?;
    if !canon_doc.starts_with(&canon_root) {
        return Err("ルート外へのアクセスは拒否されます".to_string());
    }
    let is_md = canon_doc
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("md"));
    if !is_md || !canon_doc.is_file() {
        return Err("線を書き込めるのは .md の文書だけです".to_string());
    }
    let rel = canon_doc
        .strip_prefix(&canon_root)
        .map_err(|e| format!("相対パス化失敗: {}", e))?;
    let mut dir = canon_root.clone();
    for part in INK_DIR {
        dir.push(part);
    }
    let mut file_name = rel.as_os_str().to_os_string();
    file_name.push(".json");
    Ok((canon_root, dir.join(file_name)))
}

/// 文書の線を読む。まだ書いていなければ None（Tauri 非依存の実体）。
pub fn read_ink_impl(root: &Path, doc_rel_path: &str) -> Result<Option<String>, String> {
    let (_, path) = ink_path(root, doc_rel_path)?;
    match std::fs::read_to_string(&path) {
        Ok(body) => Ok(Some(body)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("線を読めません: {}", e)),
    }
}

/// 文書の線を書く。保存先のフォルダは無ければ作る（Tauri 非依存の実体）。
pub fn write_ink_impl(root: &Path, doc_rel_path: &str, content: &str) -> Result<(), String> {
    if content.len() > MAX_INK_BYTES {
        return Err("線が大きすぎます".to_string());
    }
    let (canon_root, path) = ink_path(root, doc_rel_path)?;
    let parent = path
        .parent()
        .ok_or_else(|| "保存先が不正です".to_string())?;
    std::fs::create_dir_all(parent).map_err(|e| format!("保存先を作れません: {}", e))?;
    // `.md-business` がルート外へのリンクだった場合に備え、作ったあとの実体で確かめる。
    let canon_parent =
        std::fs::canonicalize(parent).map_err(|e| format!("保存先解決失敗: {}", e))?;
    if !canon_parent.starts_with(&canon_root) {
        return Err("ルート外へのアクセスは拒否されます".to_string());
    }
    std::fs::write(&path, content).map_err(|e| format!("線を保存できません: {}", e))
}

/// フロントから `invoke("read_ink", { root, docRelPath })` で呼ぶ薄いラッパ。
#[tauri::command]
pub async fn read_ink(root: String, doc_rel_path: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || read_ink_impl(Path::new(&root), &doc_rel_path))
        .await
        .map_err(|e| format!("処理を実行できませんでした: {}", e))?
}

/// フロントから `invoke("write_ink", { root, docRelPath, content })` で呼ぶ薄いラッパ。
/// 保存先は監視しない隠しフォルダなので、自己書き込みの記録は要らない。
#[tauri::command]
pub async fn write_ink(root: String, doc_rel_path: String, content: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        write_ink_impl(Path::new(&root), &doc_rel_path, &content)
    })
    .await
    .map_err(|e| format!("処理を実行できませんでした: {}", e))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    struct TempRoot {
        path: PathBuf,
    }

    impl TempRoot {
        fn new(tag: &str) -> Self {
            static N: AtomicU32 = AtomicU32::new(0);
            let n = N.fetch_add(1, Ordering::SeqCst);
            let path = std::env::temp_dir().join(format!(
                "mdbiz_ink_{}_{}_{}",
                tag,
                std::process::id(),
                n
            ));
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

    #[test]
    fn 書いた線を読み戻せる_本文には触らない() {
        let root = TempRoot::new("roundtrip");
        root.file("books/a.md", "# 本文");
        write_ink_impl(&root.path, "books/a.md", "{\"v\":1}").expect("保存");
        assert_eq!(
            read_ink_impl(&root.path, "books/a.md").expect("読込"),
            Some("{\"v\":1}".to_string())
        );
        assert!(root.path.join(".md-business/ink/books/a.md.json").is_file());
        assert_eq!(
            std::fs::read_to_string(root.path.join("books/a.md")).unwrap(),
            "# 本文"
        );
    }

    #[test]
    fn まだ書いていなければ空() {
        let root = TempRoot::new("empty");
        root.file("a.md", "x");
        assert_eq!(read_ink_impl(&root.path, "a.md").expect("読込"), None);
    }

    #[test]
    fn 実在しない文書_md以外_ルート外には書かない() {
        let root = TempRoot::new("guard");
        root.file("a.tsv", "x");
        root.file("a.md", "x");
        assert!(write_ink_impl(&root.path, "nope.md", "{}").is_err());
        assert!(write_ink_impl(&root.path, "a.tsv", "{}").is_err());
        assert!(write_ink_impl(&root.path, "../a.md", "{}").is_err());
        assert!(read_ink_impl(&root.path, "../a.md").is_err());
    }

    #[test]
    fn 大きすぎる線は書かない() {
        let root = TempRoot::new("size");
        root.file("a.md", "x");
        let big = "x".repeat(MAX_INK_BYTES + 1);
        assert!(write_ink_impl(&root.path, "a.md", &big).is_err());
        assert_eq!(read_ink_impl(&root.path, "a.md").expect("読込"), None);
    }
}
