//! ブラウザ表示用のローカルサーバー（配線）。
//!
//! 何を返すかの判断は [`crate::preview_server_logic`] にあり、ここは
//! 「待ち受ける・受け取る・返す・畳む」だけを持つ。
//!
//! ディスクには書かない。組み立て済みのページを丸ごと覚えておき、要求が来たら
//! そこから引く。書き出し（`export_site`）とは中身の作り方が同じで、置き場所だけが違う。

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::net::{Ipv4Addr, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::preview_server_logic::{
    content_type, http_response, inject_reload, parse_request_line, route, Route,
};
use crate::workspace::SiteFile;

/// 覚えているページ一式と、その版。版はブラウザ側が入れ替わりを知るために使う。
struct Site {
    pages: HashMap<String, String>,
    version: u64,
}

/// 立っているサーバー 1 つぶん。
struct Running {
    token: String,
    port: u16,
    site: Arc<Mutex<Site>>,
    /// 受け付けを止める合図。立てたときの待ち受けを起こすために使う。
    stopping: Arc<AtomicBool>,
}

/// アプリが持つ実行時状態。立っているのは常に 0 個か 1 個。
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

/// URL に入れる合鍵。立てるたびに作り直す。
fn new_token() -> String {
    let mut bytes = [0u8; 16];
    // OS の乱数が引けない環境は考えにくいが、引けないまま固定値へ落とすと
    // 合鍵が合鍵でなくなる。そのときは立てない側に倒す（呼び出し元が Err にする）。
    getrandom::fill(&mut bytes).expect("OS の乱数を引けません");
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn to_pages(files: Vec<SiteFile>) -> HashMap<String, String> {
    files
        .into_iter()
        .map(|file| (file.path.replace('\\', "/"), file.content))
        .collect()
}

/// 待ち受けを立て、受け付けの繰り返しを別の筋で回す。
fn start_server(files: Vec<SiteFile>) -> Result<Running, String> {
    if files.is_empty() {
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

    let token = new_token();
    let site = Arc::new(Mutex::new(Site {
        pages: to_pages(files),
        version: 1,
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
            let Some(content) = site.pages.get(&key) else {
                return not_found();
            };
            let kind = content_type(&key);
            if kind.starts_with("text/html") {
                http_response(200, kind, &inject_reload(content, token))
            } else {
                http_response(200, kind, content)
            }
        }
    }
}

/// 覚えている中身を入れ替え、版を進める。開いているブラウザはこの版を見て読み直す。
fn replace_site(running: &Running, files: Vec<SiteFile>) -> Result<(), String> {
    if files.is_empty() {
        return Err("見せるページがありません".to_string());
    }
    let mut site = running
        .site
        .lock()
        .map_err(|_| "中身を書き換えられません".to_string())?;
    site.pages = to_pages(files);
    site.version += 1;
    Ok(())
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
    state: State<'_, PreviewServerState>,
    files: Vec<SiteFile>,
) -> Result<PreviewServerInfo, String> {
    let mut slot = state
        .running
        .lock()
        .map_err(|_| "状態を読めません".to_string())?;
    // 押し直しは「前のものを畳んでから立てる」。2 つ立つと、どちらの URL を
    // 見ているのか利用者にも分からなくなる。
    if let Some(previous) = slot.take() {
        stop_server(&previous);
    }
    let running = start_server(files)?;
    let detail = info(&running);
    *slot = Some(running);
    Ok(detail)
}

#[tauri::command]
pub fn update_preview_server(
    state: State<'_, PreviewServerState>,
    files: Vec<SiteFile>,
) -> Result<(), String> {
    let slot = state
        .running
        .lock()
        .map_err(|_| "状態を読めません".to_string())?;
    match slot.as_ref() {
        Some(running) => replace_site(running, files),
        // 立っていないときの作り直しは、何もしないのが正しい（立て直しはボタンの仕事）。
        None => Ok(()),
    }
}

#[tauri::command]
pub fn stop_preview_server(state: State<'_, PreviewServerState>) -> Result<(), String> {
    let mut slot = state
        .running
        .lock()
        .map_err(|_| "状態を読めません".to_string())?;
    if let Some(running) = slot.take() {
        stop_server(&running);
    }
    Ok(())
}

#[tauri::command]
pub fn preview_server_status(
    state: State<'_, PreviewServerState>,
) -> Result<Option<PreviewServerInfo>, String> {
    let slot = state
        .running
        .lock()
        .map_err(|_| "状態を読めません".to_string())?;
    Ok(slot.as_ref().map(info))
}

/// アプリ終了時に畳む。放置すると待ち受けたままプロセスが残りうる。
pub fn shutdown(app: &AppHandle) {
    let state = app.state::<PreviewServerState>();
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
        let running = start_server(pages()).expect("立つ");
        assert!(running.port > 0);
        assert_eq!(
            info(&running).url,
            format!("http://127.0.0.1:{}/{}/", running.port, running.token)
        );
        stop_server(&running);
    }

    #[test]
    fn 合鍵つきならページが返る() {
        let running = start_server(pages()).expect("立つ");
        let got = request(running.port, &format!("/{}/", running.token)).expect("返る");
        assert!(got.starts_with("HTTP/1.1 200 "));
        assert!(got.contains("一覧"));
        stop_server(&running);
    }

    // 中身が入れ替わったことをブラウザ側が知る手立てが要る。
    #[test]
    fn ページには入れ替えの仕掛けが入る() {
        let running = start_server(pages()).expect("立つ");
        let got = request(running.port, &format!("/{}/index.html", running.token)).expect("返る");
        assert!(got.contains("<script>"));
        assert!(got.contains(&running.token));
        stop_server(&running);
    }

    // 仕掛けは HTML の中でしか意味を持たない。CSS に混ぜると書式が壊れる。
    #[test]
    fn ページ以外には仕掛けを入れない() {
        let running = start_server(pages()).expect("立つ");
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
        let running = start_server(pages()).expect("立つ");
        let got = request(running.port, "/index.html").expect("返る");
        assert!(got.starts_with("HTTP/1.1 404 "));
        assert!(!got.contains("一覧"));
        stop_server(&running);
    }

    #[test]
    fn 無いページは断る() {
        let running = start_server(pages()).expect("立つ");
        let got = request(running.port, &format!("/{}/無い.html", running.token)).expect("返る");
        assert!(got.starts_with("HTTP/1.1 404 "));
        stop_server(&running);
    }

    #[test]
    fn 作り直すと版が上がり中身も入れ替わる() {
        let running = start_server(pages()).expect("立つ");
        let target = format!("/{}/__version", running.token);
        let before = request(running.port, &target).expect("返る");

        replace_site(
            &running,
            vec![site(
                "index.html",
                "<html><body><h1>作り直し</h1></body></html>",
            )],
        )
        .expect("入れ替わる");

        let after = request(running.port, &target).expect("返る");
        assert_ne!(before, after);

        let got = request(running.port, &format!("/{}/", running.token)).expect("返る");
        assert!(got.contains("作り直し"));
        stop_server(&running);
    }

    #[test]
    fn 止めると繋がらなくなる() {
        let running = start_server(pages()).expect("立つ");
        let port = running.port;
        stop_server(&running);
        assert!(request(port, "/").is_none());
    }

    // 合鍵を覚えて使い回すと、前に開いたままのブラウザから次の中身が見える。
    #[test]
    fn 合鍵は立てるたびに変わる() {
        let first = start_server(pages()).expect("立つ");
        let second = start_server(pages()).expect("立つ");
        assert_ne!(first.token, second.token);
        assert_eq!(first.token.len(), 32);
        stop_server(&first);
        stop_server(&second);
    }

    #[test]
    fn 出すページが無ければ立てない() {
        assert!(start_server(vec![]).is_err());
    }
}
