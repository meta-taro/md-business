//! ファイル情報（右クリック →「ファイル情報」）の測定。
//!
//! 容量・更新日時（`file_stat`）はメタデータだけで返せるので即答する。行数・文字コード・
//! 改行コード・SHA-256（`file_digest`）はファイル全体を 1 度読む必要があるため分けてあり、
//! フロントは先に返る方から順に埋める。数百 MB のファイルでも枠ごと待たせないための分割。
//!
//! `file_digest` は本文を全部持たずにチャンク単位で流し読みし、SHA-256 と改行の数え上げと
//! UTF-8 妥当性検査を 1 パスで同時に済ませる。
//!
//! workspace.rs と同流儀で、ロジックは Tauri 非依存の `*_impl` に寄せて単体テストする。

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::Path;
use std::time::UNIX_EPOCH;

use crate::workspace::resolve_in_root;

/// 判定できた文字コード。BOM と UTF-8 妥当性で決まるものだけを持ち、推測はしない。
#[derive(Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum FileEncoding {
    Utf8,
    Utf8Bom,
    Utf16Le,
    Utf16Be,
    /// UTF-8 として読めず BOM も無い。バイナリか未対応の文字コード。
    Unknown,
}

/// 改行コード。2 種類以上混ざれば Mixed、改行が 1 つも無ければ None。
#[derive(Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LineEnding {
    Lf,
    Crlf,
    Cr,
    Mixed,
    None,
}

/// メタデータだけで返せる情報。
#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileStat {
    pub size: u64,
    /// 更新日時（UNIX epoch ミリ秒）。FS から取れない場合は None。
    pub modified_ms: Option<i64>,
}

/// ファイル全体を 1 度読んで測る情報。
#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileDigest {
    /// 小文字 16 進 64 桁。BOM を含む生バイト列に対して計算する。
    pub sha256: String,
    /// 行数。UTF-8 として読めないファイルでは数えない（None）。
    pub line_count: Option<u64>,
    pub encoding: FileEncoding,
    /// 改行コード。文字コードが判定できないファイルでは None。
    pub line_ending: Option<LineEnding>,
}

/// 流し読みで 1 パス測るためのチャンクサイズ。
const CHUNK: usize = 64 * 1024;

/// 改行の数え上げ状態。チャンク境界を跨ぐ CR の持ち越し（`pending_cr`）を持つ。
#[derive(Default)]
struct LineScan {
    lf: u64,
    crlf: u64,
    cr: u64,
    /// 直前のチャンクが CR で終わった。次の 1 バイトが LF なら CRLF、そうでなければ CR。
    pending_cr: bool,
    last_byte: Option<u8>,
    total: u64,
}

impl LineScan {
    fn feed(&mut self, chunk: &[u8]) {
        let mut i = 0;
        while i < chunk.len() {
            let b = chunk[i];
            if self.pending_cr {
                self.pending_cr = false;
                if b == b'\n' {
                    self.crlf += 1;
                    i += 1;
                    continue;
                }
                // LF が続かなかったので単独 CR 確定。b 自体はこの後で通常処理する。
                self.cr += 1;
            }
            if b == b'\r' {
                self.pending_cr = true;
            } else if b == b'\n' {
                self.lf += 1;
            }
            i += 1;
        }
        self.total += chunk.len() as u64;
        if let Some(&last) = chunk.last() {
            self.last_byte = Some(last);
        }
    }

    fn finish(&mut self) {
        // ファイル末尾の CR は次バイトが来ないので単独 CR 確定。
        if self.pending_cr {
            self.pending_cr = false;
            self.cr += 1;
        }
    }

    /// 行数。最後の行が改行で終わっていなければ、その分を 1 行として数える。
    fn line_count(&self) -> u64 {
        if self.total == 0 {
            return 0;
        }
        let terminators = self.lf + self.crlf + self.cr;
        let ends_with_terminator = matches!(self.last_byte, Some(b'\n') | Some(b'\r'));
        terminators + if ends_with_terminator { 0 } else { 1 }
    }

    fn line_ending(&self) -> LineEnding {
        let kinds = [
            (self.lf, LineEnding::Lf),
            (self.crlf, LineEnding::Crlf),
            (self.cr, LineEnding::Cr),
        ];
        let present: Vec<LineEnding> = kinds
            .iter()
            .filter(|(n, _)| *n > 0)
            .map(|(_, k)| *k)
            .collect();
        match present.len() {
            0 => LineEnding::None,
            1 => present[0],
            _ => LineEnding::Mixed,
        }
    }
}

/// UTF-8 妥当性のチャンク越し検査。末尾の不完全なシーケンス（最大 3 バイト）を持ち越す。
#[derive(Default)]
struct Utf8Scan {
    valid: bool,
    /// 次のチャンクの先頭と繋げて判定する、途中で切れた multibyte の断片。
    carry: Vec<u8>,
}

