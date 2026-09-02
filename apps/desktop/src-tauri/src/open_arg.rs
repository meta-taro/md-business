//! 起動引数で渡されたファイルを画面へ回す。
//!
//! 外（MCP・エクスプローラの関連付け）から「このファイルを見せてほしい」と頼まれる経路。
//! 頼む側はアプリが動いているかを知らないので、どちらの状態でも同じ形（実行ファイルへ
//! パスを 1 つ渡す）で頼めるようにしてある。
//!
//! - 動いていないとき: 起動時の引数をここへ預け、画面が組み上がってから取りに来る。
//! - 動いているとき: 二重起動は single-instance が止め、引数だけがこちらへ回ってくる。
//!   窓を前へ出し、画面へ知らせる。

use tauri::{AppHandle, Emitter, Manager, State};

use crate::window_route::PendingByWindow;

/// 画面がまだ受け取れる状態でないときに、依頼を預かる場所。
///
/// 窓ごとに 1 件で上書きする。起動直後に何度も頼まれても、その窓で開くのは最後の 1 つでよい。
#[derive(Default)]
pub struct PendingOpen(PendingByWindow);

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

/// 実在する、このアプリで開ける種類のファイルのときだけ受け取る。
///
/// 引数には関係のない文字列が混ざりうる。存在しないものを通すと、画面が今開いている
/// フォルダを見当違いの場所へ切り替えてしまう（利用者から見ると勝手に閉じたように映る）。
///
/// 種類を画面と同じ範囲（`workspace::is_tree_ext_for`）へ絞るのは、この経路が外から任意のパスで
/// 叩けるため。今は関連付けを登録していないので実行ファイルを渡しても実行はされないが、
/// 「開けないものを開こうとして画面が別の場所を向く」ところまでは起こせる。
///
/// web を名乗るフォルダかどうかを、ここでは見ない。宣言（`md-business.yml`）を読み解くのは
/// 画面側の 1 か所だけと決めてあり、読み手を増やすと同じファイルに 2 つの答えが出る。
/// だから受け取る側は広いほうに合わせ、出すかどうかは画面が決める。狭いほうに合わせると、
/// 一覧に並んでいる `.astro` を頼んでも何も起きない——実際にそうなっていた。
fn accept(raw: &str) -> Option<String> {
    let path = std::path::Path::new(raw);
    if !path.is_file() {
        return None;
    }
    let ext = path.extension()?.to_string_lossy().to_lowercase();
    if !crate::workspace::is_tree_ext_for(ext.as_str(), true) {
        return None;
    }
    Some(path.to_string_lossy().into_owned())
}

/// 窓が閉じたときに、その窓宛の預かりを捨てる。
///
/// 窓の名前は使い回されるので、残すとあとから開いた窓が前の窓宛の依頼を受け取る。
pub fn forget(app: &AppHandle, label: &str) {
    if let Some(state) = app.try_state::<PendingOpen>() {
        state.0.clear(label);
    }
}

/// 依頼を預けて、画面へ知らせる。画面がまだ無ければ預けるだけで終わる。
///
/// 窓が複数あるので、まず行き先を決める。頼まれたファイルを含むフォルダを開いている窓が
/// あればそこへ、無ければ手前の窓へ。全部の窓へ配ると、頼んでいない側のフォルダまで
/// 切り替わる。
pub fn remember(app: &AppHandle, raw: &str) {
    let Some(path) = accept(raw) else {
        return;
    };
    let label = crate::window_route::target_for_path(app, std::path::Path::new(&path));
    crate::window_route::focus(app, &label);
    if let Some(state) = app.try_state::<PendingOpen>() {
        state.0.put(&label, path.clone());
    }
    let _ = app.emit_to(&label, OPEN_REQUEST_EVENT, path);
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
    // 前へ出すのは `remember` が行き先を決めてから。先に決め打ちで出すと、
    // 別の窓が受け取るファイルなのに手前だけが入れ替わる。
    match parse_open_arg(argv) {
        Some(raw) => remember(app, &raw),
        None => crate::window_route::focus(app, &crate::window_route::focused_or_main(app)),
    }
}

/// その窓が預かっている依頼を取り出す（取り出したら消える）。
///
/// 消すのは、画面を作り直すたびに同じファイルが開き直るのを避けるため。
#[tauri::command]
pub fn take_open_request(window: tauri::Window, state: State<PendingOpen>) -> Option<String> {
    state.0.take(window.label())
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

    /// 一時ディレクトリに 1 ファイル作り、その絶対パスを返す。
    fn temp_file(name: &str) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!("mdbiz_open_{}_{}", std::process::id(), name));
        std::fs::write(&path, "x").unwrap();
        path
    }

    #[test]
    fn 実在するファイルは受け取る() {
        let path = temp_file("ok.tsv");
        assert!(accept(&path.to_string_lossy()).is_some());
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn 扱えない拡張子は実在しても受け取らない() {
        for name in ["deny.exe", "deny.ps1", "deny.rs", "denyless"] {
            let path = temp_file(name);
            assert_eq!(accept(&path.to_string_lossy()), None, "{name}");
            let _ = std::fs::remove_file(&path);
        }
    }

    #[test]
    fn 拡張子の大小は問わない() {
        let path = temp_file("UPPER.TSV");
        assert!(accept(&path.to_string_lossy()).is_some());
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn サイトの部品も受け取る() {
        // web を名乗るフォルダでは、一覧に .astro / .ts / .css も並ぶ。
        // 一覧に出るのに外から開く口だけが受け取らないと、開いたつもりで何も起きない。
        for name in ["page.astro", "main.ts", "style.css", "index.html"] {
            let path = temp_file(name);
            assert!(accept(&path.to_string_lossy()).is_some(), "{name}");
            let _ = std::fs::remove_file(&path);
        }
    }

    #[test]
    fn 画像も受け取る() {
        let path = temp_file("shot.png");
        assert!(accept(&path.to_string_lossy()).is_some());
        let _ = std::fs::remove_file(&path);
    }
}
