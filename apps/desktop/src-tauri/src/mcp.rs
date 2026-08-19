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
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter, Manager, State};

use crate::mcp_logic::{
    append_detail, can_retry, connection_parts, ensure_ignored, merge_client_config,
    node_candidates, node_programs, node_version_roots, parse_sidecar_line, pick_existing,
    response_line, set_root_line, sidecar_args, sidecar_candidates, sort_node_versions,
    startup_detail, McpReason, McpState, McpStatus, NodeEnv, SidecarEvent, CONFIG_FILE_NAME,
};

/// 状態変化をフロントへ知らせるイベント名。
const STATUS_EVENT: &str = "mcp-status";
/// ツール実行 1 件の操作ログを送るイベント名。
const LOG_EVENT: &str = "mcp-log";
/// 画面でしかできない操作の依頼を送るイベント名。
const REQUEST_EVENT: &str = "mcp-request";

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

/// 環境変数から Node の探索位置を集める。取れないものは None のまま渡す。
fn node_env() -> NodeEnv {
    let var = |key: &str| std::env::var_os(key).map(PathBuf::from);
    NodeEnv {
        home: var("USERPROFILE").or_else(|| var("HOME")),
        program_files: var("ProgramFiles"),
        local_app_data: var("LOCALAPPDATA"),
        app_data: var("APPDATA"),
        fnm_dir: var("FNM_DIR"),
        nvm_home: var("NVM_HOME"),
    }
}

/// 版ごとにフォルダを切る管理ツール（nvm / fnm）の下から、新しい版の Node を拾う。
///
/// 版フォルダ名は実際に見に行かないと分からないので、ここだけディスクを読む。
/// 読めないフォルダは黙って飛ばす（Node が無いこと自体は劣化表示で伝わる）。
fn managed_nodes(env: &NodeEnv) -> Vec<PathBuf> {
    let mut found = Vec::new();
    for root in node_version_roots(env) {
        let Ok(entries) = std::fs::read_dir(&root.dir) else {
            continue;
        };
        let names: Vec<String> = entries
            .flatten()
            .filter(|e| e.path().is_dir())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        for name in sort_node_versions(names) {
            let path = root.dir.join(name).join(&root.suffix);
            if path.exists() {
                found.push(path);
            }
        }
    }
    found
}

/// 起動を試す Node を優先順に並べる。
///
/// 画面から起動したアプリが受け取る PATH はログイン時点のもので、その後に入れた Node や
/// シェル起動時に PATH を書き換える版管理ツールの Node は載っていない。PATH だけに頼ると
/// 「Node は入っているのに見つからない」状態になるため、既定の導入先も順に当たる。
fn resolve_nodes() -> Vec<PathBuf> {
    let env = node_env();
    let mut found: Vec<PathBuf> = node_candidates(&env)
        .into_iter()
        .filter(|p| p.exists())
        .collect();
    found.extend(managed_nodes(&env));
    node_programs(found)
}

/// Node の子プロセスを組み立てる。
fn build_command(node: &Path, sidecar: &Path, root: &Path, state: Option<&Path>) -> Command {
    let mut command = Command::new(node);
    command
        .args(sidecar_args(sidecar, root, state))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        // 起動しきれなかったときに理由が残るのはここだけなので、捨てずに受け取る。
        .stderr(Stdio::piped());
    // 「画面へ出して」の依頼で起こす実行ファイルを、いま動いているもの自身に固定する。
    // 探しにいかせると、開発ビルドや配布物を移動した環境で別のものを起こしうる。
    if let Ok(exe) = std::env::current_exe() {
        command.env("MD_BUSINESS_APP", exe);
    }
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
    // 見つかった順に起動を試す。NotFound はその Node が無いだけなので次へ進み、
    // それ以外の失敗（権限など）は対処が違うのでその時点で止めて理由を出す。
    let mut spawned: Option<Child> = None;
    for node in resolve_nodes() {
        match build_command(&node, &sidecar, &root, state.as_deref()).spawn() {
            Ok(child) => {
                spawned = Some(child);
                break;
            }
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => continue,
            Err(err) => {
                set_status(
                    app,
                    McpStatus::unavailable_with(McpReason::SpawnFailed, err.to_string()),
                );
                return;
            }
        }
    }
    let mut child = match spawned {
        Some(child) => child,
        None => {
            // どこにも Node が無い。利用者の対処は「Node を入れる」の一択。
            set_status(app, McpStatus::unavailable(McpReason::NodeMissing));
            return;
        }
    };

    let stdout = child.stdout.take();
    // 標準エラー出力は別スレッドで読み続ける。読まずに放置するとパイプが詰まって
    // 子が書き込みで止まるため、使わない場合でも吸い出す必要がある。
    let stderr_tail = Arc::new(Mutex::new(String::new()));
    let stderr_thread = child.stderr.take().map(|stderr| {
        let sink = Arc::clone(&stderr_tail);
        std::thread::spawn(move || drain_stderr(stderr, &sink))
    });
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
    std::thread::spawn(move || read_events(&app_for_thread, stdout, stderr_tail, stderr_thread));
}

