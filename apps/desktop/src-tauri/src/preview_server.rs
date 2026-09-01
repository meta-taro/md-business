//! ブラウザ表示用のローカルサーバー（配線）。
//!
//! 何を返すかの判断は [`crate::preview_server_logic`] にあり、ここは
//! 「待ち受ける・受け取る・返す・畳む」だけを持つ。
//!
//! ディスクには書かない。組み立て済みのページを丸ごと覚えておき、要求が来たら
//! そこから引く。書き出し（`export_site`）とは中身の作り方が同じで、置き場所だけが違う。
//!
//! 画像だけは覚えない。どこにあるかだけ控えておき、要求のたびに元のファイルを読む。
//! 覚えると、保存のたびに写真の枚数ぶんの中身が丸ごと積み替わる。

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::net::{Ipv4Addr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde::Serialize;
use tauri::AppHandle;

use tauri_plugin_opener::OpenerExt;

use crate::preview_server_logic::{
    browser_probe_paths, browser_program, content_security_policy, content_type,
    exported_content_security_policy, html_response, http_response,
    http_response_bytes, inject_reload, parse_request_line, resolve_policy, route, Route,
    SitePolicy,
};
use crate::trust::is_project_trusted;
use crate::workspace::{resolve_site_asset_in_root, SiteAsset, SiteFile};

/// 覚えているページ一式と、その版。版はブラウザ側が入れ替わりを知るために使う。
struct Site {
    pages: HashMap<String, String>,
    /// サイト内での置き場所 → 元のファイル。中身ではなく在り処だけを持つ。
    assets: HashMap<String, PathBuf>,
    version: u64,
    /// このページ一式の中で script をどこまで動かすか。宣言と同意の結果として
    /// 画面側から渡ってくる。ここで読み直さないので、宣言の読み間違いが実行に化けない。
    policy: SitePolicy,
}

/// 立っているサーバー 1 つぶん。
struct Running {
    token: String,
    port: u16,
    site: Arc<Mutex<Site>>,
    /// 受け付けを止める合図。立てたときの待ち受けを起こすために使う。
    stopping: Arc<AtomicBool>,
}

/// 窓が持つ実行時状態。1 つの窓で立っているのは常に 0 個か 1 個。
#[derive(Default)]
pub struct PreviewServerState {
    running: Mutex<Option<Running>>,
}

/// 画面へ返す、開くべき URL。
#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
pub struct PreviewServerInfo {
    pub url: String,
    pub port: u16,
}

/// 推測できない 16 バイトを 16 進で。URL に入れる合鍵と、ページごとの印に使う。
fn random_hex() -> String {
    let mut bytes = [0u8; 16];
    // OS の乱数が引けない環境は考えにくいが、引けないまま固定値へ落とすと
    // 合鍵も印も推測できるものになる。出さずに落ちるほうが安全側なので、ここで止める。
    getrandom::fill(&mut bytes).expect("OS の乱数を引けません");
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn to_pages(files: Vec<SiteFile>) -> HashMap<String, String> {
    files
        .into_iter()
        .map(|file| (file.path.replace('\\', "/"), file.content))
        .collect()
}

/// サイトに載せるファイルの在り処を控える。開いているフォルダの外・出せない種類は
/// ここで落ちる（読めない 1 つのために、見せること自体を止めない）。
fn to_assets(root: &Path, assets: Vec<SiteAsset>) -> HashMap<String, PathBuf> {
    assets
        .into_iter()
        .filter_map(|asset| {
            let source = resolve_site_asset_in_root(root, &asset.src).ok()?;
            Some((asset.dest.replace('\\', "/"), source))
        })
        .collect()
}

/// 待ち受けを立て、受け付けの繰り返しを別の筋で回す。
fn start_server(
    root: &Path,
    files: Vec<SiteFile>,
    assets: Vec<SiteAsset>,
    policy: SitePolicy,
) -> Result<Running, String> {
    // 本文から作ったページが 1 つも無くても、書いた HTML だけのサイトは成立する。
    if files.is_empty() && assets.is_empty() {
        return Err("見せるページがありません".to_string());
    }
    // 0 番を渡して OS に空きを選ばせる。ポートは押した時点で画面へ渡すので、
    // 覚えておく相手がいない（覚えると「前回のポートが塞がっている」の分岐が増えるだけ）。
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
        .map_err(|error| format!("待ち受けを開けません: {error}"))?;
    let port = listener
        .local_addr()
        .map_err(|error| format!("待ち受け先を読めません: {error}"))?
        .port();

    let token = random_hex();
    let site = Arc::new(Mutex::new(Site {
        pages: to_pages(files),
        assets: to_assets(root, assets),
        version: 1,
        policy,
    }));
    let stopping = Arc::new(AtomicBool::new(false));

    let accept_token = token.clone();
    let accept_site = Arc::clone(&site);
    let accept_stopping = Arc::clone(&stopping);
    thread::spawn(move || {
        for stream in listener.incoming() {
            if accept_stopping.load(Ordering::SeqCst) {
                break;
            }
            let Ok(stream) = stream else { continue };
            let token = accept_token.clone();
            let site = Arc::clone(&accept_site);
            // 1 本ずつ順に返すと、ページと CSS を同時に取りに来たときに待ちが出る。
            thread::spawn(move || serve(stream, &token, &site));
        }
    });

    Ok(Running {
        token,
        port,
        site,
        stopping,
    })
}

/// 1 本の接続に応える。
fn serve(mut stream: TcpStream, token: &str, site: &Mutex<Site>) {
    // 要求行を送ってこない相手にぶら下がったままにしない。
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));

    let mut line = String::new();
    if BufReader::new(&stream).read_line(&mut line).is_err() {
        return;
    }
    let response = match parse_request_line(&line) {
        None => http_response(400, "text/plain; charset=utf-8", "要求を読めません"),
        Some(request) if request.method != "GET" => {
            http_response(404, "text/plain; charset=utf-8", "見つかりません")
        }
        Some(request) => respond(&request.target, token, site),
    };
    let _ = stream.write_all(&response);
    let _ = stream.flush();
}

