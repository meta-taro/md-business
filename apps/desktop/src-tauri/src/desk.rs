//! 割符の机へ繋ぐ線の配線層（tokio / Tauri ランタイム依存）。
//!
//! 口の場所・送る行の検査・届いた行の切り出しは [`crate::desk_logic`] に寄せてあり、
//! ここは口を開いて読み書きを橋渡しするだけを持つ。届いた行は `desk-line`、
//! 繋がった / 切れたは `desk-connected` としてフロントへ出す。
//! 割符が動いていない PC では繋がらないまま待ち続けるだけで、ほかの機能には影響しない。

use std::io;
use std::path::Path;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt, WriteHalf};
use tokio::sync::Mutex;

use crate::desk_logic::{desk_address, frame_outgoing, machine_name, DeskPlatform, LineSplitter};

/// 繋がらなかった / 切れたあと、もう一度試すまでの間。割符を後から立ち上げても拾える長さ。
const RETRY: Duration = Duration::from_secs(3);

/// 机の口として読み書きできるもの（OS ごとに型が違うので揃える）。
trait DeskStream: AsyncRead + AsyncWrite + Send + Unpin {}
impl<T: AsyncRead + AsyncWrite + Send + Unpin> DeskStream for T {}

type Writer = WriteHalf<Box<dyn DeskStream>>;

/// 机への書き口。繋がっていない間は `None`。
#[derive(Default)]
pub struct DeskState {
    writer: Mutex<Option<Writer>>,
}

/// 画面から机へ 1 行送る。繋がっていない・送れない形のときはエラーで返す
/// （画面は送れなかったことを知るだけでよく、溜めて後で送ることはしない）。
#[tauri::command]
pub async fn desk_write(state: State<'_, DeskState>, line: String) -> Result<(), String> {
    let framed = frame_outgoing(&line).ok_or("送れない形の行です")?;
    let mut guard = state.writer.lock().await;
    let writer = guard.as_mut().ok_or("割符の机に繋がっていません")?;
    if let Err(e) = writer.write_all(framed.as_bytes()).await {
        // 書けない口は切れている。次の接続で差し替わるまで外しておく。
        *guard = None;
        return Err(e.to_string());
    }
    Ok(())
}

/// いま机に繋がっているか。起動直後の `desk-connected` は画面が受け取りを始める前に
/// 出てしまうので、画面は受け取りを始めたあとでこれを 1 度聞いて取りこぼしを拾う。
#[tauri::command]
pub async fn desk_connected(state: State<'_, DeskState>) -> Result<bool, String> {
    Ok(state.writer.lock().await.is_some())
}

/// この機械の名前。机への名乗りに添えて、別の PC の md-business と見分けられるようにする。
#[tauri::command]
pub async fn desk_machine() -> Result<Option<String>, String> {
    Ok(read_machine_name().as_deref().and_then(machine_name))
}

#[cfg(windows)]
fn read_machine_name() -> Option<String> {
    std::env::var("COMPUTERNAME").ok()
}

#[cfg(target_os = "macos")]
fn read_machine_name() -> Option<String> {
    // 共有の設定に出る名前。ホスト名はネットワークで変わりうる。
    let out = std::process::Command::new("scutil")
        .args(["--get", "ComputerName"])
        .output()
        .ok()?;
    out.status
        .success()
        .then(|| String::from_utf8_lossy(&out.stdout).into_owned())
}

#[cfg(all(unix, not(target_os = "macos")))]
fn read_machine_name() -> Option<String> {
    std::fs::read_to_string("/etc/hostname")
        .ok()
        .or_else(|| std::env::var("HOSTNAME").ok())
}

/// 机への線を張り続ける。起動時に 1 度だけ呼ぶ。
pub fn start(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let address = current_address();
        loop {
            if let Ok(stream) = connect(&address).await {
                serve(&app, stream).await;
            }
            tokio::time::sleep(RETRY).await;
        }
    });
}

/// 割符と同じ決め方で、この PC の机の口を求める。
fn current_address() -> std::path::PathBuf {
    let env = |key: &str| std::env::var(key).ok().filter(|v| !v.is_empty());
    let user_home = env("HOME").or_else(|| env("USERPROFILE"));
    desk_address(
        DeskPlatform::current(),
        env("WARIFU_HOME").as_deref(),
        env("XDG_RUNTIME_DIR").as_deref(),
        user_home.as_deref(),
    )
}

#[cfg(windows)]
async fn connect(address: &Path) -> io::Result<Box<dyn DeskStream>> {
    let pipe = tokio::net::windows::named_pipe::ClientOptions::new().open(address)?;
    Ok(Box::new(pipe))
}

#[cfg(unix)]
async fn connect(address: &Path) -> io::Result<Box<dyn DeskStream>> {
    let socket = tokio::net::UnixStream::connect(address).await?;
    Ok(Box::new(socket))
}

/// 繋がった 1 本を切れるまで読む。書き口は画面から使えるよう預けておく。
async fn serve(app: &AppHandle, stream: Box<dyn DeskStream>) {
    let (mut reader, writer) = tokio::io::split(stream);
    let state = app.state::<DeskState>();
    *state.writer.lock().await = Some(writer);
    // 画面は繋がるたびに居場所を聞き直す（机は接続ごとに聞いた相手へ流す）。
    let _ = app.emit("desk-connected", true);

    let mut splitter = LineSplitter::default();
    let mut buf = [0u8; 4096];
    loop {
        match reader.read(&mut buf).await {
            Ok(0) | Err(_) => break,
            Ok(n) => {
                for line in splitter.push(&buf[..n]) {
                    let _ = app.emit("desk-line", line);
                }
            }
        }
    }

    *state.writer.lock().await = None;
    let _ = app.emit("desk-connected", false);
}
