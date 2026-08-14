//! ログを行単位で流し読みする（調査画面の Timeline 用）。
//!
//! 業務文書の読み取り（`workspace::read_document`）は全文を 1 つの String で返す。
//! 調査で見るログは数百 MB になりうるので、同じやり方では読めない。ここは
//! **バイト位置を指して、そこから決まった行数だけ**返す。呼ぶ側は返ってきた次の位置で
//! 読み直して、端まで進む。
//!
//! 位置を行番号ではなくバイトで持つのは、行番号で指すと毎回先頭から数え直しになり、
//! 全体を舐めるだけで二乗の手間がかかるため。
//!
//! 対象の拡張子は文書ツリー（`workspace::ALLOWED_EXTS`）とは別に持つ。ツリー側へ
//! `.log` を足すと、ログがエディタで開けるようになってしまう（開けば全文を読む）。
//!
//! workspace.rs と同流儀で、ロジックは Tauri 非依存の `*_impl` に寄せて単体テストする。

use serde::Serialize;
use std::io::{BufRead, BufReader, Seek, SeekFrom};
use std::path::{Path, PathBuf};

/// 流し読みの対象にする拡張子（小文字比較）。
///
/// 1 行 1 レコードとして読めるものと、素のログ。文書（`.md`）はここに入れない
/// ——行で切って読む相手ではないし、読む口は別にある。
const LINE_EXTS: [&str; 4] = ["log", "jsonl", "ndjson", "tsv"];

/// 1 回の呼び出しで返す行数の上限。
///
/// 呼ぶ側の指定はここで頭打ちにする。1 回の応答が大きくなりすぎると、
/// 流し読みにした意味が無くなる。
const MAX_LINES_CEILING: usize = 5_000;

/// 1 行として返す長さの上限（バイト）。
///
/// 改行の無いファイルを 1 行として読むと、流し読みのまま全体を持つことになる。
/// 超えた分は切って、切ったことを件数で返す（黙って捨てない）。
const MAX_LINE_BYTES: usize = 1 << 20;

/// 流し読みで取り出した 1 まとまり。
#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LineChunk {
    /// 取り出した行。改行文字は含まない（CRLF と LF で同じ結果になる）。
    pub lines: Vec<String>,
    /// 次に読み始めるバイト位置。`eof` が立っているときは、ここまで読んだという意味。
    pub next_offset: u64,
    /// ファイルの端まで読んだか。
    pub eof: bool,
    /// 長すぎて切った行の数。0 でなければ、返した行は実体より短い。
    pub truncated_lines: usize,
}

/// ルート配下の、流し読みしてよいファイルを解決する。
///
/// `workspace::resolve_in_root` と同じく canonicalize してから root 配下判定する
/// （`../` / シンボリックリンクでの脱出を封じる）。違うのは対象拡張子だけ。
fn resolve_line_source(root: &Path, rel_path: &str) -> Result<PathBuf, String> {
    let canon_root = std::fs::canonicalize(root).map_err(|e| format!("ルート解決失敗: {}", e))?;
    let canon = std::fs::canonicalize(root.join(rel_path))
        .map_err(|e| format!("ファイル解決失敗: {}", e))?;
    if !canon.starts_with(&canon_root) {
        return Err("ルート外へのアクセスは拒否されます".to_string());
    }
    let ext = canon
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase());
    match ext {
        Some(e) if LINE_EXTS.contains(&e.as_str()) => Ok(canon),
        _ => Err("対象は .log / .jsonl / .ndjson / .tsv のみです".to_string()),
    }
}

/// `offset` から最大 `max_lines` 行を読む（Tauri 非依存の実体）。
pub fn read_lines_impl(
    root: &Path,
    rel_path: &str,
    offset: u64,
    max_lines: usize,
) -> Result<LineChunk, String> {
    let path = resolve_line_source(root, rel_path)?;
    let file = std::fs::File::open(&path).map_err(|e| format!("ファイルを開けません: {}", e))?;
    let mut reader = BufReader::new(file);
    reader
        .seek(SeekFrom::Start(offset))
        .map_err(|e| format!("位置を指定できません: {}", e))?;

    let limit = max_lines.clamp(1, MAX_LINES_CEILING);
    let mut lines: Vec<String> = Vec::new();
    let mut truncated_lines = 0usize;
    let mut pos = offset;
    let mut eof = false;

    while lines.len() < limit {
        let mut buf: Vec<u8> = Vec::new();
        let read = reader
            .read_until(b'\n', &mut buf)
            .map_err(|e| format!("読み取りに失敗しました: {}", e))?;
        if read == 0 {
            eof = true;
            break;
        }
        pos += read as u64;
        // 改行を落とす。CRLF の \r もここで落として LF と同じ結果にする。
        if buf.last() == Some(&b'\n') {
            buf.pop();
            if buf.last() == Some(&b'\r') {
                buf.pop();
            }
        }
        if buf.len() > MAX_LINE_BYTES {
            buf.truncate(MAX_LINE_BYTES);
            truncated_lines += 1;
        }
        lines.push(String::from_utf8_lossy(&buf).into_owned());
    }

    Ok(LineChunk {
        lines,
        next_offset: pos,
        eof,
        truncated_lines,
    })
}

