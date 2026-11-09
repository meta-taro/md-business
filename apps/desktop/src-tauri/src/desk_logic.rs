//! 割符の机へ繋ぐ線の純ロジック（Tauri / OS の口に非依存）。
//!
//! 机の口の場所は割符側の決め方に揃えないと繋がらないので、その決め方をここに写す。
//! OS ごとの分岐も引数で受け、どの OS の上でも全分岐を単体検査できるようにする。
//! 行の切り出しと送る行の検査もここに置き、配線層（desk.rs）は読み書きの橋渡しだけを持つ。

use std::path::PathBuf;

/// 1 行の上限。居場所の行は文書名と場所でせいぜい 1KB 強なので、桁違いに長い行は
/// 相手の不具合か嫌がらせとみなして読まずに捨てる（溜め込むとメモリを食われる）。
pub const MAX_LINE_BYTES: usize = 16 * 1024;

/// 口の場所の決め方が分かれる OS の区分。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DeskPlatform {
    Windows,
    MacOs,
    Other,
}

impl DeskPlatform {
    /// いま動いている OS。
    pub fn current() -> Self {
        if cfg!(windows) {
            DeskPlatform::Windows
        } else if cfg!(target_os = "macos") {
            DeskPlatform::MacOs
        } else {
            DeskPlatform::Other
        }
    }
}

/// 机の口の場所。Windows は名前付きパイプの名前、ほかは Unix ソケットのパス。
///
/// 割符と同じ順で決める: `WARIFU_HOME` → `XDG_RUNTIME_DIR/warifu` → ホーム配下。
/// Windows では家を分けたときだけパイプ名に印を付ける（同じ機械の 2 つ目の身元のため）。
pub fn desk_address(
    platform: DeskPlatform,
    warifu_home: Option<&str>,
    runtime_dir: Option<&str>,
    user_home: Option<&str>,
) -> PathBuf {
    if platform == DeskPlatform::Windows {
        // 名前付きパイプは場所ではなく名前なので、家のパスから使える文字だけを印にする。
        if let Some(home) = warifu_home {
            let mark: String = home
                .chars()
                .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
                .collect();
            if !mark.is_empty() {
                return PathBuf::from(format!(r"\\.\pipe\warifu-desk-{mark}"));
            }
        }
        return PathBuf::from(r"\\.\pipe\warifu-desk");
    }
    // 明示的に分けた家がいちばん強い（試験や 2 つ目の身元のために分けたのだから）。
    let dir = if let Some(home) = warifu_home {
        PathBuf::from(home)
    } else if let Some(runtime) = runtime_dir {
        PathBuf::from(runtime).join("warifu")
    } else {
        let base = PathBuf::from(user_home.unwrap_or("/tmp"));
        if platform == DeskPlatform::MacOs {
            base.join("Library/Application Support/warifu")
        } else {
            base.join(".local/share/warifu")
        }
    };
    dir.join("desk.sock")
}

/// 机へ送る 1 行を検査して改行を付ける。改行を含む・長すぎる・空の行は送らない
/// （改行が混ざると 1 回の送信が 2 行に割れ、机には別の頼みとして届く）。
pub fn frame_outgoing(line: &str) -> Option<String> {
    if line.is_empty() || line.len() > MAX_LINE_BYTES || line.contains(['\n', '\r']) {
        return None;
    }
    Some(format!("{line}\n"))
}

/// 机から届くバイト列を行に切り出す。上限を超えた行は次の改行まで読み捨てる。
#[derive(Debug, Default)]
pub struct LineSplitter {
    buf: Vec<u8>,
    discarding: bool,
}

