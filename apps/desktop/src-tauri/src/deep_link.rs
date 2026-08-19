//! 共有リンク（`md-business://open?...`）を受け取って画面へ回す。
//!
//! 同じリポジトリを各自が clone している職場で、「この文書を見て」をチャットで渡すための経路。
//! リンクを押した側では、アプリが動いていなければ OS が起動し、動いていれば起動中のものへ
//! 回ってくる。どちらでも同じ形（1 本の URL）で届くようにしてある。
//!
//! - 動いていないとき: 起動時に `get_current()` で取り、画面ができてから取りに来る。
//! - 動いているとき: `on_open_url` で届く。二重起動は single-instance が止める。
//!
//! ここは**外部の任意のページから叩ける口**なので、この層では「うちのスキームで、
//! 素性の分かる文字列か」だけを見て預かる。何を開くかの判断は画面側が持つ
//! （手元に開いたことのあるフォルダの中にしか辿り着けないようにしてある）。

use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

/// 画面がまだ受け取れる状態でないときに、リンクを 1 件だけ預かる場所。
///
/// 溜めずに 1 件で上書きするのは、最後に押されたものだけが利用者の意図だから。
#[derive(Default)]
pub struct PendingLink(Mutex<Option<String>>);

/// 画面へ通知するイベント名（起動済みのアプリへ後からリンクが届いたとき）。
const LINK_REQUEST_EVENT: &str = "link-request";

/// うちのスキーム。これ以外は受け取らない。
const SCHEME_PREFIX: &str = "md-business://";

/// リンク 1 本の長さの上限。
///
/// 上限を置くのは、外から届く文字列をそのまま抱えないため。共有リンクはリポジトリ名と
/// ファイルパスしか運ばないので、この長さで足りなくなることはない。
const MAX_LEN: usize = 2048;

/// 預かってよい形かどうかだけを見る。
///
/// 中身（どのリポジトリの何を開くか）の検証は画面側で行う。ここで二重に判断すると、
/// 同じ規則が 2 か所に分かれて片方だけ緩む。
fn accept(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.len() > MAX_LEN {
        return None;
    }
    // 改行やタブが混ざったものは、コピー時に何かを巻き込んでいる。素性が怪しいので通さない。
    if trimmed.chars().any(char::is_control) {
        return None;
    }
    let head: String = trimmed.chars().take(SCHEME_PREFIX.len()).collect();
    if !head.eq_ignore_ascii_case(SCHEME_PREFIX) {
        return None;
    }
    Some(trimmed.to_string())
}

/// リンクを預けて、画面へ知らせる。画面がまだ無ければ預けるだけで終わる。
///
/// 窓を前へ出すところまで行うのは、押した側から見て「開いた」と分かる必要があるため。
/// 裏に隠れたままでは、押しても何も起きなかったように映る。
pub fn remember(app: &AppHandle, raw: &str) {
    let Some(url) = accept(raw) else {
        return;
    };
    crate::open_arg::focus_main(app);
    if let Some(state) = tauri::Manager::try_state::<PendingLink>(app) {
        if let Ok(mut slot) = state.0.lock() {
            *slot = Some(url.clone());
        }
    }
    let _ = app.emit(LINK_REQUEST_EVENT, url);
}

/// 起動のきっかけがリンクだった場合に、それを預ける。
#[cfg(desktop)]
pub fn remember_startup_link(app: &AppHandle) {
    use tauri_plugin_deep_link::DeepLinkExt;
    let Ok(Some(urls)) = app.deep_link().get_current() else {
        return;
    };
    // 複数渡されることは想定しないが、来ても最初の 1 つだけを見る。
    if let Some(url) = urls.first() {
        remember(app, url.as_str());
    }
}

/// 預かっているリンクを 1 件取り出す（取り出したら消える）。
///
/// 消すのは、画面を作り直すたびに同じリンクが開き直るのを避けるため。
#[tauri::command]
pub fn take_link_request(state: State<PendingLink>) -> Option<String> {
    state.0.lock().ok().and_then(|mut slot| slot.take())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 共有リンクは受け取る() {
        let got = accept("md-business://open?repo=github.com/o/r&path=a.tsv");
        assert_eq!(got.as_deref(), Some("md-business://open?repo=github.com/o/r&path=a.tsv"));
    }

    #[test]
    fn 大文字で書かれていても受け取る() {
        assert!(accept("MD-Business://open?repo=github.com/o/r&path=a.tsv").is_some());
    }

    #[test]
    fn 前後の空白は落とす() {
        let got = accept("  md-business://open?repo=github.com/o/r&path=a.tsv  ");
        assert_eq!(got.as_deref(), Some("md-business://open?repo=github.com/o/r&path=a.tsv"));
    }

    #[test]
    fn 別のスキームは受け取らない() {
        assert_eq!(accept("https://github.com/o/r/blob/main/a.tsv"), None);
        assert_eq!(accept("file:///C:/work/a.tsv"), None);
    }

    #[test]
    fn スキームだけを名乗る別物は受け取らない() {
        assert_eq!(accept("md-business-x://open?repo=github.com/o/r&path=a.tsv"), None);
    }

    #[test]
    fn 制御文字が混ざっていれば受け取らない() {
        assert_eq!(accept("md-business://open?path=a.tsv\nrm -rf"), None);
    }

    #[test]
    fn 長すぎるものは受け取らない() {
        let long = format!("md-business://open?path={}", "a".repeat(MAX_LEN));
        assert_eq!(accept(&long), None);
    }

    #[test]
    fn 空文字は受け取らない() {
        assert_eq!(accept(""), None);
        assert_eq!(accept("   "), None);
    }
}