/// 標準エラー出力を最後まで読み、末尾だけを診断用に残す。
fn drain_stderr(stderr: impl Read, sink: &Mutex<String>) {
    let mut reader = BufReader::new(stderr);
    let mut buffer = [0u8; 4096];
    loop {
        let read = match reader.read(&mut buffer) {
            Ok(0) | Err(_) => break,
            Ok(n) => n,
        };
        if let Ok(mut guard) = sink.lock() {
            append_detail(&mut guard, &String::from_utf8_lossy(&buffer[..read]));
        }
    }
}

/// 起動しきれなかった子プロセスの終了コードを取る。
///
/// stdout が閉じた時点で子はほぼ終わっているので、ここで待っても止まらない。
fn exit_code(app: &AppHandle) -> Option<i32> {
    let runtime = app.state::<McpRuntime>();
    let mut guard = runtime.child.lock().ok()?;
    guard.as_mut()?.wait().ok()?.code()
}

/// stdout を行単位で読み、イベントとしてフロントへ流す。EOF で終了する。
fn read_events(
    app: &AppHandle,
    stdout: impl Read,
    stderr_tail: Arc<Mutex<String>>,
    stderr_thread: Option<std::thread::JoinHandle<()>>,
) {
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
                Some(SidecarEvent::Request { id, action, path }) => {
                    // 実際に処理できるのは画面側だけ。応答は mcp_respond で返ってくる。
                    let _ = app.emit(
                        REQUEST_EVENT,
                        serde_json::json!({ "id": id, "action": action, "path": path }),
                    );
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
        // 理由コードだけでは利用者も開発者も次の一手を選べない。子が最後に残した
        // 出力と終了コードを添えて、原因を追える形にする。
        if let Some(handle) = stderr_thread {
            let _ = handle.join();
        }
        let stderr = stderr_tail
            .lock()
            .map(|guard| guard.clone())
            .unwrap_or_default();
        let status = match startup_detail(&stderr, exit_code(app)) {
            Some(detail) => McpStatus::unavailable_with(McpReason::ExitedEarly, detail),
            None => McpStatus::unavailable(McpReason::ExitedEarly),
        };
        set_status(app, status);
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

/// 制御チャネルへ 1 行送る。
///
/// 未起動・劣化中は「何もしないで成功」とする。MCP が無い環境でも、呼び出し元の
/// 操作（フォルダ切り替えなど）そのものは成功させたいため。
fn write_control_line(state: &State<McpRuntime>, line: String, what: &str) -> Result<(), String> {
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
        .write_all(line.as_bytes())
        .map_err(|e| format!("MCP へ{}を送れません: {}", what, e))?;
    stdin
        .flush()
        .map_err(|e| format!("MCP へ{}を送れません: {}", what, e))
}

/// ワークスペース root をサイドカーへ反映する。フォルダ切り替えのたびに呼ぶ。
#[tauri::command]
pub fn mcp_set_root(state: State<McpRuntime>, root: String) -> Result<(), String> {
    write_control_line(&state, set_root_line(&root), "root")
}

/// 画面で処理した依頼の結果をサイドカーへ返す。
///
/// 応答が返らないとツール側が時間切れになるので、失敗したときも必ず理由を添えて返す。
#[tauri::command]
pub fn mcp_respond(
    state: State<McpRuntime>,
    id: String,
    ok: bool,
    error: Option<String>,
) -> Result<(), String> {
    write_control_line(&state, response_line(&id, ok, error.as_deref()), "応答")
}

/// 既にあれば読み、無ければ `None`。読めない場合はエラー（無かったことにしない）。
fn read_if_exists(path: &Path) -> Result<Option<String>, String> {
    match std::fs::read_to_string(path) {
        Ok(text) => Ok(Some(text)),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(err) => Err(format!("{} を読めません: {}", path.display(), err)),
    }
}

/// 開いているフォルダへ接続設定を書き出す。書き出したファイルのパスを返す。
///
/// 設定を手で貼らせると、貼り先も書式も分からないまま止まる。作業フォルダに置けば、
/// そこで動く AI クライアントが自分で読む。設定にはトークンが入るので、git 管理下では
/// 追跡対象から外してから書く。
#[tauri::command]
pub fn mcp_write_client_config(state: State<McpRuntime>, root: String) -> Result<String, String> {
    let status = mcp_status(state);
    let (url, token) = connection_parts(&status)?;
    write_client_config_impl(Path::new(&root), url, token)
}

/// 接続設定の全文を返す。設定ファイルを読まないクライアントへ、手で貼るため。
///
/// 書き出す側と同じ組み立てを使う。別々に組むと、片方だけ直したときに写した設定が
/// 繋がらなくなる（繋がらない理由が利用者からは見えない）。
#[tauri::command]
pub fn mcp_client_config(state: State<McpRuntime>) -> Result<String, String> {
    let status = mcp_status(state);
    let (url, token) = connection_parts(&status)?;
    merge_client_config(None, url, token)
}

/// 起動をもう一度試す。Node を入れた直後に押される想定。
///
/// これが無いと、Node を入れた利用者はアプリを起動し直すしかない。入れた本人にとっては
/// 作業が終わった直後なので、そこで一段挟まると「入れたのに直らない」に見える。
/// やり直した結果は戻り値で返す。状態変化のイベントとコマンドの応答は別経路で届くため、
/// 呼び出し側が応答の直後に状態を読むと、まだ古い値が入っている。
#[tauri::command]
pub fn mcp_retry(app: AppHandle) -> Result<McpStatus, String> {
    if !can_retry(&mcp_status(app.state::<McpRuntime>())) {
        return Err("MCP サーバーは起動処理中か、すでに動いています".to_string());
    }
    set_status(&app, McpStatus::starting());
    start(&app);
    Ok(mcp_status(app.state::<McpRuntime>()))
}

/// 設定ファイルと、必要なら除外指定を書く。書いた設定ファイルのパスを返す。
fn write_client_config_impl(root: &Path, url: &str, token: &str) -> Result<String, String> {
    if !root.is_dir() {
        return Err("フォルダが開かれていません".to_string());
    }

    // 除外指定を先に済ませる。設定を書いてからここで失敗すると、トークンの入った
    // ファイルが追跡対象のまま残る。
    if root.join(".git").exists() {
        let ignore_path = root.join(".gitignore");
        let current = read_if_exists(&ignore_path)?;
        if let Some(next) = ensure_ignored(current.as_deref(), CONFIG_FILE_NAME) {
            std::fs::write(&ignore_path, next)
                .map_err(|err| format!("{} を書けません: {}", ignore_path.display(), err))?;
        }
    }

    let config_path = root.join(CONFIG_FILE_NAME);
    let merged = merge_client_config(read_if_exists(&config_path)?.as_deref(), url, token)?;
    std::fs::write(&config_path, merged)
        .map_err(|err| format!("{} を書けません: {}", config_path.display(), err))?;
    Ok(config_path.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

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

        fn file(&self, rel: &str, body: &str) {
            let p = self.path.join(rel);
            if let Some(parent) = p.parent() {
                std::fs::create_dir_all(parent).expect("親ディレクトリ作成");
            }
            std::fs::write(&p, body).expect("ファイル書き込み");
        }

        fn read(&self, rel: &str) -> String {
            std::fs::read_to_string(self.path.join(rel)).expect("読み込み")
        }
    }

    impl Drop for TempRoot {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    fn write(root: &TempRoot) -> Result<String, String> {
        write_client_config_impl(&root.path, "http://127.0.0.1:1/mcp", "tok")
    }

    #[test]
    fn 設定ファイルを置く() {
        let root = TempRoot::new("mcpcfg");
        write(&root).expect("書き出し成功");
        assert!(root.read(".mcp.json").contains("Bearer tok"));
    }

    #[test]
    fn git管理下ならトークンを追跡対象から外す() {
        // 設定ファイルにはトークンが入る。追跡対象のままだと、公開リポジトリへそのまま載る。
        let root = TempRoot::new("mcpcfg_git");
        root.file(".git/HEAD", "ref: refs/heads/main\n");
        write(&root).expect("書き出し成功");
        assert!(root.read(".gitignore").contains(".mcp.json"));
    }

    #[test]
    fn git管理下でなければ除外ファイルを作らない() {
        let root = TempRoot::new("mcpcfg_nogit");
        write(&root).expect("書き出し成功");
        assert!(!root.path.join(".gitignore").exists());
    }

    #[test]
    fn 読めない設定ファイルがあれば書き換えない() {
        // 手で書いた設定が壊れているときに作り直すと、中身を失う。
        let root = TempRoot::new("mcpcfg_broken");
        root.file(".mcp.json", "{ こわれている");
        assert!(write(&root).is_err());
        assert_eq!(root.read(".mcp.json"), "{ こわれている");
    }

    #[test]
    fn フォルダが無ければ書かない() {
        assert!(write_client_config_impl(
            Path::new("/mdbiz_no_such_dir"),
            "http://127.0.0.1:1/mcp",
            "tok"
        )
        .is_err());
    }
}
