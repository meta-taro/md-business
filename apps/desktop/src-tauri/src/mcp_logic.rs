//! 組み込み MCP サーバー（サイドカー）まわりの純ロジック。
//!
//! 子プロセスの起動・スレッド・イベント発行といったランタイム依存は [`crate::mcp`] に置き、
//! ここには「受け取った文字列をどう解釈するか」「どのパスを候補にするか」だけを残す。
//! 子プロセスを立てずに検査できる範囲を広く取るための分割。

use std::path::{Path, PathBuf};

use serde::Serialize;

/// サイドカーが stdout へ流す 1 行を解釈した結果。
#[derive(Debug, Clone, PartialEq)]
pub enum SidecarEvent {
    /// listen 完了。接続先と、起動ごとに発行された bearer トークン。
    Ready {
        url: String,
        port: u16,
        token: String,
        root: String,
    },
    /// ツール実行 1 件の操作ログ。中身は加工せずフロントへ素通しする。
    Log(serde_json::Value),
    /// root 差し替えの受理。
    Root { root: String },
    /// 画面でしかできない操作の依頼。処理結果は `response_line` で返す。
    Request {
        id: String,
        action: String,
        path: String,
    },
    /// サイドカー側の異常。サーバー本体は動き続ける前提。
    Error { message: String },
}

/// 受信済みバッファから完結した行を取り出す。
///
/// パイプのチャンク境界は行境界と一致しないので、末尾の未完結分は呼び出し側へ返して
/// 次のチャンクの先頭へ繋いでもらう。
pub fn split_lines(buffer: &str) -> (Vec<String>, String) {
    let mut parts: Vec<&str> = buffer.split('\n').collect();
    let rest = parts.pop().unwrap_or("").to_string();
    let lines = parts
        .into_iter()
        .map(|line| line.trim_end_matches('\r').to_string())
        .collect();
    (lines, rest)
}

/// stdout の 1 行をイベントとして解釈する。解釈できない行は `None`（読み飛ばす）。
///
/// 子は信頼できる相手だが、バージョンがずれれば知らない種別も来る。読めない行で
/// アプリを止めないため、判定は常に「読めたか / 読めなかったか」に閉じる。
pub fn parse_sidecar_line(line: &str) -> Option<SidecarEvent> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return None;
    }
    let value: serde_json::Value = serde_json::from_str(trimmed).ok()?;
    match value.get("type")?.as_str()? {
        "ready" => Some(SidecarEvent::Ready {
            url: value.get("url")?.as_str()?.to_string(),
            port: u16::try_from(value.get("port")?.as_u64()?).ok()?,
            token: value.get("token")?.as_str()?.to_string(),
            root: value.get("root")?.as_str()?.to_string(),
        }),
        "log" => Some(SidecarEvent::Log(value)),
        "root" => Some(SidecarEvent::Root {
            root: value.get("root")?.as_str()?.to_string(),
        }),
        "request" => Some(SidecarEvent::Request {
            id: value.get("id")?.as_str()?.to_string(),
            action: value.get("action")?.as_str()?.to_string(),
            path: value.get("path")?.as_str()?.to_string(),
        }),
        "error" => Some(SidecarEvent::Error {
            message: value.get("message")?.as_str()?.to_string(),
        }),
        _ => None,
    }
}

/// root 差し替えコマンドを 1 行へ組む（末尾改行込み）。
///
/// パス区切りやクォートは JSON のエスケープに任せる（Windows の `\` をそのまま
/// 書くと壊れるため、文字列連結で組まない）。
pub fn set_root_line(root: &str) -> String {
    let value = serde_json::json!({ "type": "set-root", "root": root });
    format!("{}\n", value)
}

/// 依頼への応答を 1 行へ組む（末尾改行込み）。
///
/// 依頼を出したサーバー側は応答を待っているので、成功も失敗も必ず返す。
/// 理由が無いときは項目自体を省く（空文字は「理由あり」と読めてしまう）。
pub fn response_line(id: &str, ok: bool, error: Option<&str>) -> String {
    let mut value = serde_json::json!({ "type": "response", "id": id, "ok": ok });
    if let (Some(message), Some(map)) = (error, value.as_object_mut()) {
        map.insert("error".to_string(), serde_json::json!(message));
    }
    format!("{}\n", value)
}

/// 実行時のサイドカー状態。フロントの MCP タブはこれで表示を切り替える。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum McpState {
    /// 起動処理中（ready 待ち）。
    Starting,
    /// 接続可能。
    Ready,
    /// 起動できなかった。既存機能は無影響で、MCP タブだけ劣化表示になる。
    Unavailable,
}

