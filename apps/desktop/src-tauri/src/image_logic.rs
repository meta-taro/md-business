//! 画像を画面へ渡すための下ごしらえ（Tauri 非依存）。
//!
//! このアプリで画像は**読むだけ**。書き換え・回転・切り抜きはしない。撮るのも直すのも
//! カメラと写真アプリの仕事で、ここは「正本の隣にある証拠を見る」ための口に留める。
//!
//! 渡し方は **data URL（base64）**。プレビューは `<iframe srcdoc>` で、掃除
//! （`sanitizeHtml.ts`）は `src` に `https:` / `blob:` / `data:image/…;base64,` しか通さない。
//! `data:` は既に通っているので、**安全側の既定を動かさずに**画像を届けられるのはこの形だけ。
//! 代わりに 1 枚あたりの大きさに上限を置く（base64 は元の 4/3 になるうえ、渡した先で
//! 文字列として丸ごと持たれる）。

use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;
use serde::Serialize;
use std::path::Path;

/// 1 枚あたりの上限。スマートフォンの写真（3〜8 MB）は通り、動画から起こした巨大な
/// PNG は断る。断ったことは画面に出す——黙って空を出すと「壊れて見えない」と区別が付かない。
pub const MAX_IMAGE_BYTES: u64 = 20 * 1024 * 1024;

/// 画面へ渡す 1 枚。`data_url` はそのまま `<img src>` に入る。
#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImageData {
    pub data_url: String,
    pub byte_size: u64,
    pub mime: String,
}

/// 拡張子から MIME を決める。扱わないものは None。
///
/// 判定は**拡張子だけ**で、中身は見ない。中身から種類を当てても、間違っていれば
/// 画面に出ないだけで害が増えるわけではない。逆に当てにいくと、拡張子と中身が食い違う
/// ファイルを「正しい種類」として送り出すことになる。
pub fn mime_for(ext: &str) -> Option<&'static str> {
    match ext.to_ascii_lowercase().as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "svg" => Some("image/svg+xml"),
        _ => None,
    }
}

/// ルート配下の画像 1 枚を data URL にして返す。
pub fn read_image_impl(root: &Path, rel_path: &str) -> Result<ImageData, String> {
    read_image_with_limit(root, rel_path, MAX_IMAGE_BYTES)
}

