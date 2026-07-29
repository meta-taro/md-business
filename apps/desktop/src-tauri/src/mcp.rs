//! 組み込み MCP サーバー（サイドカー）の配線層（子プロセス / スレッド / Tauri 依存）。
//!
//! 解釈まわりの純ロジックは [`crate::mcp_logic`] に寄せてあり、ここは子プロセスの起動・
//! stdout の読み取りスレッド・フロントへのイベント発行という「橋渡し」だけを持つ。
//!
//! 方針: MCP は付加機能なので、起動できなくてもアプリの他機能を一切止めない。Node
//! ランタイム未検出・バンドル欠落・spawn 失敗はいずれも劣化状態（`unavailable`）として
//! 記録し、画面に理由を出すに留める。

use std::io::{BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, State};

use crate::mcp_logic::{
    parse_sidecar_line, pick_existing, set_root_line, sidecar_args, sidecar_candidates, McpReason,
    McpState, McpStatus, SidecarEvent,
};

/// 状態変化をフロントへ知らせるイベント名。
const STATUS_EVENT: &str = "mcp-status";
/// ツール実行 1 件の操作ログを送るイベント名。
const LOG_EVENT: &str = "mcp-log";

/// サイドカーの実行時状態。アプリ全体で 1 つを `manage` する。
///
/// `stdin` を保持するのは root 差し替えを送るため。プロセス終了時にこれを落とすと
/// サイドカーは自分で降りるので、孤児プロセスが残らない。
pub struct McpRuntime {
    child: Mutex<Option<Child>>,
    stdin: Mutex<Option<ChildStdin>>,
    status: Mutex<McpStatus>,
}

impl Default for McpRuntime {
    fn default() -> Self {
        McpRuntime {
            child: Mutex::new(None),
            stdin: Mutex::new(None),
            status: Mutex::new(McpStatus::starting()),
        }
    }
}

/// 状態を更新し、フロントへ通知する。ロック失敗時は通知だけ行う（画面を止めない）。
fn set_status(app: &AppHandle, status: McpStatus) {
    if let Ok(mut guard) = app.state::<McpRuntime>().status.lock() {
        *guard = status.clone();
    }
    let _ = app.emit(STATUS_EVENT, &status);
}

/// サイドカー本体のパスを解決する。配布ビルドは同梱リソース、開発中はリポジトリの
/// バンドル出力を使う。
fn resolve_sidecar(app: &AppHandle) -> Option<PathBuf> {
    let resource_dir = app.path().resource_dir().ok();
    // CARGO_MANIFEST_DIR は src-tauri を指す。3 つ上がリポジトリルート。
    let dev_base = Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(3)
        .map(Path::to_path_buf);
    let candidates = sidecar_candidates(resource_dir.as_deref(), dev_base.as_deref());
    pick_existing(&candidates, |p| p.exists())
}

/// 起動直後に渡す root。まだフォルダが開かれていないので、アプリ自身のデータ領域を
/// 指しておく。利用者の書類が意図せず見える状態を作らないための既定値。
fn initial_root(app: &AppHandle) -> PathBuf {
    match app.path().app_data_dir() {
        Ok(dir) => {
            let _ = std::fs::create_dir_all(&dir);
            dir
        }
        // データ領域が取れない環境でも起動は続ける（root は後で差し替わる）。
        Err(_) => std::env::temp_dir(),
    }
}

/// 接続情報（トークン / ポート）の保存先。
///
/// 起動のたびに接続先が変わると、AI クライアント側の設定を毎回書き直すことになる。
/// 確定した値をアプリの設定領域へ残し、次回も同じ接続先で立ち上げられるようにする。
/// 取得できない環境では None（サイドカーが毎回発行する従来どおりの動きになる）。
fn state_path(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_config_dir().ok()?;
    let _ = std::fs::create_dir_all(&dir);
    Some(dir.join("mcp.json"))
}

/// Node の子プロセスを組み立てる。
fn build_command(sidecar: &Path, root: &Path, state: Option<&Path>) -> Command {
    let mut command = Command::new("node");
    command
        .args(sidecar_args(sidecar, root, state))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // コンソールウィンドウが一瞬開くのを防ぐ（CREATE_NO_WINDOW）。
        command.creation_flags(0x0800_0000);
    }
    command
}