/// 起動できなかった理由。画面の文言は UI 言語ごとに変わるので、ここでは訳さず
/// 機械可読なコードだけを渡し、翻訳はフロント側の辞書に任せる。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum McpReason {
    /// サーバー本体（同梱サイドカー）が見つからない。
    SidecarMissing,
    /// Node ランタイムが見つからない。
    NodeMissing,
    /// 子プロセスの起動自体に失敗した。
    SpawnFailed,
    /// 起動はしたが出力を受け取れない。
    NoOutput,
    /// 接続可能になる前に終了した。
    ExitedEarly,
    /// サーバー自身がエラーを報告した。
    ServerError,
    /// 状態を読み出せない。
    StatusUnreadable,
}

/// フロントへ渡すサイドカーの状態。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpStatus {
    pub state: McpState,
    /// 接続先 URL（ready のときのみ）。
    pub url: Option<String>,
    pub port: Option<u16>,
    /// bearer トークン。利用者が AI クライアント側の設定へ貼るため画面に出す。
    pub token: Option<String>,
    /// 劣化理由のコード。表示文言はフロントの辞書が決める。
    pub reason: Option<McpReason>,
    /// サーバーが報告した原文（診断用）。翻訳できないので理由コードの補助に留める。
    pub detail: Option<String>,
}

impl McpStatus {
    /// 起動処理中の初期状態。
    pub fn starting() -> Self {
        McpStatus {
            state: McpState::Starting,
            url: None,
            port: None,
            token: None,
            reason: None,
            detail: None,
        }
    }

    /// 接続可能になった状態。
    pub fn ready(url: String, port: u16, token: String) -> Self {
        McpStatus {
            state: McpState::Ready,
            url: Some(url),
            port: Some(port),
            token: Some(token),
            reason: None,
            detail: None,
        }
    }

    /// 起動できなかった状態。理由コードを添えて劣化表示にする。
    pub fn unavailable(reason: McpReason) -> Self {
        McpStatus {
            state: McpState::Unavailable,
            url: None,
            port: None,
            token: None,
            reason: Some(reason),
            detail: None,
        }
    }

    /// 起動できなかった状態に、サーバーが報告した原文を添える。
    pub fn unavailable_with(reason: McpReason, detail: impl Into<String>) -> Self {
        McpStatus {
            detail: Some(detail.into()),
            ..McpStatus::unavailable(reason)
        }
    }
}

/// 劣化理由に添える診断文の上限（文字数）。
///
/// 画面に出す前提なので長い出力は末尾だけ残す。異常時に意味を持つのはたいてい最後の
/// 数行で、先頭は起動時の定型出力に埋もれるため。
const DETAIL_MAX_CHARS: usize = 400;

/// 文字列の末尾から `max` 文字までを返す。マルチバイトを壊さないよう文字単位で切る。
fn tail_chars(text: &str, max: usize) -> String {
    let count = text.chars().count();
    if count <= max {
        return text.to_string();
    }
    text.chars().skip(count - max).collect()
}

/// 子プロセスの標準エラー出力を、末尾だけ残しながら積む。
///
/// 子が出力し続けても記憶量が増えないよう、受け取るたびに上限で切り詰める。
pub fn append_detail(buffer: &mut String, chunk: &str) {
    buffer.push_str(chunk);
    if buffer.chars().count() > DETAIL_MAX_CHARS {
        *buffer = tail_chars(buffer, DETAIL_MAX_CHARS);
    }
}

/// 起動しきれなかった子プロセスの手掛かりを、画面へ出せる 1 つの文字列にまとめる。
///
/// 標準エラー出力と終了コードはどちらか一方しか取れないこともあるので、拾えた分だけを
/// 積む。何も残っていなければ `None` を返し、理由コードだけの表示に戻す。
pub fn startup_detail(stderr: &str, exit_code: Option<i32>) -> Option<String> {
    let mut parts: Vec<String> = Vec::new();
    if let Some(code) = exit_code {
        parts.push(format!("exit code {}", code));
    }
    let trimmed = stderr.trim();
    if !trimmed.is_empty() {
        parts.push(tail_chars(trimmed, DETAIL_MAX_CHARS));
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join("\n"))
    }
}

/// サイドカー本体（単一ファイル）を探す候補を、優先順に並べる。
///
/// 配布ビルドではリソースとして同梱されるが、開発中はリソースが作られないので
/// リポジトリ内のバンドル出力へ落ちる。両方を候補に持たせて、存在するものを使う。
pub fn sidecar_candidates(resource_dir: Option<&Path>, dev_base: Option<&Path>) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(dir) = resource_dir {
        candidates.push(dir.join("sidecar").join("sidecar.cjs"));
    }
    if let Some(base) = dev_base {
        candidates.push(
            base.join("packages")
                .join("mcp-server")
                .join("dist-sidecar")
                .join("sidecar.cjs"),
        );
    }
    candidates
}