fn respond(target: &str, token: &str, site: &Mutex<Site>) -> Vec<u8> {
    let not_found = || http_response(404, "text/plain; charset=utf-8", "見つかりません");
    let Ok(site) = site.lock() else {
        return http_response(400, "text/plain; charset=utf-8", "中身を読めません");
    };
    match route(token, target) {
        Route::NotFound => not_found(),
        Route::Version => {
            http_response(200, "text/plain; charset=utf-8", &site.version.to_string())
        }
        Route::Page(key) => {
            if let Some(content) = site.pages.get(&key) {
                let kind = content_type(&key);
                return if kind.starts_with("text/html") {
                    // 印はページごとに引き直す。使い回すと、1 枚から漏れた印が
                    // 以後どのページでも通ってしまう。
                    let nonce = random_hex();
                    html_response(
                        &inject_reload(content, token, &nonce),
                        &content_security_policy(&site.policy, &nonce),
                    )
                } else {
                    http_response(200, kind, content)
                };
            }
            // 画像は覚えていないので元を読む。読んでいる間は錠を放す——大きな写真 1 枚で
            // 同じページの他の要求まで待たせない。
            let Some(source) = site.assets.get(&key).cloned() else {
                return not_found();
            };
            let policy = site.policy.clone();
            drop(site);
            let kind = content_type(&key);
            match std::fs::read(&source) {
                // 手で書いた HTML にも読み直しの仕掛けを入れる。入れないと、直しても
                // 開いたままの窓が古いままになる——作っている最中を見るためのものなので、
                // そこが止まると出す意味が無くなる。
                Ok(bytes) if kind.starts_with("text/html") => match String::from_utf8(bytes) {
                    Ok(text) => {
                        let nonce = random_hex();
                        html_response(
                            &inject_reload(&text, token, &nonce),
                            &content_security_policy(&policy, &nonce),
                        )
                    }
                    Err(_) => not_found(),
                },
                Ok(bytes) => http_response_bytes(200, kind, &bytes),
                // 出した後に消された・読めなくなった。ページ自体は出ているので、その 1 つだけ落とす。
                Err(_) => not_found(),
            }
        }
    }
}