impl Utf8Scan {
    fn new() -> Self {
        Utf8Scan {
            valid: true,
            carry: Vec::new(),
        }
    }

    fn feed(&mut self, chunk: &[u8]) {
        if !self.valid {
            return;
        }
        // 持ち越しがあるときだけ連結する（通常はチャンクをそのまま検査する）。
        let buf: &[u8] = if self.carry.is_empty() {
            chunk
        } else {
            self.carry.extend_from_slice(chunk);
            &self.carry
        };
        match std::str::from_utf8(buf) {
            Ok(_) => self.carry.clear(),
            Err(e) => {
                if e.error_len().is_some() {
                    // 不正なバイト列。以降は検査せず Unknown 扱いにする。
                    self.valid = false;
                    self.carry.clear();
                } else {
                    // チャンク境界で multibyte が切れただけ。末尾を次へ回す。
                    let tail = buf[e.valid_up_to()..].to_vec();
                    self.carry = tail;
                }
            }
        }
    }

    /// 末尾に不完全なシーケンスが残っていれば不正。
    fn finish(&mut self) -> bool {
        if !self.carry.is_empty() {
            self.valid = false;
        }
        self.valid
    }
}

/// BOM から文字コードを決める。BOM が無ければ None（UTF-8 妥当性の判定へ回す）。
fn encoding_from_bom(head: &[u8]) -> Option<FileEncoding> {
    if head.starts_with(&[0xEF, 0xBB, 0xBF]) {
        Some(FileEncoding::Utf8Bom)
    } else if head.starts_with(&[0xFF, 0xFE]) {
        Some(FileEncoding::Utf16Le)
    } else if head.starts_with(&[0xFE, 0xFF]) {
        Some(FileEncoding::Utf16Be)
    } else {
        None
    }
}

/// ルート配下のファイルのメタデータを返す（Tauri 非依存の実体）。本文は読まない。
pub fn file_stat_impl(root: &Path, rel_path: &str) -> Result<FileStat, String> {
    let path = resolve_in_root(root, rel_path)?;
    let meta = std::fs::metadata(&path).map_err(|e| format!("情報取得失敗: {}", e))?;
    // 1970 年より前のタイムスタンプは duration_since が Err になる。値を捏造せず None にする。
    let modified_ms = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64);
    Ok(FileStat {
        size: meta.len(),
        modified_ms,
    })
}

/// ルート配下のファイルを 1 度流し読みし、SHA-256・行数・文字コード・改行コードを返す。
///
/// UTF-8 系（BOM 無し UTF-8 / UTF-8 BOM）以外は行数・改行コードを返さない。UTF-16 やバイナリを
/// バイト単位で数えると、意味のない数字が出るため（呼び出し側は「判定できません」を出す）。
pub fn file_digest_impl(root: &Path, rel_path: &str) -> Result<FileDigest, String> {
    let path = resolve_in_root(root, rel_path)?;
    let file = std::fs::File::open(&path).map_err(|e| format!("読み取り失敗: {}", e))?;
    let mut reader = std::io::BufReader::new(file);

    let mut hasher = Sha256::new();
    let mut lines = LineScan::default();
    let mut utf8 = Utf8Scan::new();
    let mut head: Vec<u8> = Vec::new();
    let mut buf = vec![0u8; CHUNK];

    loop {
        let n = reader
            .read(&mut buf)
            .map_err(|e| format!("読み取り失敗: {}", e))?;
        if n == 0 {
            break;
        }
        let chunk = &buf[..n];
        hasher.update(chunk);
        lines.feed(chunk);
        utf8.feed(chunk);
        if head.len() < 3 {
            head.extend_from_slice(&chunk[..n.min(3 - head.len())]);
        }
    }
    lines.finish();
    let valid_utf8 = utf8.finish();

    let encoding = encoding_from_bom(&head).unwrap_or(if valid_utf8 {
        FileEncoding::Utf8
    } else {
        FileEncoding::Unknown
    });
    let countable = matches!(encoding, FileEncoding::Utf8 | FileEncoding::Utf8Bom);

    Ok(FileDigest {
        sha256: format!("{:x}", hasher.finalize()),
        line_count: countable.then(|| lines.line_count()),
        encoding,
        line_ending: countable.then(|| lines.line_ending()),
    })
}

/// フロントから `invoke("file_stat", { root, relPath })` で呼ぶ薄いラッパ。
#[tauri::command]
pub fn file_stat(root: String, rel_path: String) -> Result<FileStat, String> {
    file_stat_impl(Path::new(&root), &rel_path)
}