/// 候補のうち最初に存在するものを選ぶ。存在判定は呼び出し側から渡す（検査のため）。
pub fn pick_existing(candidates: &[PathBuf], exists: impl Fn(&Path) -> bool) -> Option<PathBuf> {
    candidates.iter().find(|p| exists(p)).cloned()
}

/// Node 実行ファイルの名前。
pub fn node_exe_name() -> &'static str {
    if cfg!(windows) {
        "node.exe"
    } else {
        "node"
    }
}

/// Node を探すときに参照する、環境から取れる位置。取れなければ `None`。
///
/// 実際の取得は Tauri 側（[`crate::mcp`]）が行い、ここには値だけを渡す。
#[derive(Debug, Default, Clone)]
pub struct NodeEnv {
    pub home: Option<PathBuf>,
    pub program_files: Option<PathBuf>,
    pub local_app_data: Option<PathBuf>,
    pub app_data: Option<PathBuf>,
    /// fnm が版を置く場所（`FNM_DIR`）。利用者が既定から動かしていれば、ここだけが手掛かり。
    pub fnm_dir: Option<PathBuf>,
    /// nvm-windows が版を置く場所（`NVM_HOME`）。同上。
    pub nvm_home: Option<PathBuf>,
}

/// 版ごとにフォルダを切る管理ツールの置き場。
///
/// `dir` 直下の各フォルダ（＝版）に `suffix` を継いだものが実行ファイルの候補になる。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NodeVersionRoot {
    pub dir: PathBuf,
    pub suffix: PathBuf,
}

/// 固定位置にある Node の候補を、優先順に並べる。
///
/// PATH に載っていない Node を拾うための一覧。画面から起動したアプリが受け取る PATH は
/// ログイン時点のもので、その後に入れた Node は載らない。存在しない位置は
/// [`pick_existing`] 側で落ちるので、OS をまたいだ候補をまとめて並べてよい。
pub fn node_candidates(env: &NodeEnv) -> Vec<PathBuf> {
    let exe = node_exe_name();
    let mut candidates = Vec::new();
    if let Some(dir) = &env.program_files {
        // 公式インストーラ。nvm-windows も既定でここへ symlink を張るため、
        // 版管理を使っていても現行版がここに現れる。
        candidates.push(dir.join("nodejs").join(exe));
    }
    if let Some(dir) = &env.local_app_data {
        candidates.push(dir.join("Programs").join("nodejs").join(exe));
        candidates.push(dir.join("Volta").join("bin").join(exe));
    }
    if let Some(dir) = &env.home {
        candidates.push(dir.join(".volta").join("bin").join(exe));
        candidates.push(
            dir.join("scoop")
                .join("apps")
                .join("nodejs")
                .join("current")
                .join(exe),
        );
    }
    // 版管理を使わない一般的な導入先（Homebrew / 手動展開 / ディストリのパッケージ）。
    candidates.push(PathBuf::from("/opt/homebrew/bin").join(exe));
    candidates.push(PathBuf::from("/usr/local/bin").join(exe));
    candidates.push(PathBuf::from("/usr/bin").join(exe));
    candidates
}