/// 覚えている中身を入れ替え、版を進める。開いているブラウザはこの版を見て読み直す。
///
/// 何が動いてよいか（`policy`）はここでは触らない。保存のたびに変わると、開いたままの
/// ブラウザで実行の可否が黙って入れ替わる。宣言を書き換えたときは立て直す。
fn replace_site(
    running: &Running,
    root: &Path,
    files: Vec<SiteFile>,
    assets: Vec<SiteAsset>,
) -> Result<(), String> {
    // 立てるときと同じ線で断る。ここだけ厳しくすると、書いた HTML だけのサイトは
    // 開いた最初の 1 回しか見られない（保存のたびに組み直しへ来るため）。
    if files.is_empty() && assets.is_empty() {
        return Err("見せるページがありません".to_string());
    }
    let mut site = running
        .site
        .lock()
        .map_err(|_| "中身を書き換えられません".to_string())?;
    site.pages = to_pages(files);
    site.assets = to_assets(root, assets);
    site.version += 1;
    Ok(())
}

/// 在り処はそのままに、版だけ進める。
///
/// サイトに載せるファイルは中身を覚えず、要求のたびに元を読む。だから **書き換わった
/// だけ**なら、組み直さなくても次の読み直しで新しい中身が出る。組み直すと本文から作る
/// ページまで作り直すことになり、CSS を 1 行直すたびに全文を描き直す。
///
/// 覚えていない置き場所なら false。呼んだ側は組み直しへ回す（新しく置かれたファイルは、
/// 在り処を覚えるまで出せない）。
fn touch_asset(running: &Running, rel_path: &str) -> Result<bool, String> {
    let mut site = running
        .site
        .lock()
        .map_err(|_| "中身を書き換えられません".to_string())?;
    if !site.assets.contains_key(&rel_path.replace('\\', "/")) {
        return Ok(false);
    }
    site.version += 1;
    Ok(true)
}

/// 受け付けを止める。待ち受けは接続を待って止まっているので、
/// 合図を立ててから自分で 1 本繋ぎ、起こして畳ませる。
fn stop_server(running: &Running) {
    running.stopping.store(true, Ordering::SeqCst);
    if let Ok(stream) = TcpStream::connect((Ipv4Addr::LOCALHOST, running.port)) {
        let _ = stream.shutdown(std::net::Shutdown::Both);
    }
}

fn info(running: &Running) -> PreviewServerInfo {
    PreviewServerInfo {
        url: format!("http://127.0.0.1:{}/{}/", running.port, running.token),
        port: running.port,
    }
}

#[tauri::command]
pub fn start_preview_server(
    app: AppHandle,
    window: tauri::Window,
    root: String,
    files: Vec<SiteFile>,
    assets: Vec<SiteAsset>,
    policy: SitePolicy,
) -> Result<PreviewServerInfo, String> {
    let state = crate::window_state::of(&window);
    let mut slot = state
        .preview
        .running
        .lock()
        .map_err(|_| "状態を読めません".to_string())?;
    // 押し直しは「前のものを畳んでから立てる」。2 つ立つと、どちらの URL を
    // 見ているのか利用者にも分からなくなる。
    if let Some(previous) = slot.take() {
        stop_server(&previous);
    }
    // 届いた `policy` は宣言の写しでしかない。宣言はプロジェクトの中にあり、
    // 中身を書いた側が自由に書ける。動かしてよいかは、この PC の同意で決める。
    let policy = resolve_policy(policy, is_project_trusted(&app, &root)?)?;
    let running = start_server(Path::new(&root), files, assets, policy)?;
    let detail = info(&running);
    *slot = Some(running);
    Ok(detail)
}

