//! 起動引数で渡されたファイルを画面へ回す。
//!
//! 外（MCP・エクスプローラの関連付け）から「このファイルを見せてほしい」と頼まれる経路。
//! 頼む側はアプリが動いているかを知らないので、どちらの状態でも同じ形（実行ファイルへ
//! パスを 1 つ渡す）で頼めるようにしてある。
//!
//! - 動いていないとき: 起動時の引数をここへ預け、画面が組み上がってから取りに来る。
//! - 動いているとき: 二重起動は single-instance が止め、引数だけがこちらへ回ってくる。
//!   窓を前へ出し、画面へ知らせる。

use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

/// 画面がまだ受け取れる状態でないときに、依頼を 1 件だけ預かる場所。
///
/// 溜めずに 1 件で上書きするのは、最後に頼まれたものだけが利用者の意図だから。
/// 起動直後に何度も頼まれても、開くのは最後の 1 つでよい。
#[derive(Default)]
pub struct PendingOpen(Mutex<Option<String>>);

/// 画面へ通知するイベント名（起動済みのアプリへ後から依頼が届いたとき）。
const OPEN_REQUEST_EVENT: &str = "open-request";

/// 起動引数から、開いてほしいファイルのパスを 1 つ取り出す。
///
/// 先頭は実行ファイル自身なので必ず捨てる。`-` で始まるものは OS・WebView・開発時の
/// 実行系が足す指定で、こちらの依頼ではないので飛ばす。残った最初の 1 つを対象とする
/// （2 つ以上渡されることは想定しないが、来ても最初の 1 つだけを見る）。
pub fn parse_open_arg(argv: &[String]) -> Option<String> {
    argv.iter()
        .skip(1)
        .find(|arg| !arg.starts_with('-') && !arg.is_empty())
        .cloned()
}

/// 実在するファイルのときだけ受け取る。
///
/// 引数には関係のない文字列が混ざりうる。存在しないものを通すと、画面が今開いている
/// フォルダを見当違いの場所へ切り替えてしまう（利用者から見ると勝手に閉じたように映る）。
fn accept(raw: &str) -> Option<String> {
    let path = std::path::Path::new(raw);
    if !path.is_file() {
        return None;
    }
    Some(path.to_string_lossy().into_owned())
}

/// 依頼を預けて、画面へ知らせる。画面がまだ無ければ預けるだけで終わる。
pub fn remember(app: &AppHandle, raw: &str) {
    let Some(path) = accept(raw) else {
        return;
    };
    if let Some(state) = app.try_state::<PendingOpen>() {
        if let Ok(mut slot) = state.0.lock() {
            *slot = Some(path.clone());
        }
    }
    let _ = app.emit(OPEN_REQUEST_EVENT, path);
}

/// 起動時の引数を預ける（画面ができてから `take_open_request` で取りに来る）。
pub fn remember_startup_args(app: &AppHandle) {
    let argv: Vec<String> = std::env::args().collect();
    if let Some(raw) = parse_open_arg(&argv) {
        remember(app, &raw);
    }
}

/// 二重起動を止めたときに、後から来た引数だけを受け取る。
///
/// 窓を前へ出すところまでを行う。頼んだ側から見て「開いた」と分かる必要があるが、
/// 裏に隠れたままでは開いたことに気づけない。
pub fn handle_second_instance(app: &AppHandle, argv: &[String]) {
    focus_main(app);
    if let Some(raw) = parse_open_arg(argv) {
        remember(app, &raw);
    }
}

/// 主窓を前へ出す。
///
/// 外から頼まれたときは、頼んだ側から見て「開いた」と分かる必要がある。畳んだままでも
/// 裏に隠れたままでも、押しても何も起きなかったように映る。
pub fn focus_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// 預かっている依頼を 1 件取り出す（取り出したら消える）。
///
/// 消すのは、画面を作り直すたびに同じファイルが開き直るのを避けるため。
#[tauri::command]
pub fn take_open_request(state: State<PendingOpen>) -> Option<String> {
    state.0.lock().ok().and_then(|mut slot| slot.take())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn argv(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| (*s).to_string()).collect()
    }

    #[test]
    fn 引数が無ければ対象は無い() {
        assert_eq!(parse_open_arg(&argv(&["md-business-desktop.exe"])), None);
    }

    #[test]
    fn 空の引数列でも落ちない() {
        assert_eq!(parse_open_arg(&[]), None);
    }

    #[test]
    fn 実行ファイル名の次のパスを対象にする() {
        let got = parse_open_arg(&argv(&["app.exe", "C:/work/docs/001.tsv"]));
        assert_eq!(got.as_deref(), Some("C:/work/docs/001.tsv"));
    }

    #[test]
    fn 実行系が足す指定は飛ばす() {
        let got = parse_open_arg(&argv(&["app.exe", "--webview-flag", "C:/work/a.tsv"]));
        assert_eq!(got.as_deref(), Some("C:/work/a.tsv"));
    }

    #[test]
    fn 指定しか無ければ対象は無い() {
        assert_eq!(parse_open_arg(&argv(&["app.exe", "--flag=x", "-q"])), None);
    }

    #[test]
    fn 空文字は対象にしない() {
        let got = parse_open_arg(&argv(&["app.exe", "", "C:/work/a.tsv"]));
        assert_eq!(got.as_deref(), Some("C:/work/a.tsv"));
    }

    #[test]
    fn 二つ以上渡されても最初の一つだけを見る() {
        let got = parse_open_arg(&argv(&["app.exe", "C:/a.tsv", "C:/b.tsv"]));
        assert_eq!(got.as_deref(), Some("C:/a.tsv"));
    }

    #[test]
    fn 実在しないパスは受け取らない() {
        assert_eq!(accept("C:/絶対に無いはずのフォルダ/none.tsv"), None);
    }

    #[test]
    fn 実在するファイルは受け取る() {
        let this = concat!(env!("CARGO_MANIFEST_DIR"), "/src/open_arg.rs");
        assert!(accept(this).is_some());
    }
}