/// 版ごとにフォルダを切る管理ツールの置き場を、優先順に並べる。
pub fn node_version_roots(env: &NodeEnv) -> Vec<NodeVersionRoot> {
    let exe = node_exe_name();
    let mut roots = Vec::new();
    // 管理ツール自身が宣言した位置を先に見る。既定から動かされていると、ここにしか無い。
    if let Some(dir) = &env.fnm_dir {
        roots.push(NodeVersionRoot {
            dir: dir.join("node-versions"),
            suffix: Path::new("installation").join(exe),
        });
        // Unix 版の fnm は installation の下がさらに bin で切られる。
        roots.push(NodeVersionRoot {
            dir: dir.join("node-versions"),
            suffix: Path::new("installation").join("bin").join(exe),
        });
    }
    if let Some(dir) = &env.nvm_home {
        roots.push(NodeVersionRoot {
            dir: dir.clone(),
            suffix: PathBuf::from(exe),
        });
    }
    if let Some(dir) = &env.app_data {
        // nvm-windows: %APPDATA%\nvm\v22.22.2\node.exe
        roots.push(NodeVersionRoot {
            dir: dir.join("nvm"),
            suffix: PathBuf::from(exe),
        });
        // fnm (Windows): %APPDATA%\fnm\node-versions\v22.22.2\installation\node.exe
        // Windows の fnm は Roaming 側に置く。Local 側だけを見ると丸ごと取り逃がす。
        roots.push(NodeVersionRoot {
            dir: dir.join("fnm").join("node-versions"),
            suffix: Path::new("installation").join(exe),
        });
    }
    if let Some(dir) = &env.local_app_data {
        roots.push(NodeVersionRoot {
            dir: dir.join("fnm").join("node-versions"),
            suffix: Path::new("installation").join(exe),
        });
    }
    if let Some(dir) = &env.home {
        roots.push(NodeVersionRoot {
            dir: dir.join(".nvm").join("versions").join("node"),
            suffix: Path::new("bin").join(exe),
        });
        roots.push(NodeVersionRoot {
            dir: dir
                .join(".local")
                .join("share")
                .join("fnm")
                .join("node-versions"),
            suffix: Path::new("installation").join("bin").join(exe),
        });
        roots.push(NodeVersionRoot {
            dir: dir
                .join("Library")
                .join("Application Support")
                .join("fnm")
                .join("node-versions"),
            suffix: Path::new("installation").join("bin").join(exe),
        });
    }
    roots
}

/// 版フォルダ名を新しい順に並べる。
///
/// 文字列順では `v9` が `v22` より後ろに来てしまう（先頭の文字だけで大小が決まるため）。
/// 数の並びとして比べる必要がある。版として読めない名前（`lts` など）は最後へ回す。
pub fn sort_node_versions(names: Vec<String>) -> Vec<String> {
    let mut sorted = names;
    sorted.sort_by(|a, b| {
        let (ka, kb) = (version_key(a), version_key(b));
        match (ka, kb) {
            (Some(x), Some(y)) => y.cmp(&x),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => a.cmp(b),
        }
    });
    sorted
}

/// `v22.22.2` のような名前を、比較できる数の並びへ直す。読めなければ `None`。
fn version_key(name: &str) -> Option<Vec<u64>> {
    let body = name.strip_prefix('v').unwrap_or(name);
    // 先行版の識別子（`-rc.1` など）は比較に使わない。
    let body = body.split('-').next().unwrap_or(body);
    let parts: Vec<u64> = body
        .split('.')
        .map(|p| p.parse::<u64>().ok())
        .collect::<Option<Vec<u64>>>()?;
    if parts.is_empty() {
        None
    } else {
        Some(parts)
    }
}

/// 起動を試す順に実行ファイルを並べる。
///
/// PATH の `node` を先頭に置くのは、利用者が選んだ版を尊重するため。絶対パスは
/// PATH に載っていなかったときの受け皿で、後ろに続ける。同じものは二度試さない。
pub fn node_programs(found: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut programs = vec![PathBuf::from("node")];
    for path in found {
        if !programs.contains(&path) {
            programs.push(path);
        }
    }
    programs
}

/// サイドカーへ渡す引数を順に並べる。
///
/// 第 1 引数が作業対象フォルダ、第 2 引数が接続情報（トークン / ポート）の保存先。
/// 保存先が取れない環境では省き、その場合サイドカーは毎回新しい接続情報を発行する。
/// トークンそのものは引数に載せない（引数はプロセス一覧から見えるため）。
pub fn sidecar_args(sidecar: &Path, root: &Path, state: Option<&Path>) -> Vec<PathBuf> {
    let mut args = vec![plain_path(sidecar), plain_path(root)];
    if let Some(path) = state {
        args.push(plain_path(path));
    }
    args
}

/// Windows の verbatim 表記（`\\?\` 前置き）を、ふつうのパス表記へ戻す。
///
/// OS からもらう位置はこの表記で返ることがある。Windows API はどちらでも通るが、
/// Node は `\\?\C:\...` をサーバー名 `?` / 共有名 `C:` の UNC パスと読むため、
/// ドライブ名そのものを見に行って起動に失敗する。子へ渡す値は必ずここを通す。
pub fn plain_path(path: &Path) -> PathBuf {
    let text = path.to_string_lossy();
    if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
        return PathBuf::from(format!(r"\\{}", rest));
    }
    match text.strip_prefix(r"\\?\") {
        // 戻せると分かるのはドライブ表記だけ。デバイス名などは触らずそのまま渡す。
        Some(rest) if is_drive_path(rest) => PathBuf::from(rest.to_string()),
        _ => path.to_path_buf(),
    }
}