#[tauri::command]
pub fn update_preview_server(
    window: tauri::Window,
    root: String,
    files: Vec<SiteFile>,
    assets: Vec<SiteAsset>,
) -> Result<(), String> {
    let state = crate::window_state::of(&window);
    let slot = state
        .preview
        .running
        .lock()
        .map_err(|_| "状態を読めません".to_string())?;
    match slot.as_ref() {
        Some(running) => replace_site(running, Path::new(&root), files, assets),
        // 立っていないときの作り直しは、何もしないのが正しい（立て直しはボタンの仕事）。
        None => Ok(()),
    }
}

/// 書き換わったファイル 1 つを、組み直さずに映す。その場で済んだら true。
#[tauri::command]
pub fn refresh_preview_asset(window: tauri::Window, rel_path: String) -> Result<bool, String> {
    let state = crate::window_state::of(&window);
    let slot = state
        .preview
        .running
        .lock()
        .map_err(|_| "状態を読めません".to_string())?;
    match slot.as_ref() {
        Some(running) => touch_asset(running, &rel_path),
        // 立っていないなら映す先が無い。組み直させる必要も無い。
        None => Ok(true),
    }
}

#[tauri::command]
pub fn stop_preview_server(window: tauri::Window) -> Result<(), String> {
    let state = crate::window_state::of(&window);
    let mut slot = state
        .preview
        .running
        .lock()
        .map_err(|_| "状態を読めません".to_string())?;
    if let Some(running) = slot.take() {
        stop_server(&running);
    }
    Ok(())
}

/// この PC に入っているブラウザの名前を返す。
///
/// 画面はこの返事にあるものだけをボタンにする。入っていないものを並べると、
/// 押しても何も起きないボタンになる（起動を頼んだ先が無いことは、頼んだ側からは分からない）。
#[tauri::command]
pub fn installed_browsers() -> Vec<String> {
    let os = std::env::consts::OS;
    let env = |name: &str| std::env::var(name).ok();
    ["chrome", "edge"]
        .into_iter()
        .filter(|choice| {
            browser_probe_paths(choice, os, &env)
                .iter()
                .any(|path| Path::new(path).exists())
        })
        .map(str::to_string)
        .collect()
}