impl LineSplitter {
    /// 届いた分を足し、揃った行を返す。UTF-8 でない行と空行は捨てる。
    pub fn push(&mut self, chunk: &[u8]) -> Vec<String> {
        let mut lines = Vec::new();
        for &byte in chunk {
            if byte == b'\n' {
                if !self.discarding {
                    if self.buf.last() == Some(&b'\r') {
                        self.buf.pop();
                    }
                    if let Ok(line) = std::str::from_utf8(&self.buf) {
                        if !line.is_empty() {
                            lines.push(line.to_string());
                        }
                    }
                }
                self.buf.clear();
                self.discarding = false;
            } else if !self.discarding {
                self.buf.push(byte);
                if self.buf.len() > MAX_LINE_BYTES {
                    self.buf.clear();
                    self.discarding = true;
                }
            }
        }
        lines
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── desk_address ─────────────────────────────────────────────────────

    #[test]
    fn windows_default_pipe() {
        let got = desk_address(DeskPlatform::Windows, None, None, Some(r"C:\Users\a"));
        assert_eq!(got, PathBuf::from(r"\\.\pipe\warifu-desk"));
    }

    #[test]
    fn windows_home_marks_pipe_with_filtered_chars() {
        let got = desk_address(DeskPlatform::Windows, Some(r"C:\w\second-1_x"), None, None);
        assert_eq!(got, PathBuf::from(r"\\.\pipe\warifu-desk-Cwsecond-1_x"));
    }

    #[test]
    fn windows_home_without_usable_chars_falls_back() {
        let got = desk_address(DeskPlatform::Windows, Some(r"\\:"), None, None);
        assert_eq!(got, PathBuf::from(r"\\.\pipe\warifu-desk"));
    }

    #[test]
    fn unix_home_wins_over_runtime_dir() {
        let got = desk_address(DeskPlatform::Other, Some("/w"), Some("/run/user/1000"), Some("/home/a"));
        assert_eq!(got, PathBuf::from("/w").join("desk.sock"));
    }

    #[test]
    fn unix_runtime_dir_next() {
        let got = desk_address(DeskPlatform::Other, None, Some("/run/user/1000"), Some("/home/a"));
        assert_eq!(got, PathBuf::from("/run/user/1000").join("warifu").join("desk.sock"));
    }

    #[test]
    fn linux_falls_back_to_local_share() {
        let got = desk_address(DeskPlatform::Other, None, None, Some("/home/a"));
        assert_eq!(got, PathBuf::from("/home/a").join(".local/share/warifu").join("desk.sock"));
    }

    #[test]
    fn macos_falls_back_to_application_support() {
        let got = desk_address(DeskPlatform::MacOs, None, None, Some("/Users/a"));
        assert_eq!(
            got,
            PathBuf::from("/Users/a").join("Library/Application Support/warifu").join("desk.sock")
        );
    }

    #[test]
    fn unix_without_home_uses_tmp() {
        let got = desk_address(DeskPlatform::Other, None, None, None);
        assert_eq!(got, PathBuf::from("/tmp").join(".local/share/warifu").join("desk.sock"));
    }

    // ── frame_outgoing ───────────────────────────────────────────────────

    #[test]
    fn frames_a_line_with_newline() {
        assert_eq!(frame_outgoing(r#"{"型":"居場所を聞く"}"#).as_deref(), Some("{\"型\":\"居場所を聞く\"}\n"));
    }

    #[test]
    fn refuses_line_breaks_empty_and_overlong() {
        assert_eq!(frame_outgoing("a\nb"), None);
        assert_eq!(frame_outgoing("a\rb"), None);
        assert_eq!(frame_outgoing(""), None);
        assert_eq!(frame_outgoing(&"a".repeat(MAX_LINE_BYTES + 1)), None);
        assert!(frame_outgoing(&"a".repeat(MAX_LINE_BYTES)).is_some());
    }

    // ── LineSplitter ─────────────────────────────────────────────────────

    #[test]
    fn splits_lines_across_chunks() {
        let mut s = LineSplitter::default();
        assert!(s.push(b"{\"a\"").is_empty());
        assert_eq!(s.push(b":1}\n{\"b\":2}\n{"), vec!["{\"a\":1}", "{\"b\":2}"]);
        assert_eq!(s.push(b"}\n"), vec!["{}"]);
    }

    #[test]
    fn strips_crlf_and_skips_blank_lines() {
        let mut s = LineSplitter::default();
        assert_eq!(s.push(b"x\r\n\r\n\ny\n"), vec!["x", "y"]);
    }

    #[test]
    fn keeps_multibyte_split_across_chunks() {
        let bytes = "居場所\n".as_bytes();
        let mut s = LineSplitter::default();
        assert!(s.push(&bytes[..4]).is_empty());
        assert_eq!(s.push(&bytes[4..]), vec!["居場所"]);
    }

    #[test]
    fn drops_invalid_utf8_line() {
        let mut s = LineSplitter::default();
        assert_eq!(s.push(b"\xff\xfe\nok\n"), vec!["ok"]);
    }

    #[test]
    fn discards_overlong_line_until_next_newline() {
        let mut s = LineSplitter::default();
        assert!(s.push(&vec![b'a'; MAX_LINE_BYTES + 1]).is_empty());
        assert!(s.push(b"still the same line").is_empty());
        assert_eq!(s.push(b"\nnext\n"), vec!["next"]);
    }
}