/// `C:\...` のようにドライブ文字で始まるか。
fn is_drive_path(text: &str) -> bool {
    let mut chars = text.chars();
    let drive = chars.next().is_some_and(|c| c.is_ascii_alphabetic());
    drive && chars.next() == Some(':')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 完結した行だけを取り出し残りは持ち越す() {
        let (lines, rest) = split_lines("{\"a\":1}\n{\"b\":2}\n{\"c\":");
        assert_eq!(lines, vec!["{\"a\":1}", "{\"b\":2}"]);
        assert_eq!(rest, "{\"c\":");
    }

    #[test]
    fn 改行が来るまでは行を返さない() {
        let (lines, rest) = split_lines("{\"a\":1}");
        assert!(lines.is_empty());
        assert_eq!(rest, "{\"a\":1}");
    }

    #[test]
    fn crlfを行末として扱う() {
        let (lines, rest) = split_lines("a\r\nb\r\n");
        assert_eq!(lines, vec!["a", "b"]);
        assert_eq!(rest, "");
    }

    #[test]
    fn readyを解釈する() {
        let event = parse_sidecar_line(
            r#"{"type":"ready","url":"http://127.0.0.1:5123/mcp","port":5123,"token":"abc","root":"C:/work"}"#,
        );
        assert_eq!(
            event,
            Some(SidecarEvent::Ready {
                url: "http://127.0.0.1:5123/mcp".to_string(),
                port: 5123,
                token: "abc".to_string(),
                root: "C:/work".to_string(),
            })
        );
    }

    #[test]
    fn 操作ログは加工せず素通しする() {
        let line = r#"{"type":"log","tool":"create_document","ok":true,"ts":1,"path":"a.md"}"#;
        match parse_sidecar_line(line) {
            Some(SidecarEvent::Log(value)) => {
                assert_eq!(
                    value.get("tool").and_then(|v| v.as_str()),
                    Some("create_document")
                );
                assert_eq!(value.get("ok").and_then(|v| v.as_bool()), Some(true));
            }
            other => panic!("log として解釈されなかった: {:?}", other),
        }
    }

    #[test]
    fn rootとerrorを解釈する() {
        assert_eq!(
            parse_sidecar_line(r#"{"type":"root","root":"D:/docs"}"#),
            Some(SidecarEvent::Root {
                root: "D:/docs".to_string()
            })
        );
        assert_eq!(
            parse_sidecar_line(r#"{"type":"error","message":"だめ"}"#),
            Some(SidecarEvent::Error {
                message: "だめ".to_string()
            })
        );
    }

    #[test]
    fn 画面操作の依頼を解釈する() {
        assert_eq!(
            parse_sidecar_line(
                r#"{"type":"request","id":"req-1","action":"export-pdf","path":"invoices/INV-1.md"}"#
            ),
            Some(SidecarEvent::Request {
                id: "req-1".to_string(),
                action: "export-pdf".to_string(),
                path: "invoices/INV-1.md".to_string(),
            })
        );
    }

    #[test]
    fn 応答行はidと可否を載せてjsonへ落ちる() {
        let line = response_line("req-1", true, None);
        assert!(line.ends_with('\n'));
        let value: serde_json::Value = serde_json::from_str(line.trim_end()).unwrap();
        assert_eq!(value.get("type").and_then(|v| v.as_str()), Some("response"));
        assert_eq!(value.get("id").and_then(|v| v.as_str()), Some("req-1"));
        assert_eq!(value.get("ok").and_then(|v| v.as_bool()), Some(true));
        // 理由が無いときに空文字を送ると、サーバー側で「理由あり」と誤解される。
        assert!(value.get("error").is_none());
    }

    #[test]
    fn 失敗の応答は理由を添える() {
        let line = response_line("req-2", false, Some("プレビューが未表示です"));
        let value: serde_json::Value = serde_json::from_str(line.trim_end()).unwrap();
        assert_eq!(value.get("ok").and_then(|v| v.as_bool()), Some(false));
        assert_eq!(
            value.get("error").and_then(|v| v.as_str()),
            Some("プレビューが未表示です")
        );
    }

    #[test]
    fn 読めない行は読み飛ばす() {
        // 空行 / 壊れた JSON / JSON だが型不明 / 必須項目欠落 のいずれもアプリを止めない。
        assert_eq!(parse_sidecar_line(""), None);
        assert_eq!(parse_sidecar_line("   "), None);
        assert_eq!(parse_sidecar_line("{\"type\":"), None);
        assert_eq!(parse_sidecar_line(r#"{"type":"unknown"}"#), None);
        assert_eq!(parse_sidecar_line(r#"{"type":"request","id":"a"}"#), None);
        assert_eq!(parse_sidecar_line(r#"{"type":"ready","port":1}"#), None);
        assert_eq!(parse_sidecar_line("[1,2,3]"), None);
    }

    #[test]
    fn ポート範囲外のreadyは受け付けない() {
        assert_eq!(
            parse_sidecar_line(r#"{"type":"ready","url":"u","port":70000,"token":"t","root":"r"}"#),
            None
        );
    }

    #[test]
    fn set_root行はjsonとしてエスケープされる() {
        let line = set_root_line(r"C:\work\docs");
        assert!(line.ends_with('\n'));
        let value: serde_json::Value = serde_json::from_str(line.trim_end()).unwrap();
        assert_eq!(value.get("type").and_then(|v| v.as_str()), Some("set-root"));
        assert_eq!(
            value.get("root").and_then(|v| v.as_str()),
            Some(r"C:\work\docs")
        );
    }

    #[test]
    fn 候補はリソース優先で開発用に落ちる() {
        let resource = PathBuf::from("/app/resources");
        let dev = PathBuf::from("/repo");
        let candidates = sidecar_candidates(Some(&resource), Some(&dev));
        assert_eq!(candidates.len(), 2);
        assert!(candidates[0].ends_with("sidecar/sidecar.cjs"));
        assert!(candidates[1].ends_with("packages/mcp-server/dist-sidecar/sidecar.cjs"));
    }

    #[test]
    fn 引数は作業対象フォルダの次に接続情報の保存先を並べる() {
        let args = sidecar_args(
            Path::new("/app/sidecar.cjs"),
            Path::new("/work"),
            Some(Path::new("/config/mcp.json")),
        );
        assert_eq!(
            args,
            vec![
                PathBuf::from("/app/sidecar.cjs"),
                PathBuf::from("/work"),
                PathBuf::from("/config/mcp.json"),
            ]
        );
    }

    #[test]
    fn 保存先が取れなければ引数から省く() {
        let args = sidecar_args(Path::new("/app/sidecar.cjs"), Path::new("/work"), None);
        assert_eq!(
            args,
            vec![PathBuf::from("/app/sidecar.cjs"), PathBuf::from("/work")]
        );
    }

    #[test]
    fn 引数はすべてふつうのパス表記で渡す() {
        let args = sidecar_args(
            Path::new(r"\\?\C:\app\sidecar.cjs"),
            Path::new(r"\\?\C:\work"),
            Some(Path::new(r"\\?\C:\config\mcp.json")),
        );
        assert_eq!(
            args,
            vec![
                PathBuf::from(r"C:\app\sidecar.cjs"),
                PathBuf::from(r"C:\work"),
                PathBuf::from(r"C:\config\mcp.json"),
            ]
        );
    }

    #[test]
    fn verbatim表記のドライブパスはふつうの表記へ戻す() {
        assert_eq!(
            plain_path(Path::new(r"\\?\C:\claude\sidecar.cjs")),
            PathBuf::from(r"C:\claude\sidecar.cjs")
        );
    }

    #[test]
    fn verbatimなunc共有は二重円記号の表記へ戻す() {
        assert_eq!(
            plain_path(Path::new(r"\\?\UNC\server\share\app")),
            PathBuf::from(r"\\server\share\app")
        );
    }

    #[test]
    fn 戻し方の分からない表記とふつうのパスはそのまま渡す() {
        // デバイス名は戻す先が一意に決まらないので触らない。
        assert_eq!(
            plain_path(Path::new(r"\\?\Volume{0}\app")),
            PathBuf::from(r"\\?\Volume{0}\app")
        );
        assert_eq!(
            plain_path(Path::new(r"C:\claude\sidecar.cjs")),
            PathBuf::from(r"C:\claude\sidecar.cjs")
        );
        assert_eq!(
            plain_path(Path::new("/app/sidecar.cjs")),
            PathBuf::from("/app/sidecar.cjs")
        );
    }

    /// 同梱先の指定は設定ファイル側にあり、探索側のコードだけを見ても正しさが確かめられない。
    /// bundler は宛先を「ディレクトリ」ではなく「ファイルパス」として解釈するため、末尾に
    /// スラッシュを置いても親ディレクトリは作られず、拡張子のないファイルとして置かれてしまう。
    /// この食い違いはインストール後にしか現れないので、設定値と候補パスをここで突き合わせる。
    #[test]
    fn 設定ファイルの同梱先が候補パスと一致する() {
        let conf: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).expect("設定が読めること");
        let resources = conf["bundle"]["resources"]
            .as_object()
            .expect("resources が対応表であること");
        let dest = resources
            .iter()
            .find(|(src, _)| src.ends_with("sidecar.cjs"))
            .map(|(_, dest)| dest.as_str().expect("宛先が文字列であること"))
            .expect("サイドカーが同梱対象であること");

        let resource_dir = PathBuf::from("/app/resources");
        let candidates = sidecar_candidates(Some(&resource_dir), None);
        assert_eq!(resource_dir.join(dest), candidates[0]);
    }

    #[test]
    fn 存在する最初の候補を選ぶ() {
        let candidates = vec![PathBuf::from("/a/x.cjs"), PathBuf::from("/b/x.cjs")];
        let picked = pick_existing(&candidates, |p| p.starts_with("/b"));
        assert_eq!(picked, Some(PathBuf::from("/b/x.cjs")));
    }

    #[test]
    fn どの候補も無ければnoneを返す() {
        let candidates = vec![PathBuf::from("/a/x.cjs")];
        assert_eq!(pick_existing(&candidates, |_| false), None);
    }

    #[test]
    fn 劣化状態は理由コードを持ち接続情報を持たない() {
        let status = McpStatus::unavailable(McpReason::NodeMissing);
        assert_eq!(status.state, McpState::Unavailable);
        assert!(status.url.is_none());
        assert!(status.token.is_none());
        assert_eq!(status.reason, Some(McpReason::NodeMissing));
        assert!(status.detail.is_none());
    }

    #[test]
    fn 劣化理由はケバブケースのコードとしてjsonへ落ちる() {
        let json = serde_json::to_value(McpStatus::unavailable(McpReason::SidecarMissing)).unwrap();
        assert_eq!(
            json.get("reason").and_then(|v| v.as_str()),
            Some("sidecar-missing")
        );
        assert!(json.get("detail").map(|v| v.is_null()).unwrap_or(false));
    }

    #[test]
    fn サーバー報告の原文は理由コードに添えて渡す() {
        let status = McpStatus::unavailable_with(McpReason::ServerError, "port in use");
        assert_eq!(status.reason, Some(McpReason::ServerError));
        assert_eq!(status.detail.as_deref(), Some("port in use"));
    }

    #[test]
    fn 診断文は終了コードと標準エラーの両方を載せる() {
        let detail = startup_detail("Error: Cannot find module 'node:sqlite'\n", Some(1));
        assert_eq!(
            detail.as_deref(),
            Some("exit code 1\nError: Cannot find module 'node:sqlite'")
        );
    }

    #[test]
    fn 診断文は取れた手掛かりだけで作る() {
        assert_eq!(
            startup_detail("  \n ", Some(3)).as_deref(),
            Some("exit code 3")
        );
        assert_eq!(startup_detail("boom", None).as_deref(), Some("boom"));
    }

    #[test]
    fn 手掛かりが無ければ診断文を作らない() {
        assert_eq!(startup_detail("   \n\n", None), None);
    }

    #[test]
    fn 長い標準エラーは末尾だけ残す() {
        let noisy = "あ".repeat(500) + "最後の一行";
        let detail = startup_detail(&noisy, None).unwrap();
        assert_eq!(detail.chars().count(), 400);
        assert!(detail.ends_with("最後の一行"));
    }

    #[test]
    fn 標準エラーの蓄積は上限を超えない() {
        let mut buffer = String::new();
        for _ in 0..10 {
            append_detail(&mut buffer, &"x".repeat(100));
        }
        append_detail(&mut buffer, "tail");
        assert_eq!(buffer.chars().count(), 400);
        assert!(buffer.ends_with("tail"));
    }

    #[test]
    fn 状態はキャメルケースのjsonへ落ちる() {
        let json = serde_json::to_value(McpStatus::ready(
            "http://127.0.0.1:1/mcp".to_string(),
            1,
            "t".to_string(),
        ))
        .unwrap();
        assert_eq!(json.get("state").and_then(|v| v.as_str()), Some("ready"));
        assert_eq!(json.get("port").and_then(|v| v.as_u64()), Some(1));
    }

    /// Node を PATH だけに頼って探すと、入っているのに見つからない環境がある。
    ///
    /// 画面から起動したアプリが受け取る PATH はログイン時点のもので、その後に入れた Node や
    /// シェル起動時に PATH を書き換える版管理ツール（nvm / fnm）の Node は載っていない。
    /// 利用者から見ると「Node は入っているのに Node が無いと言われる」状態になる。
    fn full_env() -> NodeEnv {
        NodeEnv {
            home: Some(PathBuf::from("/home/u")),
            program_files: Some(PathBuf::from("/pf")),
            local_app_data: Some(PathBuf::from("/lad")),
            app_data: Some(PathBuf::from("/ad")),
            fnm_dir: Some(PathBuf::from("/fnm")),
            nvm_home: Some(PathBuf::from("/nvm")),
        }
    }

    fn joined(candidates: &[PathBuf]) -> String {
        candidates
            .iter()
            .map(|p| p.to_string_lossy().replace('\\', "/"))
            .collect::<Vec<_>>()
            .join("\n")
    }

    #[test]
    fn node候補に既定の導入先を並べる() {
        let text = joined(&node_candidates(&full_env()));
        // 公式インストーラ（nvm-windows もここへ symlink を張る）。
        assert!(text.contains("/pf/nodejs/"));
        // パッケージ管理を通さない一般的な導入先。
        assert!(text.contains("/usr/local/bin/"));
    }

    #[test]
    fn 環境から取れない位置の候補は並べない() {
        let text = joined(&node_candidates(&NodeEnv::default()));
        assert!(!text.contains("nodejs"));
        assert!(!text.contains("Volta"));
    }

    #[test]
    fn 候補はすべて実行ファイル名で終わる() {
        let candidates = node_candidates(&full_env());
        assert!(!candidates.is_empty());
        assert!(candidates.iter().all(|p| p.ends_with(node_exe_name())));
    }

    #[test]
    fn 版ごとにフォルダを切る管理ツールは掘る先を持つ() {
        let roots = node_version_roots(&full_env());
        let text = roots
            .iter()
            .map(|r| r.dir.to_string_lossy().replace('\\', "/"))
            .collect::<Vec<_>>()
            .join("\n");
        // nvm-windows は %APPDATA%\nvm\v<版>\node.exe。
        assert!(text.contains("/ad/nvm"));
        // fnm は node-versions の下に版フォルダを切る。
        assert!(text.contains("node-versions"));
        assert!(roots.iter().all(|r| r.suffix.ends_with(node_exe_name())));
    }

    #[test]
    fn windowsのfnmはroaming側に置かれる() {
        // 実機で確認: %APPDATA%\fnm\node-versions\v22.22.2\installation\node.exe。
        // Local 側だけを見ていると、fnm で入れた Node をまるごと取り逃がす。
        let roots = node_version_roots(&full_env());
        assert!(roots
            .iter()
            .any(|r| r.dir == PathBuf::from("/ad").join("fnm").join("node-versions")));
    }

    #[test]
    fn 管理ツールが位置を宣言していればそちらを先に見る() {
        // FNM_DIR / NVM_HOME は利用者が置き場を動かしたときの唯一の手掛かり。
        // 既定の位置を先に当たると、動かした先にある新しい版を取り逃がす。
        let roots = node_version_roots(&full_env());
        let first_fnm = roots
            .iter()
            .position(|r| r.dir.starts_with("/fnm"))
            .expect("FNM_DIR の候補があること");
        let default_fnm = roots
            .iter()
            .position(|r| r.dir.starts_with("/ad"))
            .expect("既定位置の候補があること");
        assert!(first_fnm < default_fnm);
        assert!(roots.iter().any(|r| r.dir == Path::new("/nvm")));
    }

    #[test]
    fn 版フォルダは数として新しい順に並べる() {
        // 文字列順だと v9 が v22 より新しい扱いになる。数として比べる必要がある。
        let sorted = sort_node_versions(vec![
            "v9.0.0".to_string(),
            "v22.22.2".to_string(),
            "v10.1.0".to_string(),
        ]);
        assert_eq!(sorted, vec!["v22.22.2", "v10.1.0", "v9.0.0"]);
    }

    #[test]
    fn 版として読めない名前は後ろへ回す() {
        let sorted = sort_node_versions(vec![
            "lts".to_string(),
            "v18.0.0".to_string(),
            "v20.1.0".to_string(),
        ]);
        assert_eq!(sorted, vec!["v20.1.0", "v18.0.0", "lts"]);
    }

    #[test]
    fn まずpathのnodeを試してから絶対パスへ落ちる() {
        let programs = node_programs(vec![PathBuf::from("/pf/nodejs/node")]);
        assert_eq!(programs[0], PathBuf::from("node"));
        assert_eq!(programs[1], PathBuf::from("/pf/nodejs/node"));
    }

    #[test]
    fn 同じ実行ファイルを二度試さない() {
        let programs = node_programs(vec![
            PathBuf::from("/pf/nodejs/node"),
            PathBuf::from("/pf/nodejs/node"),
        ]);
        assert_eq!(programs.len(), 2);
    }
}