/// フロントから `invoke("read_file_lines", { root, relPath, offset, maxLines })` で呼ぶ薄いラッパ。
///
/// 非 async のコマンドは main スレッドで走る。読み取りはブロッキングスレッドへ逃がす
/// （`file_digest` と同じ理由——大きいファイルで画面を止めない）。
#[tauri::command]
pub async fn read_file_lines(
    root: String,
    rel_path: String,
    offset: u64,
    max_lines: usize,
) -> Result<LineChunk, String> {
    tauri::async_runtime::spawn_blocking(move || {
        read_lines_impl(Path::new(&root), &rel_path, offset, max_lines)
    })
    .await
    .map_err(|e| format!("読み取りに失敗しました: {}", e))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
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

        /// バイト列をそのまま書く（CRLF・不正 UTF-8 を str 経由で崩さないため）。
        fn bytes(&self, rel: &str, body: &[u8]) -> PathBuf {
            let p = self.path.join(rel);
            if let Some(parent) = p.parent() {
                std::fs::create_dir_all(parent).expect("親ディレクトリ作成");
            }
            std::fs::write(&p, body).expect("テストファイル作成");
            p
        }
    }

    impl Drop for TempRoot {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn 先頭から読むと行が返り位置が進む() {
        let t = TempRoot::new("lines_head");
        t.bytes("a.jsonl", b"{\"n\":1}\n{\"n\":2}\n{\"n\":3}\n");
        let got = read_lines_impl(&t.path, "a.jsonl", 0, 2).expect("読める");
        assert_eq!(got.lines, vec!["{\"n\":1}", "{\"n\":2}"]);
        assert_eq!(got.next_offset, 16);
        assert!(!got.eof);
    }

    #[test]
    fn 返ってきた位置から読み直すと続きになる() {
        let t = TempRoot::new("lines_resume");
        t.bytes("a.jsonl", b"{\"n\":1}\n{\"n\":2}\n{\"n\":3}\n");
        let first = read_lines_impl(&t.path, "a.jsonl", 0, 2).expect("読める");
        let second = read_lines_impl(&t.path, "a.jsonl", first.next_offset, 2).expect("読める");
        assert_eq!(second.lines, vec!["{\"n\":3}"]);
        assert!(second.eof);
    }

    #[test]
    fn crlf_でも位置がずれない() {
        // 改行を落とす処理で長さを数え違えると、次の読み出しが行の途中から始まる。
        let t = TempRoot::new("lines_crlf");
        t.bytes("a.jsonl", b"{\"n\":1}\r\n{\"n\":2}\r\n");
        let first = read_lines_impl(&t.path, "a.jsonl", 0, 1).expect("読める");
        assert_eq!(first.lines, vec!["{\"n\":1}"]);
        let second = read_lines_impl(&t.path, "a.jsonl", first.next_offset, 1).expect("読める");
        assert_eq!(second.lines, vec!["{\"n\":2}"]);
    }

    #[test]
    fn 末尾に改行が無くても最後の行を落とさない() {
        let t = TempRoot::new("lines_noeol");
        t.bytes("a.jsonl", b"{\"n\":1}\n{\"n\":2}");
        let got = read_lines_impl(&t.path, "a.jsonl", 0, 10).expect("読める");
        assert_eq!(got.lines, vec!["{\"n\":1}", "{\"n\":2}"]);
        assert!(got.eof);
    }

    #[test]
    fn 端を越えた位置を指しても失敗せず端として返す() {
        let t = TempRoot::new("lines_past");
        t.bytes("a.jsonl", b"{\"n\":1}\n");
        let got = read_lines_impl(&t.path, "a.jsonl", 999, 10).expect("読める");
        assert!(got.lines.is_empty());
        assert!(got.eof);
    }

    #[test]
    fn 長すぎる一行は切って件数で返す() {
        // 改行の無いファイルを 1 行として読むと、流し読みのまま全体を持つことになる。
        let t = TempRoot::new("lines_long");
        let mut body = vec![b'x'; MAX_LINE_BYTES + 100];
        body.push(b'\n');
        t.bytes("a.log", &body);
        let got = read_lines_impl(&t.path, "a.log", 0, 10).expect("読める");
        assert_eq!(got.lines[0].len(), MAX_LINE_BYTES);
        assert_eq!(got.truncated_lines, 1);
        // 切っても位置は行の終わりまで進める（次が行の途中から始まらない）。
        assert!(got.eof);
    }

    #[test]
    fn 対象外の拡張子は読めない() {
        // ここを緩めると、業務文書がツリーを通らずに読めるようになる。
        let t = TempRoot::new("lines_ext");
        t.bytes("a.md", b"# hi\n");
        let err = read_lines_impl(&t.path, "a.md", 0, 10).expect_err("拒否される");
        assert!(err.contains(".log"));
    }

    #[test]
    fn ルート外へは出られない() {
        let t = TempRoot::new("lines_escape");
        t.bytes("inner/a.jsonl", b"{}\n");
        let outside = t.path.join("outside.jsonl");
        std::fs::write(&outside, b"{}\n").expect("外側ファイル作成");
        let inner = t.path.join("inner");
        let err = read_lines_impl(&inner, "../outside.jsonl", 0, 10).expect_err("拒否される");
        assert!(err.contains("ルート外"));
    }

    #[test]
    fn 行数の上限を超える指定は頭打ちにする() {
        let t = TempRoot::new("lines_ceiling");
        let body: Vec<u8> = (0..10)
            .flat_map(|i| format!("{}\n", i).into_bytes())
            .collect();
        t.bytes("a.log", &body);
        // 上限より大きい指定でも壊れない（ファイル側が先に尽きる）。
        let got = read_lines_impl(&t.path, "a.log", 0, usize::MAX).expect("読める");
        assert_eq!(got.lines.len(), 10);
    }
}