/// 上限を指定して読む（[`read_image_impl`] の実体）。上限は検査から差し替える。
pub fn read_image_with_limit(
    root: &Path,
    rel_path: &str,
    max_bytes: u64,
) -> Result<ImageData, String> {
    let path = crate::workspace::resolve_image_in_root(root, rel_path)?;
    let mime = path
        .extension()
        .and_then(|e| e.to_str())
        .and_then(mime_for)
        .ok_or_else(|| "画像として開ける種類ではありません".to_string())?;

    // 読む前に大きさを見る。読んでから断ると、断るためにメモリへ載せることになる。
    let byte_size = std::fs::metadata(&path)
        .map_err(|error| format!("ファイル情報の取得に失敗: {error}"))?
        .len();
    if byte_size > max_bytes {
        return Err(format!(
            "画像が大きすぎます（{} MB まで）",
            max_bytes / (1024 * 1024)
        ));
    }

    let bytes = std::fs::read(&path).map_err(|error| format!("読み取り失敗: {error}"))?;
    let data_url = format!("data:{mime};base64,{}", STANDARD.encode(&bytes));
    Ok(ImageData {
        data_url,
        byte_size,
        mime: mime.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
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

        fn write(&self, rel: &str, bytes: &[u8]) -> PathBuf {
            let p = self.path.join(rel);
            if let Some(parent) = p.parent() {
                std::fs::create_dir_all(parent).expect("親ディレクトリ作成");
            }
            std::fs::write(&p, bytes).expect("ファイル書き込み");
            p
        }
    }

    impl Drop for TempRoot {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    // ── mime_for ────────────────────────────────────────────────────────

    #[test]
    fn 扱う6種類のmimeを返す() {
        assert_eq!(mime_for("png"), Some("image/png"));
        assert_eq!(mime_for("jpg"), Some("image/jpeg"));
        assert_eq!(mime_for("jpeg"), Some("image/jpeg"));
        assert_eq!(mime_for("gif"), Some("image/gif"));
        assert_eq!(mime_for("webp"), Some("image/webp"));
        assert_eq!(mime_for("svg"), Some("image/svg+xml"));
    }

    #[test]
    fn 扱わない拡張子にmimeは無い() {
        assert_eq!(mime_for("md"), None);
        assert_eq!(mime_for("bmp"), None);
        assert_eq!(mime_for("exe"), None);
        assert_eq!(mime_for(""), None);
    }

    #[test]
    fn mimeは掃除が通す並びと一致する() {
        // sanitizeHtml.ts の許可は data:image/(png|jpe?g|gif|webp|svg\+xml);base64,
        // ここが食い違うと、読めたのに画面へ出ない画像ができる。
        for ext in ["png", "jpg", "jpeg", "gif", "webp", "svg"] {
            let mime = mime_for(ext).expect("mime");
            let tail = mime.strip_prefix("image/").expect("image/ で始まる");
            assert!(
                matches!(tail, "png" | "jpeg" | "gif" | "webp" | "svg+xml"),
                "{mime} は掃除の許可に無い"
            );
        }
    }

    // ── read_image_impl ─────────────────────────────────────────────────

    #[test]
    fn 読むとdata_urlと大きさが返る() {
        let root = TempRoot::new("img_read");
        root.write("photo.png", &[1, 2, 3, 4]);
        let data = read_image_impl(&root.path, "photo.png").expect("読める");
        assert_eq!(data.mime, "image/png");
        assert_eq!(data.byte_size, 4);
        assert_eq!(data.data_url, "data:image/png;base64,AQIDBA==");
    }

    #[test]
    fn 大文字の拡張子でも読める() {
        let root = TempRoot::new("img_upper");
        root.write("photo.JPG", &[0xff]);
        let data = read_image_impl(&root.path, "photo.JPG").expect("読める");
        assert_eq!(data.mime, "image/jpeg");
    }

    #[test]
    fn 上限を超えるものは理由を付けて断る() {
        let root = TempRoot::new("img_big");
        let big = vec![0u8; (MAX_IMAGE_BYTES + 1) as usize];
        root.write("big.png", &big);
        let error = read_image_impl(&root.path, "big.png").expect_err("断る");
        assert!(error.contains("大き"), "理由が伝わらない: {error}");
    }

    #[test]
    fn 上限ちょうどは読める() {
        let root = TempRoot::new("img_edge");
        // 20 MB を実際に書くとテストが遅いので、境目の判定だけを小さい上限で確かめる。
        root.write("edge.png", &[7, 7, 7]);
        let data = read_image_with_limit(&root.path, "edge.png", 3).expect("読める");
        assert_eq!(data.byte_size, 3);
        assert!(read_image_with_limit(&root.path, "edge.png", 2).is_err());
    }

    #[test]
    fn 画像でない拡張子は読めない() {
        let root = TempRoot::new("img_notimg");
        root.write("doc.md", b"# not an image");
        let error = read_image_impl(&root.path, "doc.md").expect_err("断る");
        assert!(error.contains("画像"), "理由が伝わらない: {error}");
    }

    #[test]
    fn ルートの外は読めない() {
        let root = TempRoot::new("img_escape");
        root.write("inside.png", &[1]);
        let outside = root.path.parent().expect("親").join("outside.png");
        std::fs::write(&outside, [1]).expect("外に置く");
        let error = read_image_impl(&root.path, "../outside.png").expect_err("断る");
        assert!(error.contains("ルート外"), "理由が伝わらない: {error}");
        let _ = std::fs::remove_file(&outside);
    }

    #[test]
    fn 無いファイルは読めない() {
        let root = TempRoot::new("img_missing");
        assert!(read_image_impl(&root.path, "nope.png").is_err());
    }
}