/// フロントから `invoke("file_digest", { root, relPath })` で呼ぶ薄いラッパ。
///
/// 非 async のコマンドは main スレッドで走り、大きいファイルでは UI が固まる。
/// 読み取りはブロッキングスレッドへ逃がす。
#[tauri::command]
pub async fn file_digest(root: String, rel_path: String) -> Result<FileDigest, String> {
    tauri::async_runtime::spawn_blocking(move || file_digest_impl(Path::new(&root), &rel_path))
        .await
        .map_err(|e| format!("測定に失敗しました: {}", e))?
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

        /// バイト列をそのまま書く（BOM・不正 UTF-8・CRLF を str 経由で崩さないため）。
        fn bytes(&self, rel: &str, body: &[u8]) -> PathBuf {
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

    // ── file_stat_impl ───────────────────────────────────────────────────

    #[test]
    fn stat_容量を返す() {
        let root = TempRoot::new("stat_size");
        root.bytes("a.md", b"hello");
        let stat = file_stat_impl(&root.path, "a.md").expect("取得成功");
        assert_eq!(stat.size, 5);
    }

    #[test]
    fn stat_更新日時はエポックミリ秒で返る() {
        let root = TempRoot::new("stat_mtime");
        root.bytes("a.md", b"x");
        let stat = file_stat_impl(&root.path, "a.md").expect("取得成功");
        // 具体値は環境依存。2020-01-01 より後であることだけ見る（桁を取り違えていれば落ちる）。
        assert!(stat.modified_ms.expect("更新日時あり") > 1_577_836_800_000);
    }

    #[test]
    fn stat_ルート外は拒否する() {
        let root = TempRoot::new("stat_escape");
        root.bytes("a.md", b"x");
        assert!(file_stat_impl(&root.path, "../outside.md").is_err());
    }

    #[test]
    fn stat_対象外の拡張子は拒否する() {
        let root = TempRoot::new("stat_ext");
        root.bytes("a.txt", b"x");
        assert!(file_stat_impl(&root.path, "a.txt").is_err());
    }

    // ── file_digest_impl / SHA-256 ───────────────────────────────────────

    #[test]
    fn digest_空ファイルのsha256は既知の値になる() {
        let root = TempRoot::new("dg_empty");
        root.bytes("a.md", b"");
        let d = file_digest_impl(&root.path, "a.md").expect("測定成功");
        assert_eq!(
            d.sha256,
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
        assert_eq!(d.line_count, Some(0));
        assert_eq!(d.line_ending, Some(LineEnding::None));
    }

    #[test]
    fn digest_abcのsha256は既知の値になる() {
        let root = TempRoot::new("dg_abc");
        root.bytes("a.md", b"abc");
        let d = file_digest_impl(&root.path, "a.md").expect("測定成功");
        assert_eq!(
            d.sha256,
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn digest_チャンク境界を跨いでも同じsha256になる() {
        let root = TempRoot::new("dg_chunk");
        // 64KB 境界を跨ぐ長さ。1 パス実装が境界で壊れていないことを見る。
        let body = vec![b'a'; CHUNK * 2 + 123];
        root.bytes("a.md", &body);
        let d = file_digest_impl(&root.path, "a.md").expect("測定成功");
        let expected = format!("{:x}", Sha256::digest(&body));
        assert_eq!(d.sha256, expected);
    }

    // ── 行数 ─────────────────────────────────────────────────────────────

    #[test]
    fn digest_末尾改行ありは改行の数と行数が一致する() {
        let root = TempRoot::new("dg_lines_lf");
        root.bytes("a.md", b"a\nb\nc\n");
        let d = file_digest_impl(&root.path, "a.md").expect("測定成功");
        assert_eq!(d.line_count, Some(3));
        assert_eq!(d.line_ending, Some(LineEnding::Lf));
    }

    #[test]
    fn digest_末尾改行なしは最後の行も数える() {
        let root = TempRoot::new("dg_lines_noeol");
        root.bytes("a.md", b"a\nb\nc");
        let d = file_digest_impl(&root.path, "a.md").expect("測定成功");
        assert_eq!(d.line_count, Some(3));
    }

    #[test]
    fn digest_改行が無ければ1行() {
        let root = TempRoot::new("dg_lines_one");
        root.bytes("a.md", b"abc");
        let d = file_digest_impl(&root.path, "a.md").expect("測定成功");
        assert_eq!(d.line_count, Some(1));
        assert_eq!(d.line_ending, Some(LineEnding::None));
    }

    // ── 改行コード ───────────────────────────────────────────────────────

    #[test]
    fn digest_crlfをlfと二重に数えない() {
        let root = TempRoot::new("dg_crlf");
        root.bytes("a.md", b"a\r\nb\r\n");
        let d = file_digest_impl(&root.path, "a.md").expect("測定成功");
        assert_eq!(d.line_ending, Some(LineEnding::Crlf));
        assert_eq!(d.line_count, Some(2));
    }

    #[test]
    fn digest_単独crを認識する() {
        let root = TempRoot::new("dg_cr");
        root.bytes("a.md", b"a\rb\r");
        let d = file_digest_impl(&root.path, "a.md").expect("測定成功");
        assert_eq!(d.line_ending, Some(LineEnding::Cr));
        assert_eq!(d.line_count, Some(2));
    }

    #[test]
    fn digest_二種類以上混ざればmixed() {
        let root = TempRoot::new("dg_mixed");
        root.bytes("a.md", b"a\r\nb\nc\n");
        let d = file_digest_impl(&root.path, "a.md").expect("測定成功");
        assert_eq!(d.line_ending, Some(LineEnding::Mixed));
        assert_eq!(d.line_count, Some(3));
    }

    #[test]
    fn digest_チャンク境界のcrlfを分断して数えない() {
        let root = TempRoot::new("dg_crlf_boundary");
        // CR がチャンク末尾・LF が次チャンク先頭に来るよう長さを合わせる。
        let mut body = vec![b'a'; CHUNK - 1];
        body.extend_from_slice(b"\r\nb");
        root.bytes("a.md", &body);
        let d = file_digest_impl(&root.path, "a.md").expect("測定成功");
        assert_eq!(d.line_ending, Some(LineEnding::Crlf));
        assert_eq!(d.line_count, Some(2));
    }

    // ── 文字コード ───────────────────────────────────────────────────────

    #[test]
    fn digest_bom無しの日本語はutf8() {
        let root = TempRoot::new("dg_utf8");
        root.bytes("a.md", "日本語\n".as_bytes());
        let d = file_digest_impl(&root.path, "a.md").expect("測定成功");
        assert_eq!(d.encoding, FileEncoding::Utf8);
    }

    #[test]
    fn digest_utf8_bomを見分ける() {
        let root = TempRoot::new("dg_bom");
        let mut body = vec![0xEF, 0xBB, 0xBF];
        body.extend_from_slice("あ\n".as_bytes());
        root.bytes("a.md", &body);
        let d = file_digest_impl(&root.path, "a.md").expect("測定成功");
        assert_eq!(d.encoding, FileEncoding::Utf8Bom);
        // BOM 付きでも行は数える（UTF-8 系なので）。
        assert_eq!(d.line_count, Some(1));
    }

    #[test]
    fn digest_utf16_bomは行数を数えない() {
        let root = TempRoot::new("dg_utf16");
        // UTF-16LE BOM + "a\n"
        root.bytes("a.md", &[0xFF, 0xFE, 0x61, 0x00, 0x0A, 0x00]);
        let d = file_digest_impl(&root.path, "a.md").expect("測定成功");
        assert_eq!(d.encoding, FileEncoding::Utf16Le);
        // バイト単位で数えると誤った数になるので、数字を出さない。
        assert_eq!(d.line_count, None);
        assert_eq!(d.line_ending, None);
    }

    #[test]
    fn digest_不正なutf8はunknownで行数を出さない() {
        let root = TempRoot::new("dg_invalid");
        root.bytes("a.md", &[0x41, 0xC3, 0x28]);
        let d = file_digest_impl(&root.path, "a.md").expect("測定成功");
        assert_eq!(d.encoding, FileEncoding::Unknown);
        assert_eq!(d.line_count, None);
        assert_eq!(d.line_ending, None);
    }

    #[test]
    fn digest_チャンク境界で切れた多バイト文字をunknownにしない() {
        let root = TempRoot::new("dg_multibyte_boundary");
        // "あ"（3 バイト）が 64KB 境界を跨ぐ位置に来るよう詰める。
        let mut body = vec![b'a'; CHUNK - 1];
        body.extend_from_slice("あ".as_bytes());
        root.bytes("a.md", &body);
        let d = file_digest_impl(&root.path, "a.md").expect("測定成功");
        assert_eq!(d.encoding, FileEncoding::Utf8);
    }

    #[test]
    fn digest_末尾で切れた多バイト文字はunknown() {
        let root = TempRoot::new("dg_truncated_tail");
        // "あ" の 3 バイトのうち 2 バイトだけ。
        root.bytes("a.md", &"あ".as_bytes()[..2]);
        let d = file_digest_impl(&root.path, "a.md").expect("測定成功");
        assert_eq!(d.encoding, FileEncoding::Unknown);
    }

    #[test]
    fn digest_ルート外は拒否する() {
        let root = TempRoot::new("dg_escape");
        root.bytes("a.md", b"x");
        assert!(file_digest_impl(&root.path, "../outside.md").is_err());
    }
}
