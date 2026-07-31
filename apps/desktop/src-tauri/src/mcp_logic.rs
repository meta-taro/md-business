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

/// サイドカーへ渡す引数を順に並べる。
///
/// 第 1 引数が作業対象フォルダ、第 2 引数が接続情報（トークン / ポート）の保存先。
/// 保存先が取れない環境では省き、その場合サイドカーは毎回新しい接続情報を発行する。
/// トークンそのものは引数に載せない（引数はプロセス一覧から見えるため）。
pub fn sidecar_args(sidecar: &Path, root: &Path, state: Option<&Path>) -> Vec<PathBuf> {
    let mut args = vec![sidecar.to_path_buf(), root.to_path_buf()];
    if let Some(path) = state {
        args.push(path.to_path_buf());
    }
    args
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
}