/// サイドカーを起動する。失敗しても Err を返さず、劣化状態として記録する。
pub fn start(app: &AppHandle) {
    let sidecar = match resolve_sidecar(app) {
        Some(path) => path,
        None => {
            set_status(app, McpStatus::unavailable(McpReason::SidecarMissing));
            return;
        }
    };

    let root = initial_root(app);
    let state = state_path(app);
    let mut child = match build_command(&sidecar, &root, state.as_deref()).spawn() {
        Ok(child) => child,
        Err(err) => {
            // Node が入っていないだけの環境と、それ以外の起動失敗は利用者の対処が違う。
            let status = if err.kind() == std::io::ErrorKind::NotFound {
                McpStatus::unavailable(McpReason::NodeMissing)
            } else {
                McpStatus::unavailable_with(McpReason::SpawnFailed, err.to_string())
            };
            set_status(app, status);
            return;
        }
    };

    let stdout = child.stdout.take();
    if let Ok(mut guard) = app.state::<McpRuntime>().stdin.lock() {
        *guard = child.stdin.take();
    }
    if let Ok(mut guard) = app.state::<McpRuntime>().child.lock() {
        *guard = Some(child);
    }

    let Some(stdout) = stdout else {
        set_status(app, McpStatus::unavailable(McpReason::NoOutput));
        return;
    };

    let app_for_thread = app.clone();
    std::thread::spawn(move || read_events(&app_for_thread, stdout));
}

/// stdout を行単位で読み、イベントとしてフロントへ流す。EOF で終了する。
fn read_events(app: &AppHandle, stdout: impl Read) {
    let mut reader = BufReader::new(stdout);
    let mut pending = String::new();
    let mut buffer = [0u8; 4096];
    let mut ready_seen = false;

    loop {
        let read = match reader.read(&mut buffer) {
            Ok(0) | Err(_) => break,
            Ok(n) => n,
        };
        pending.push_str(&String::from_utf8_lossy(&buffer[..read]));
        let (lines, rest) = crate::mcp_logic::split_lines(&pending);
        pending = rest;
        for line in lines {
            match parse_sidecar_line(&line) {
                Some(SidecarEvent::Ready {
                    url, port, token, ..
                }) => {
                    ready_seen = true;
                    set_status(app, McpStatus::ready(url, port, token));
                }
                Some(SidecarEvent::Log(value)) => {
                    let _ = app.emit(LOG_EVENT, &value);
                }
                Some(SidecarEvent::Error { message }) => {
                    // 起動前の異常は劣化として扱う。起動後は制御チャネル上の
                    // 単発エラーなのでサーバー本体は動き続ける。
                    if !ready_seen {
                        set_status(
                            app,
                            McpStatus::unavailable_with(McpReason::ServerError, message),
                        );
                    }
                }
                // root 受理は状態に影響しない（差し替えは呼び出し側が把握している）。
                Some(SidecarEvent::Root { .. }) | None => {}
            }
        }
    }

    if !ready_seen {
        set_status(app, McpStatus::unavailable(McpReason::ExitedEarly));
    }
}

/// サイドカーを止める。stdin を落として自主終了を促し、残っていれば kill する。
pub fn shutdown(app: &AppHandle) {
    let runtime = app.state::<McpRuntime>();
    if let Ok(mut guard) = runtime.stdin.lock() {
        *guard = None;
    }
    if let Ok(mut guard) = runtime.child.lock() {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    };
}

/// 現在の状態を返す。フロントは起動直後にこれを読んで初期表示を決める。
#[tauri::command]
pub fn mcp_status(state: State<McpRuntime>) -> McpStatus {
    match state.status.lock() {
        Ok(guard) => guard.clone(),
        Err(_) => McpStatus::unavailable(McpReason::StatusUnreadable),
    }
}

/// ワークスペース root をサイドカーへ反映する。フォルダ切り替えのたびに呼ぶ。
///
/// 未起動・劣化中は「何もしないで成功」とする。MCP が無い環境でもフォルダ切り替え
/// そのものは成功させたいため。
#[tauri::command]
pub fn mcp_set_root(state: State<McpRuntime>, root: String) -> Result<(), String> {
    let ready = matches!(
        state.status.lock().map(|s| s.state),
        Ok(McpState::Ready) | Ok(McpState::Starting)
    );
    if !ready {
        return Ok(());
    }
    let mut guard = state
        .stdin
        .lock()
        .map_err(|_| "MCP の制御チャネルのロック失敗".to_string())?;
    let Some(stdin) = guard.as_mut() else {
        return Ok(());
    };
    stdin
        .write_all(set_root_line(&root).as_bytes())
        .map_err(|e| format!("MCP へ root を送れません: {}", e))?;
    stdin
        .flush()
        .map_err(|e| format!("MCP へ root を送れません: {}", e))
}