/// 出しているページを、選んだブラウザで開く。
///
/// **URL は画面から受け取らない。**立っている待ち受けのものを使う。受け取る形にすると、
/// 「ブラウザで開く」口が、どこでも開ける口になる。起動するものの名前も同じ理由で
/// 画面から受け取らず、選択肢の名前だけを受けてこちらの表から引く。
#[tauri::command]
pub fn open_preview_in_browser(
    app: AppHandle,
    window: tauri::Window,
    browser: String,
) -> Result<(), String> {
    let program = browser_program(&browser, std::env::consts::OS)?;
    let state = crate::window_state::of(&window);
    let url = {
        let slot = state
            .preview
            .running
            .lock()
            .map_err(|_| "状態を読めません".to_string())?;
        match slot.as_ref() {
            Some(running) => info(running).url,
            // 畳んだ後に押された。開いても繋がらないので、開かずに言う。
            None => return Err("いまブラウザに出していません".to_string()),
        }
    };
    app.opener()
        .open_url(url, program)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn preview_server_status(window: tauri::Window) -> Result<Option<PreviewServerInfo>, String> {
    let state = crate::window_state::of(&window);
    let slot = state
        .preview
        .running
        .lock()
        .map_err(|_| "状態を読めません".to_string())?;
    Ok(slot.as_ref().map(info))
}

/// 書き出したフォルダのページに焼き込む制限。
///
/// 下見の待ち受けは同じ制限を見出しとして返しているが、書き出したフォルダには
/// 返す人がいない。ページ自身に持たせるほかないので、組み立てる側へ文字列で渡す。
/// 組み立ては画面側にあるが、中身をそちらで組み直すと、下見と書き出しで別々に
/// 育っていく。ずれても誰も落ちないまま、確かめたページと配ったページが変わる。
#[tauri::command]
pub fn exported_site_csp(policy: SitePolicy) -> String {
    exported_content_security_policy(&policy)
}

/// 窓を閉じたとき・アプリ終了時に畳む。放置すると待ち受けたままプロセスが残りうる。
pub fn shutdown(state: &PreviewServerState) {
    let Ok(mut slot) = state.running.lock() else {
        return;
    };
    if let Some(running) = slot.take() {
        stop_server(&running);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 画像を伴わない待ち受け。ページの返し方を見るテストで使う。
    fn start(files: Vec<SiteFile>) -> Result<Running, String> {
        start_server(Path::new("."), files, vec![], SitePolicy::default())
    }

    fn site(path: &str, content: &str) -> SiteFile {
        SiteFile {
            path: path.to_string(),
            content: content.to_string(),
        }
    }

    fn pages() -> Vec<SiteFile> {
        vec![
            site("index.html", "<html><body><h1>一覧</h1></body></html>"),
            site("assets/markdown.css", "body{color:#000}"),
        ]
    }

    /// 生の要求を投げて、返ってきた全部を文字列で受け取る。
    fn request(port: u16, target: &str) -> Option<String> {
        let mut stream = TcpStream::connect((Ipv4Addr::LOCALHOST, port)).ok()?;
        stream
            .write_all(format!("GET {target} HTTP/1.1\r\nHost: localhost\r\n\r\n").as_bytes())
            .ok()?;
        let mut body = String::new();
        use std::io::Read;
        stream.read_to_string(&mut body).ok()?;
        Some(body)
    }

    #[test]
    fn 手元だけで待ち受ける() {
        let running = start(pages()).expect("立つ");
        assert!(running.port > 0);
        assert_eq!(
            info(&running).url,
            format!("http://127.0.0.1:{}/{}/", running.port, running.token)
        );
        stop_server(&running);
    }

    #[test]
    fn 合鍵つきならページが返る() {
        let running = start(pages()).expect("立つ");
        let got = request(running.port, &format!("/{}/", running.token)).expect("返る");
        assert!(got.starts_with("HTTP/1.1 200 "));
        assert!(got.contains("一覧"));
        stop_server(&running);
    }

    // 中身が入れ替わったことをブラウザ側が知る手立てが要る。
    #[test]
    fn ページには入れ替えの仕掛けが入る() {
        let running = start(pages()).expect("立つ");
        let got = request(running.port, &format!("/{}/index.html", running.token)).expect("返る");
        assert!(got.contains("<script nonce=\""));
        assert!(got.contains(&running.token));
        stop_server(&running);
    }

    /// 応答の中から、差し込んだ仕掛けに付いている印を取り出す。
    fn nonce_of(response: &str) -> String {
        let after = response
            .split_once("<script nonce=\"")
            .expect("仕掛けに印がある")
            .1;
        after.split_once('"').expect("印が閉じている").0.to_string()
    }

    // 印は指示と揃っていないと意味がない。揃っていなければ、差し込んだ仕掛け自体が動かない。
    #[test]
    fn 仕掛けの印は同じ応答の指示と揃う() {
        let running = start(pages()).expect("立つ");
        let got = request(running.port, &format!("/{}/index.html", running.token)).expect("返る");
        let nonce = nonce_of(&got);
        assert!(got.contains(&format!("script-src 'nonce-{nonce}'")));
        stop_server(&running);
    }

    // 印を使い回すと、1 枚から漏れた印が以後どのページでも通る。
    #[test]
    fn 印は出すたびに引き直す() {
        let running = start(pages()).expect("立つ");
        let path = format!("/{}/index.html", running.token);
        let first = nonce_of(&request(running.port, &path).expect("返る"));
        let second = nonce_of(&request(running.port, &path).expect("返る"));
        assert_ne!(first, second);
        stop_server(&running);
    }

    // 仕掛けは HTML の中でしか意味を持たない。CSS に混ぜると書式が壊れる。
    #[test]
    fn ページ以外には仕掛けを入れない() {
        let running = start(pages()).expect("立つ");
        let got = request(
            running.port,
            &format!("/{}/assets/markdown.css", running.token),
        )
        .expect("返る");
        assert!(got.contains("text/css"));
        assert!(!got.contains("<script>"));
        stop_server(&running);
    }

    #[test]
    fn 合鍵が無ければ中身を返さない() {
        let running = start(pages()).expect("立つ");
        let got = request(running.port, "/index.html").expect("返る");
        assert!(got.starts_with("HTTP/1.1 404 "));
        assert!(!got.contains("一覧"));
        stop_server(&running);
    }

    #[test]
    fn 無いページは断る() {
        let running = start(pages()).expect("立つ");
        let got = request(running.port, &format!("/{}/無い.html", running.token)).expect("返る");
        assert!(got.starts_with("HTTP/1.1 404 "));
        stop_server(&running);
    }

    #[test]
    fn 作り直すと版が上がり中身も入れ替わる() {
        let running = start(pages()).expect("立つ");
        let target = format!("/{}/__version", running.token);
        let before = request(running.port, &target).expect("返る");

        replace_site(
            &running,
            Path::new("."),
            vec![site(
                "index.html",
                "<html><body><h1>作り直し</h1></body></html>",
            )],
            vec![],
        )
        .expect("入れ替わる");

        let after = request(running.port, &target).expect("返る");
        assert_ne!(before, after);

        let got = request(running.port, &format!("/{}/", running.token)).expect("返る");
        assert!(got.contains("作り直し"));
        stop_server(&running);
    }

    // `.md` が 1 枚も無いフォルダ（書いた HTML だけ）でも立てられる。立てられるのに
    // 組み直せないと、開いた最初の 1 回しか見られない。立てる側と揃える。
    #[test]
    fn 本文から作るページが無くても組み直せる() {
        let root = ImageRoot::new("html_only");
        std::fs::write(root.path.join("index.html"), "<h1>相談</h1>").expect("置く");
        let running = start_server(
            &root.path,
            vec![],
            vec![asset("index.html", "index.html")],
            SitePolicy::default(),
        )
        .expect("立つ");

        std::fs::write(root.path.join("style.css"), "body{color:#000}").expect("置く");
        replace_site(
            &running,
            &root.path,
            vec![],
            vec![
                asset("index.html", "index.html"),
                asset("style.css", "style.css"),
            ],
        )
        .expect("組み直せる");

        let got = request(running.port, &format!("/{}/style.css", running.token)).expect("返る");
        assert!(got.starts_with("HTTP/1.1 200 "));
        stop_server(&running);
    }

    // 出すものが何も無いのに版だけ進むと、ブラウザは空の待ち受けを読みに行く。
    #[test]
    fn 出すものが何も無ければ組み直さない() {
        let running = start(pages()).expect("立つ");
        assert!(replace_site(&running, Path::new("."), vec![], vec![]).is_err());
        stop_server(&running);
    }

    #[test]
    fn 止めると繋がらなくなる() {
        let running = start(pages()).expect("立つ");
        let port = running.port;
        stop_server(&running);
        assert!(request(port, "/").is_none());
    }

    // 合鍵を覚えて使い回すと、前に開いたままのブラウザから次の中身が見える。
    #[test]
    fn 合鍵は立てるたびに変わる() {
        let first = start(pages()).expect("立つ");
        let second = start(pages()).expect("立つ");
        assert_ne!(first.token, second.token);
        assert_eq!(first.token.len(), 32);
        stop_server(&first);
        stop_server(&second);
    }

    #[test]
    fn 出すページが無ければ立てない() {
        assert!(start(vec![]).is_err());
    }

    // ── 画像 ─────────────────────────────────────────────────────────────

    /// 画像を 1 枚だけ置いた作業フォルダ。使い終わったら消す。
    struct ImageRoot {
        path: PathBuf,
    }

    impl ImageRoot {
        fn new(tag: &str) -> Self {
            let path =
                std::env::temp_dir().join(format!("mdbiz_srv_{}_{}", tag, std::process::id()));
            std::fs::create_dir_all(path.join("経費")).expect("作業フォルダ作成");
            std::fs::write(path.join("経費/領収書.png"), "PNGDATA").expect("画像を置く");
            ImageRoot { path }
        }
    }

    impl Drop for ImageRoot {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    fn asset(src: &str, dest: &str) -> SiteAsset {
        SiteAsset {
            src: src.to_string(),
            dest: dest.to_string(),
        }
    }

    // 中身を覚えずに在り処だけ控える。要求が来た時点で元を読む。
    #[test]
    fn 画像は元のファイルから返す() {
        let root = ImageRoot::new("img");
        let running = start_server(
            &root.path,
            pages(),
            vec![asset("経費/領収書.png", "assets/img/経費/領収書.png")],
            SitePolicy::default(),
        )
        .expect("立つ");

        let got = request(
            running.port,
            &format!("/{}/assets/img/経費/領収書.png", running.token),
        )
        .expect("返る");

        assert!(got.starts_with("HTTP/1.1 200 "));
        assert!(got.contains("image/png"));
        assert!(got.contains("PNGDATA"));
        stop_server(&running);
    }

    // 中身を覚えていないので、書き換わっただけなら組み直さなくても次に読んだときに新しくなる。
    #[test]
    fn 書き換わっただけなら組み直さずに版を進める() {
        let root = ImageRoot::new("touch");
        std::fs::write(root.path.join("style.css"), "body{color:#000}").expect("置く");
        let running = start_server(
            &root.path,
            pages(),
            vec![asset("style.css", "style.css")],
            SitePolicy::default(),
        )
        .expect("立つ");
        let target = format!("/{}/__version", running.token);
        let before = request(running.port, &target).expect("返る");

        std::fs::write(root.path.join("style.css"), "body{color:#fff}").expect("書き換える");
        assert!(touch_asset(&running, "style.css").expect("答える"));

        assert_ne!(before, request(running.port, &target).expect("返る"));
        let got = request(running.port, &format!("/{}/style.css", running.token)).expect("返る");
        assert!(got.contains("#fff"));
        stop_server(&running);
    }

    // 在り処を覚えていないものは出せない。組み直す側へ回すために false を返す。
    #[test]
    fn 知らない置き場所は組み直しへ回す() {
        let running = start(pages()).expect("立つ");
        let target = format!("/{}/__version", running.token);
        let before = request(running.port, &target).expect("返る");

        assert!(!touch_asset(&running, "新しい.css").expect("答える"));

        assert_eq!(before, request(running.port, &target).expect("返る"));
        stop_server(&running);
    }

    // 出した後に元を消しても、ページ自体は出続ける。
    #[test]
    fn 元が消えた画像だけを断る() {
        let root = ImageRoot::new("img_gone");
        let running = start_server(
            &root.path,
            pages(),
            vec![asset("経費/領収書.png", "assets/img/領収書.png")],
            SitePolicy::default(),
        )
        .expect("立つ");
        std::fs::remove_file(root.path.join("経費/領収書.png")).expect("消す");

        let got = request(
            running.port,
            &format!("/{}/assets/img/領収書.png", running.token),
        )
        .expect("返る");
        assert!(got.starts_with("HTTP/1.1 404 "));

        let page = request(running.port, &format!("/{}/", running.token)).expect("返る");
        assert!(page.contains("一覧"));
        stop_server(&running);
    }

    #[test]
    fn フォルダの外の画像は控えない() {
        let root = ImageRoot::new("img_escape");
        let running = start_server(
            &root.path,
            pages(),
            vec![asset("../mdbiz_srv_外.png", "assets/img/外.png")],
            SitePolicy::default(),
        )
        .expect("立つ");

        let got = request(
            running.port,
            &format!("/{}/assets/img/外.png", running.token),
        )
        .expect("返る");
        assert!(got.starts_with("HTTP/1.1 404 "));
        stop_server(&running);
    }
}
