//! Git 連携の Tauri コマンド（DESIGN 後続フェーズ 3「Git・フォージ」）。
//!
//! ワークスペース root が git リポジトリなら、ファイル別の変更状態（VSCode 風の
//! 色マーク用）とブランチ / ahead-behind / フォージ種別（StatusBar 用）を返す。
//!
//! 取得は `git` CLI の実行による（`git status --porcelain=v2 --branch -z` ほか）。
//! libgit2 系クレートは Windows ビルドが重いため採らない。git 未導入・非リポジトリ・
//! その他失敗時は `is_repo=false` の空ステータスへ無害に劣化させ、UI はマーク非表示にする。
//!
//! 実行は必ず `git_command` を通す。Windows で素の `Command::new("git")` を使うと、
//! GUI アプリから起動した子プロセスにコンソールウィンドウが割り当てられ、実行のたびに
//! 黒い窓が開いて消える（前面も奪う）。起動直後は状態取得で複数回呼ぶため、続けて瞬く。
//!
//! パース（porcelain v2 -z → GitStatus）とフォージ判定は Tauri 非依存の純関数へ寄せ、
//! `#[cfg(test)]` から固定文字列に対して単体テストする（workspace.rs と同流儀・§7.3）。

use serde::Serialize;
use std::path::Path;
use std::process::Command;
#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// `git -C <root> --no-optional-locks` まで組んだ `Command`。
/// Windows ではコンソールウィンドウを割り当てない（`CREATE_NO_WINDOW`）。
fn git_command(root: &Path) -> Command {
    let mut command = Command::new("git");
    command.arg("-C").arg(root).arg("--no-optional-locks");
    // 端末を持たない子プロセスなので、git が利用者名やパスワードを尋ね始めると
    // 誰も答えられないまま待ち続ける（窓も出ないので、画面上は固まったようにしか見えない）。
    // 尋ねさせず即座に失敗させ、理由を読める形で返す。資格情報は OS 側の
    // credential helper が答える経路だけを使う（アプリは一切預からない）。
    command.env("GIT_TERMINAL_PROMPT", "0");
    #[cfg(windows)]
    command.creation_flags(0x0800_0000);
    command
}

/// 1 ファイルの変更状態。`rel_path` は root からの相対パス（区切りは "/"）。
/// `state` は色マークの意味カテゴリ（フロントの gitMark が色・バッジ文字へ写像する）。
#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitFileStatus {
    pub rel_path: String,
    /// "modified" | "added" | "untracked" | "deleted" | "renamed" | "conflicted"
    pub state: String,
}

/// push の結果。状態に加えて、置き先が出力へ載せてきた案内 URL（あれば）を持つ。
#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PushOutcome {
    pub status: GitStatus,
    /// 置き先が「続きはここで」と返してきた URL。案内が無ければ None。
    pub url: Option<String>,
}

/// ワークスペースの git 状態スナップショット。非リポジトリ時は `is_repo=false`・他は既定。
#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub is_repo: bool,
    /// 現在ブランチ名。detached HEAD は None。
    pub branch: Option<String>,
    /// upstream より進んでいる commit 数。
    pub ahead: u32,
    /// upstream より遅れている commit 数。
    pub behind: u32,
    /// 変更のあるファイルのみ（未変更は含めない）。ファイルパスはリポジトリ root 基準。
    pub files: Vec<GitFileStatus>,
    /// remote から判定したフォージ種別。"github" | "gitlab" | "bitbucket" | "other" | None。
    pub forge: Option<String>,
    /// リポジトリ root から「開いたフォルダ」までのパス（"/"-終端 or 空）。
    /// git のパスは repo root 基準・scan の relPath は開いたフォルダ基準なので、
    /// フロントはこの prefix を足して両者を突き合わせる（サブディレクトリを開いた場合の整合）。
    pub prefix: String,
}

impl GitStatus {
    /// 非リポジトリ（または git 取得失敗）時の空ステータス。
    pub fn not_a_repo() -> Self {
        GitStatus {
            is_repo: false,
            branch: None,
            ahead: 0,
            behind: 0,
            files: Vec::new(),
            forge: None,
            prefix: String::new(),
        }
    }
}

/// `git rev-parse --show-prefix` の生出力を正規化する。
/// 末尾改行を除き、区切りを "/" に統一。非空なら "/" 終端を保証する（repo root なら空）。
fn normalize_prefix(raw: &str) -> String {
    let trimmed = raw.trim().replace('\\', "/");
    if trimmed.is_empty() {
        return String::new();
    }
    if trimmed.ends_with('/') {
        trimmed
    } else {
        format!("{}/", trimmed)
    }
}

/// porcelain v2 の XY 2 文字（index, worktree）から色マーク用の状態カテゴリを 1 つ選ぶ。
/// 追加・削除・リネームを優先し、残りは modified に丸める（単一マーク表示のため）。
fn classify_xy(xy: &str) -> String {
    let has = |c: char| xy.contains(c);
    if has('A') {
        "added"
    } else if has('D') {
        "deleted"
    } else if has('R') {
        "renamed"
    } else {
        // M（変更）/ T（型変更）/ C（コピー）/ その他はまとめて modified。
        "modified"
    }
    .to_string()
}

/// `git status --porcelain=v2 --branch -z` の stdout を GitStatus へパースする（Tauri 非依存）。
///
/// -z 指定で全レコードが NUL 終端。ヘッダ（`# branch.*`）とエントリ（`1`/`2`/`u`/`?`/`!`）を
/// NUL 区切りで走査する。リネーム（`2 ...`）は path の直後に origPath が別 NUL フィールドで続くため、
/// 1 レコードで 2 フィールドを消費する（look-ahead）。`forge` は別途 remote から与える。
pub fn parse_status_porcelain_v2(stdout: &str, forge: Option<String>) -> GitStatus {
    let mut status = GitStatus {
        is_repo: true,
        branch: None,
        ahead: 0,
        behind: 0,
        files: Vec::new(),
        forge,
        // prefix は Tauri 側（git_status_impl）で rev-parse から補う。パース単体では空。
        prefix: String::new(),
    };

    // NUL で分割。末尾の空要素は無視する。
    let mut fields = stdout.split('\0').filter(|f| !f.is_empty()).peekable();

    while let Some(field) = fields.next() {
        if let Some(rest) = field.strip_prefix("# branch.head ") {
            status.branch = if rest == "(detached)" {
                None
            } else {
                Some(rest.to_string())
            };
        } else if let Some(rest) = field.strip_prefix("# branch.ab ") {
            // 形式: "+<ahead> -<behind>"
            let mut parts = rest.split(' ');
            if let Some(a) = parts.next() {
                status.ahead = a.trim_start_matches('+').parse().unwrap_or(0);
            }
            if let Some(b) = parts.next() {
                status.behind = b.trim_start_matches('-').parse().unwrap_or(0);
            }
        } else if field.starts_with("# ") {
            // 他ヘッダ（branch.oid / branch.upstream 等）は無視。
            continue;
        } else if let Some(path) = field.strip_prefix("? ") {
            // 未追跡ファイル。
            status.files.push(GitFileStatus {
                rel_path: normalize_sep(path),
                state: "untracked".to_string(),
            });
        } else if field.starts_with("! ") {
            // 無視ファイル（ignored）は表示しない。
            continue;
        } else if field.starts_with("1 ") {
            // 通常変更: "1 <xy> <sub> <mH> <mI> <mW> <hH> <hI> <path>"
            // メタ 8 トークンの後が path（path にスペースを含み得るため splitn(9)）。
            if let Some((xy, path)) = parse_entry_1(field) {
                status.files.push(GitFileStatus {
                    rel_path: normalize_sep(path),
                    state: classify_xy(xy),
                });
            }
        } else if field.starts_with("2 ") {
            // リネーム/コピー: メタ 9 トークン + path、origPath は次の NUL フィールド。
            if let Some((xy, path)) = parse_entry_2(field) {
                status.files.push(GitFileStatus {
                    rel_path: normalize_sep(path),
                    state: classify_xy(xy),
                });
            }
            // origPath フィールドを 1 つ読み飛ばす（消費しないと次レコードとしてズレる）。
            fields.next();
        } else if field.starts_with("u ") {
            // 未マージ（コンフリクト）: "u <xy> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>"
            if let Some(path) = parse_entry_u(field) {
                status.files.push(GitFileStatus {
                    rel_path: normalize_sep(path),
                    state: "conflicted".to_string(),
                });
            }
        }
        // それ以外の未知レコードは無視。
    }

    status
}

/// バックスラッシュ区切りを "/" に正規化（Windows の git は既に "/" を返すが保険）。
fn normalize_sep(path: &str) -> String {
    path.replace('\\', "/")
}

/// 通常変更エントリ（`1 ...`）から (XY, path) を取り出す。メタ 8 トークン + path。
fn parse_entry_1(field: &str) -> Option<(&str, &str)> {
    let mut parts = field.splitn(9, ' ');
    let _tag = parts.next()?; // "1"
    let xy = parts.next()?;
    // sub, mH, mI, mW, hH, hI を読み飛ばす（6 トークン）。
    for _ in 0..6 {
        parts.next()?;
    }
    let path = parts.next()?;
    Some((xy, path))
}

/// リネーム/コピーエントリ（`2 ...`）から (XY, path) を取り出す。メタ 9 トークン + path。
fn parse_entry_2(field: &str) -> Option<(&str, &str)> {
    let mut parts = field.splitn(10, ' ');
    let _tag = parts.next()?; // "2"
    let xy = parts.next()?;
    // sub, mH, mI, mW, hH, hI, <Xscore> を読み飛ばす（7 トークン）。
    for _ in 0..7 {
        parts.next()?;
    }
    let path = parts.next()?;
    Some((xy, path))
}

/// 未マージエントリ（`u ...`）から path を取り出す。メタ 10 トークン + path。
fn parse_entry_u(field: &str) -> Option<&str> {
    let mut parts = field.splitn(11, ' ');
    parts.next()?; // "u"
    for _ in 0..9 {
        parts.next()?;
    }
    parts.next()
}

/// remote URL からフォージ種別を判定する（Tauri 非依存）。
/// host 部分の部分一致で判定し、既知でなければ "other"。空/None は None。
pub fn detect_forge(remote_url: Option<&str>) -> Option<String> {
    let url = remote_url?.trim();
    if url.is_empty() {
        return None;
    }
    let lower = url.to_ascii_lowercase();
    let forge = if lower.contains("github.com") {
        "github"
    } else if lower.contains("gitlab.com") || lower.contains("gitlab") {
        "gitlab"
    } else if lower.contains("bitbucket.org") || lower.contains("bitbucket") {
        "bitbucket"
    } else {
        "other"
    };
    Some(forge.to_string())
}

/// remote URL（SSH / HTTPS / scp 風）をブラウザで開ける https ベース URL へ正規化する。
/// 末尾 `.git` と認証情報（`user@`）を除去し、`git@host:owner/repo` / `ssh://git@host/owner/repo`
/// / `https://host/owner/repo` のいずれも `https://host/owner/repo` へ寄せる。判定不能は None。
fn remote_to_web_base(remote: &str) -> Option<String> {
    let url = remote.trim().trim_end_matches('/');
    if url.is_empty() {
        return None;
    }
    // scheme と認証情報を剥がして "host/owner/repo..." の本体を得る。
    let body = if let Some(rest) = url
        .strip_prefix("https://")
        .or_else(|| url.strip_prefix("http://"))
        .or_else(|| url.strip_prefix("ssh://"))
        .or_else(|| url.strip_prefix("git://"))
    {
        // scheme 付き: 認証情報 "user@" を落とし、host/path はそのまま（"/" 区切り）。
        rest.rsplit_once('@').map_or(rest, |(_, after)| after).to_string()
    } else if let Some(rest) = url.strip_prefix("git@") {
        // scp 風 "git@host:owner/repo": host と path の区切り ':' を '/' へ。
        rest.replacen(':', "/", 1)
    } else if url.contains('@') && url.contains(':') && !url.contains("://") {
        // scheme 無し scp 風 "user@host:owner/repo"。
        let after = url.rsplit_once('@').map_or(url, |(_, a)| a);
        after.replacen(':', "/", 1)
    } else {
        return None;
    };
    let base = body.trim_end_matches('/').trim_end_matches(".git");
    // host と最低 1 セグメント（owner/repo 相当）が無ければ URL を作れない。
    if !base.contains('/') || base.starts_with('/') {
        return None;
    }
    Some(format!("https://{base}"))
}

/// remote URL + ブランチ + リポジトリ相対パスから、フォージ上のファイル閲覧 URL を組み立てる。
/// github/gitlab は `/blob/<branch>/<path>`、bitbucket は `/src/<branch>/<path>`。
/// remote 無し・未知フォージ・不正入力は None（呼び出し側は「フォージで開く」項目を出さない）。
pub fn build_forge_file_url(remote_url: Option<&str>, branch: &str, rel_path: &str) -> Option<String> {
    let branch = branch.trim();
    // rel パスは区切りを '/' へ正規化し、先頭 '/' を除く。
    let rel = rel_path.trim().replace('\\', "/");
    let rel = rel.trim_start_matches('/');
    if branch.is_empty() || rel.is_empty() {
        return None;
    }
    let remote = remote_url?.trim();
    let base = remote_to_web_base(remote)?;
    let segment = match detect_forge(Some(remote)).as_deref() {
        Some("github") | Some("gitlab") => "blob",
        Some("bitbucket") => "src",
        _ => return None,
    };
    Some(format!("{base}/{segment}/{branch}/{rel}"))
}

/// `git -C <root> <args...>` を実行し、成功時のみ stdout を UTF-8（lossy）で返す。
/// git 未導入（spawn 失敗）・非 0 終了（非リポジトリ等）は None（呼び出し側で graceful 劣化）。
/// `--no-optional-locks` で index.lock 生成を避け、他プロセスの git 操作と競合しないようにする。
fn run_git(root: &Path, args: &[&str]) -> Option<String> {
    let output = git_command(root).args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&output.stdout).into_owned())
}

/// ワークスペース root の git 状態を取得する（Tauri 非依存の実体）。
/// git 未導入・非リポジトリ・失敗時は `is_repo=false` の空ステータスへ無害に劣化する。
pub fn git_status_impl(root: &Path) -> GitStatus {
    let stdout = match run_git(root, &["status", "--porcelain=v2", "--branch", "-z"]) {
        Some(s) => s,
        None => return GitStatus::not_a_repo(),
    };
    // remote origin の URL からフォージ種別を判定（remote 無しは None）。
    let remote = run_git(root, &["remote", "get-url", "origin"])
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let forge = detect_forge(remote.as_deref());
    let mut status = parse_status_porcelain_v2(&stdout, forge);
    // repo root → 開いたフォルダ の相対プレフィックス（サブディレクトリを開いた場合の突き合わせ用）。
    if let Some(raw) = run_git(root, &["rev-parse", "--show-prefix"]) {
        status.prefix = normalize_prefix(&raw);
    }
    status
}

/// `Result` を返す git 操作を別スレッドで実行する。スレッドが落ちた場合だけ Err を作り、
/// それ以外は実体の結果をそのまま返す。
async fn spawn_git<T, F>(job: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(job)
        .await
        .map_err(|e| format!("git を実行できませんでした: {}", e))?
}

/// フロントから `invoke("git_status", { root })` で呼ぶ薄いラッパ。
/// 失敗は Err にせず `is_repo=false` を返す（UI はマーク非表示で劣化）。
/// git はどれも子プロセスを起こして待つ。同期コマンドはメインスレッドで動くので、
/// そのまま呼ぶと待っている間ずっと画面が固まる（保存のたびに走る `git_status` は
/// 打鍵の合間に効いてくる）。別スレッドへ出して返りだけ待つ。
#[tauri::command]
pub async fn git_status(root: String) -> GitStatus {
    tauri::async_runtime::spawn_blocking(move || git_status_impl(Path::new(&root)))
        .await
        .unwrap_or_else(|_| GitStatus::not_a_repo())
}

/// 開いたフォルダ基準の相対パスを、フォージ上のファイル閲覧 URL へ解決する（Tauri 非依存の実体）。
/// git 未導入・非リポジトリ・remote 無し・未知フォージ・detached HEAD では None（コンテキスト
/// メニューは「フォージで開く」項目を出さない）。`rel_path` は scan と同じく開いたフォルダ基準なので、
/// `rev-parse --show-prefix` の prefix を前置して repo root 基準へ直してから URL を組む。
pub fn forge_file_url_impl(root: &Path, rel_path: &str) -> Option<String> {
    let remote = run_git(root, &["remote", "get-url", "origin"])
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())?;
    let branch = run_git(root, &["rev-parse", "--abbrev-ref", "HEAD"]).map(|s| s.trim().to_string())?;
    if branch.is_empty() || branch == "HEAD" {
        return None; // detached HEAD はブランチ URL を作れない。
    }
    let prefix = run_git(root, &["rev-parse", "--show-prefix"])
        .map(|s| normalize_prefix(&s))
        .unwrap_or_default();
    let rel = rel_path.trim().replace('\\', "/");
    let full_rel = format!("{prefix}{}", rel.trim_start_matches('/'));
    build_forge_file_url(Some(&remote), &branch, &full_rel)
}

/// フロントから `invoke("forge_file_url", { root, relPath })` で呼ぶ薄いラッパ。
/// URL を作れないときは None（フロントはメニュー項目を非表示にする）。
#[tauri::command]
pub async fn forge_file_url(root: String, rel_path: String) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || forge_file_url_impl(Path::new(&root), &rel_path))
        .await
        .unwrap_or(None)
}

/// 共有リンクが指すリポジトリの見分け方と、開いたフォルダのその中での位置。
#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitIdentity {
    /// `github.com/owner/repo` の形。共有リンクに載せ、受け取った側で突き合わせる。
    pub repo: String,
    /// 現在ブランチ名。detached HEAD では空。
    pub branch: String,
    /// リポジトリ root から「開いたフォルダ」までのパス（"/"-終端 or 空）。
    pub prefix: String,
}

/// remote URL からリポジトリの呼び名（`host/owner/repo`）を作る。
/// フォージ種別を問わないのは、リンクは閲覧 URL ではなく突き合わせの鍵として使うため。
pub fn repo_name(remote_url: Option<&str>) -> Option<String> {
    let base = remote_to_web_base(remote_url?.trim())?;
    let name = base.strip_prefix("https://")?;
    if name.is_empty() {
        return None;
    }
    Some(name.to_string())
}

/// 開いたフォルダから、共有リンクに必要な情報を集める（Tauri 非依存の実体）。
/// git 未導入・非リポジトリ・remote 無しでは None（共有リンクは作れない）。
pub fn git_identity_impl(root: &Path) -> Option<GitIdentity> {
    let remote = run_git(root, &["remote", "get-url", "origin"]).map(|s| s.trim().to_string())?;
    let repo = repo_name(Some(&remote))?;
    let branch = run_git(root, &["rev-parse", "--abbrev-ref", "HEAD"])
        .map(|s| s.trim().to_string())
        .filter(|b| !b.is_empty() && b != "HEAD")
        .unwrap_or_default();
    let prefix = run_git(root, &["rev-parse", "--show-prefix"])
        .map(|s| normalize_prefix(&s))
        .unwrap_or_default();
    Some(GitIdentity { repo, branch, prefix })
}

/// フロントから `invoke("git_identity", { root })` で呼ぶ薄いラッパ。
#[tauri::command]
pub async fn git_identity(root: String) -> Option<GitIdentity> {
    tauri::async_runtime::spawn_blocking(move || git_identity_impl(Path::new(&root)))
        .await
        .unwrap_or(None)
}

/// 1 ファイルに絞った `git status --porcelain=v2 --ignored=matching -z -- <path>` の
/// stdout を、ファイル情報ダイアログ用の管理状態へ写像する（Tauri 非依存の純関数）。
///
/// 出力が空＝そのファイルに差分が無い、つまり追跡済みで未変更。`?` は未追跡、`!` は
/// 除外設定、`u` はコンフリクト、`1`/`2` は変更で `classify_xy` に合わせる。
pub fn parse_file_state(stdout: &str) -> String {
    let field = match stdout.split('\0').find(|f| !f.is_empty()) {
        Some(f) => f,
        // 差分レコードが 1 つも出ない＝追跡済みで変更なし。
        None => return "tracked".to_string(),
    };
    if field.starts_with("? ") {
        "untracked".to_string()
    } else if field.starts_with("! ") {
        "ignored".to_string()
    } else if field.starts_with("u ") {
        "conflicted".to_string()
    } else if field.starts_with("1 ") {
        parse_entry_1(field).map_or_else(|| "modified".to_string(), |(xy, _)| classify_xy(xy))
    } else if field.starts_with("2 ") {
        parse_entry_2(field).map_or_else(|| "renamed".to_string(), |(xy, _)| classify_xy(xy))
    } else {
        "tracked".to_string()
    }
}

/// 1 ファイルの git 管理状態を取得する（Tauri 非依存の実体）。
///
/// 全体の `git_status` と別に 1 ファイルだけ引くのは、ファイル情報ダイアログが
/// 「除外設定（.gitignore）」「追跡されていない」まで区別して出すため。`git_status` は
/// 表示しないファイル（ignored / 未変更）を落としており、この 2 つを見分けられない。
/// git 未導入・非リポジトリ・失敗時は "notRepo" へ無害に劣化する。
pub fn git_file_state_impl(root: &Path, rel_path: &str) -> String {
    // repo root 基準へ直してから引く（サブディレクトリを開いている場合の整合）。
    let prefix = run_git(root, &["rev-parse", "--show-prefix"])
        .map(|s| normalize_prefix(&s))
        .unwrap_or_default();
    let rel = rel_path.trim().replace('\\', "/");
    let full_rel = format!("{prefix}{}", rel.trim_start_matches('/'));
    // `:(literal)` でグロブ文字（* ? [ ]）を含むファイル名をパターンとして解釈させない。
    let pathspec = format!(":(literal){full_rel}");
    match run_git(
        root,
        &[
            "status",
            "--porcelain=v2",
            "--ignored=matching",
            "-z",
            "--",
            &pathspec,
        ],
    ) {
        Some(stdout) => parse_file_state(&stdout),
        None => "notRepo".to_string(),
    }
}

/// フロントから `invoke("git_file_state", { root, relPath })` で呼ぶ薄いラッパ。
#[tauri::command]
pub async fn git_file_state(root: String, rel_path: String) -> String {
    tauri::async_runtime::spawn_blocking(move || git_file_state_impl(Path::new(&root), &rel_path))
        .await
        .unwrap_or_else(|_| "notRepo".to_string())
}

/// `run_git` の Result 版。失敗時は stderr（無ければ終了コード）を Err で返す。
/// switch のようにユーザーへ失敗理由を見せたい操作で使う。
fn run_git_result(root: &Path, args: &[&str]) -> Result<String, String> {
    run_git_captured(root, args).map(|(stdout, _)| stdout)
}

/// 成功時の stdout と stderr を両方返す版。git は進捗も案内（「PR を作るなら…」）も
/// stderr へ書くため、成功時の stderr を捨てる run_git_result では拾えない。
fn run_git_captured(root: &Path, args: &[&str]) -> Result<(String, String), String> {
    let output = git_command(root)
        .args(args)
        .output()
        .map_err(|e| format!("git を実行できません: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("git が失敗しました (code {:?})", output.status.code())
        } else {
            stderr
        });
    }
    Ok((
        String::from_utf8_lossy(&output.stdout).into_owned(),
        String::from_utf8_lossy(&output.stderr).into_owned(),
    ))
}

/// `git branch --format=%(refname:short)` の出力をローカルブランチ名一覧へ。
/// 空行・前後空白を除く（Tauri 非依存の純関数）。
pub fn parse_branches(stdout: &str) -> Vec<String> {
    stdout
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .map(|l| l.to_string())
        .collect()
}

/// ブランチ名として受け付けてよいか（引数注入・空・空白・制御文字を弾く防御）。
/// 一覧は git 由来だが、switch へ渡す前に外部入力として最小限バリデートする。
/// 先頭 '-' はオプション注入（例 "-f"）防止のため拒否する。
pub fn is_safe_branch_name(name: &str) -> bool {
    !name.is_empty()
        && !name.starts_with('-')
        && !name.contains('\0')
        && !name.chars().any(char::is_whitespace)
}

/// ローカルブランチ一覧を取得する（Tauri 非依存の実体）。失敗時は空。
pub fn git_branches_impl(root: &Path) -> Vec<String> {
    match run_git(root, &["branch", "--format=%(refname:short)"]) {
        Some(s) => parse_branches(&s),
        None => Vec::new(),
    }
}

/// フロントから `invoke("git_branches", { root })` で呼ぶラッパ。非リポジトリ等は空一覧。
#[tauri::command]
pub async fn git_branches(root: String) -> Vec<String> {
    tauri::async_runtime::spawn_blocking(move || git_branches_impl(Path::new(&root)))
        .await
        .unwrap_or_default()
}

/// 設定済みリモート名の一覧（`git remote`）。失敗・非リポジトリは空。
/// 出力は 1 行 1 名なので、ブランチ一覧と同じ整形で足りる。
pub fn git_remotes_impl(root: &Path) -> Vec<String> {
    match run_git(root, &["remote"]) {
        Some(s) => parse_branches(&s),
        None => Vec::new(),
    }
}

/// ブランチを作って切り替える（`switch -c`）。既にある名前なら git が失敗し、その理由を返す。
/// 名前は git を呼ぶ前に検証する（先頭 '-' はオプション注入になる）。
pub fn git_switch_create_impl(root: &Path, branch: &str) -> Result<GitStatus, String> {
    if !is_safe_branch_name(branch) {
        return Err(format!("不正なブランチ名です: {branch:?}"));
    }
    run_git_result(root, &["switch", "-c", branch])?;
    Ok(git_status_impl(root))
}

/// フロントから `invoke("git_switch_create", { root, branch })` で呼ぶラッパ。
#[tauri::command]
pub async fn git_switch_create(root: String, branch: String) -> Result<GitStatus, String> {
    spawn_git(move || git_switch_create_impl(Path::new(&root), &branch)).await
}

/// ブランチを切り替え、成功時は最新の GitStatus を返す。失敗時は git の stderr を Err で返す。
/// `-f` は使わない = 未コミット変更で衝突するなら失敗させ、作業ツリーを破壊しない（§6 の安全側）。
pub fn git_switch_impl(root: &Path, branch: &str) -> Result<GitStatus, String> {
    if !is_safe_branch_name(branch) {
        return Err(format!("不正なブランチ名です: {branch:?}"));
    }
    run_git_result(root, &["switch", branch])?;
    Ok(git_status_impl(root))
}

/// フロントから `invoke("git_switch", { root, branch })` で呼ぶラッパ。
/// 成功で最新ステータス、失敗（衝突・不明ブランチ等）は Err(メッセージ)。
#[tauri::command]
pub async fn git_switch(root: String, branch: String) -> Result<GitStatus, String> {
    spawn_git(move || git_switch_impl(Path::new(&root), &branch)).await
}

/// コミットメッセージとして受け付けてよいか（空・空白のみを弾く＝空コミット防止）。
/// メッセージは `git commit -m <msg>` の位置引数として渡すので、先頭 '-' でも
/// オプション注入にならない（`-m` が次の 1 引数を確実に消費する）。中身の検閲はしない。
pub fn is_valid_commit_message(message: &str) -> bool {
    !message.trim().is_empty()
}

/// コミット対象のパスとして受け付けてよいか。
/// pathspec は `--` の後ろに置くのでオプション注入にはならない（先頭 '-' も可）。
/// 弾くのは「リポジトリの外を指すもの」＝絶対パス・ドライブ・UNC・`..` 成分。
pub fn is_valid_commit_path(path: &str) -> bool {
    if path.trim().is_empty() || path.contains('\0') {
        return false;
    }
    let bytes = path.as_bytes();
    // 先頭が区切り（`/a` `\a` `\\server\share`）＝ルート起点。
    if matches!(bytes[0], b'/' | b'\\') {
        return false;
    }
    // ドライブ指定（`C:\...` `C:a`）。
    if bytes.len() >= 2 && bytes[1] == b':' {
        return false;
    }
    !path.split(['/', '\\']).any(|segment| segment == "..")
}

/// 変更をステージしてコミットする。成功時は最新の GitStatus を返す。
/// - `paths` が空なら全変更（`git add -A`）。指定があればその分だけ。
/// - 空メッセージは git 実行前に弾く（空コミットを作らない）。
/// - ステージ後に変更が無ければ `git commit` が失敗する＝その stderr をそのまま Err で返す。
/// - `--no-verify` は付けない（リポジトリ側の hook を尊重する）。
///
/// 指定ありのときは `commit` にも同じ pathspec を渡す。ステージするだけだと、
/// 利用者が別に `git add` 済みの変更が同じコミットへ紛れ込む。混ざったことは後から
/// 履歴でしか分からないので、選んだ分だけを記録する。
pub fn git_commit_impl(root: &Path, message: &str, paths: &[String]) -> Result<GitStatus, String> {
    if !is_valid_commit_message(message) {
        return Err("コミットメッセージを入力してください".to_string());
    }
    for path in paths {
        if !is_valid_commit_path(path) {
            return Err(format!("コミットできないパスです: {path}"));
        }
    }

    if paths.is_empty() {
        // 全変更をステージ（新規・削除・変更を含む）。add -A は cwd に関わらずリポジトリ全体。
        run_git_result(root, &["add", "-A"])?;
        // message は位置引数として渡す（先頭 '-' でも注入にならない）。
        run_git_result(root, &["commit", "-m", message])?;
        return Ok(git_status_impl(root));
    }

    let specs: Vec<&str> = paths.iter().map(String::as_str).collect();
    // pathspec 付きの add は削除も記録する（git 2.0 以降は -A 相当）。
    let mut stage: Vec<&str> = vec!["add", "--"];
    stage.extend(&specs);
    run_git_result(root, &stage)?;

    let mut commit: Vec<&str> = vec!["commit", "-m", message, "--"];
    commit.extend(&specs);
    run_git_result(root, &commit)?;
    Ok(git_status_impl(root))
}

/// フロントから `invoke("git_commit", { root, message, paths })` で呼ぶラッパ。
/// `paths` 省略は「全変更」（従来どおり）。
#[tauri::command]
pub async fn git_commit(
    root: String,
    message: String,
    paths: Option<Vec<String>>,
) -> Result<GitStatus, String> {
    let paths = paths.unwrap_or_default();
    spawn_git(move || git_commit_impl(Path::new(&root), &message, &paths)).await
}

/// upstream へ push する。成功時は最新の GitStatus（ahead が解消される）を返す。
/// `--force` は使わない = 非 fast-forward は失敗させ、リモート履歴を上書きしない（安全側）。
/// 認証は OS の git 資格情報ヘルパ／SSH に委ねる（アプリは資格情報を一切扱わない・§15）。
/// upstream 未設定・認証失敗・非 ff 拒否は git の stderr をそのまま Err で返し、UI が提示する。
pub fn git_push_impl(root: &Path) -> Result<PushOutcome, String> {
    let has_upstream = run_git(root, &["rev-parse", "--abbrev-ref", "@{u}"]).is_some();
    let branch = git_status_impl(root).branch;
    let plan = push_plan(has_upstream, branch.as_deref(), &git_remotes_impl(root))?;
    let args: Vec<&str> = plan.iter().map(String::as_str).collect();
    let (stdout, stderr) = run_git_captured(root, &args)?;
    Ok(PushOutcome {
        status: git_status_impl(root),
        url: extract_forge_url(&format!("{stdout}
{stderr}")),
    })
}

/// git 自身の出力から、置き先が案内してきた URL を 1 つ取り出す（Tauri 非依存の純関数）。
///
/// 新しいブランチを送ると、多くの置き先が「続きはここで」という URL を出力へ載せてくる。
/// それを拾って開く導線にするだけで、URL をこちらで組み立てない（置き先ごとにパスの形が
/// 違い、当て推量で作ると開いた先が無い）。出力は git のものだが、ブラウザへ渡す前に
/// 次を満たすものだけ通す: `https://` で始まる / ホストがある / 資格情報を含まない / 長すぎない。
/// `http://` を通さないのは、盗み見られる経路をアプリの導線として出さないため。
pub fn extract_forge_url(output: &str) -> Option<String> {
    /// 案内 URL としては十分な長さ。これを超えるものは案内ではないとみなす。
    const MAX_LEN: usize = 500;
    for token in output.split_whitespace() {
        let url = token
            .trim_start_matches(['(', '[', '{', '<', '"', '（'])
            .trim_end_matches([')', ']', '}', '>', '"', '.', ',', ';', ':', '）', '。', '、']);
        if !url.starts_with("https://") || url.len() > MAX_LEN {
            continue;
        }
        if url.chars().any(char::is_control) {
            continue;
        }
        let authority = url["https://".len()..].split('/').next().unwrap_or("");
        // 資格情報つき（user:token@host）は開かない。URL は履歴にも残る。
        if authority.is_empty() || authority.contains('@') {
            continue;
        }
        return Some(url.to_string());
    }
    None
}

/// push に渡す引数を決める（Tauri 非依存の純関数）。
///
/// upstream があるならそれに従う（`git push`）。無いときだけ送り先を決める必要があり、
/// ここでアプリが勝手に決めてよいのは「迷いようがない場合」だけ:
/// `origin` があれば `origin`、無くてもリモートが 1 つならそれ。
/// 複数あって `origin` が無ければ断る（取り違えると、意図しない置き先へ中身が出る）。
/// detached HEAD は、どのブランチとして出すかが定まらないので断る。
/// ブランチ名は引数へ入れず `HEAD` で渡す（名前の中身を git の引数に混ぜない）。
pub fn push_plan(
    has_upstream: bool,
    branch: Option<&str>,
    remotes: &[String],
) -> Result<Vec<String>, String> {
    if has_upstream {
        return Ok(vec!["push".to_string()]);
    }
    if branch.is_none() {
        return Err(
            "いまブランチの上にいません。ブランチへ切り替えてから送ってください".to_string(),
        );
    }
    let remote = if remotes.iter().any(|r| r == "origin") {
        "origin"
    } else if remotes.len() == 1 {
        remotes[0].as_str()
    } else if remotes.is_empty() {
        return Err("送り先（リモート）が設定されていません".to_string());
    } else {
        return Err(format!(
            "送り先が複数あります（{}）。どれへ出すかを git remote で決めてください",
            remotes.join(" / ")
        ));
    };
    Ok(vec![
        "push".to_string(),
        "-u".to_string(),
        remote.to_string(),
        "HEAD".to_string(),
    ])
}

/// フロントから `invoke("git_push", { root })` で呼ぶラッパ。
#[tauri::command]
pub async fn git_push(root: String) -> Result<PushOutcome, String> {
    spawn_git(move || git_push_impl(Path::new(&root))).await
}

/// upstream から pull する。成功時は最新の GitStatus（behind が解消される）を返す。
/// `--ff-only` = fast-forward できるときだけ取り込む。履歴が分岐しているときは
/// マージコミットも rebase も作らずに失敗させ、作業ツリーを勝手に触らない（git_switch と同じ安全側）。
/// 分岐時は git の stderr（手動で解決するよう促す）をそのまま Err で返す。
pub fn git_pull_impl(root: &Path) -> Result<GitStatus, String> {
    run_git_result(root, &["pull", "--ff-only"])?;
    Ok(git_status_impl(root))
}

/// フロントから `invoke("git_pull", { root })` で呼ぶラッパ。
#[tauri::command]
pub async fn git_pull(root: String) -> Result<GitStatus, String> {
    spawn_git(move || git_pull_impl(Path::new(&root))).await
}

/// 未追跡ファイルの内容から「全行追加」の合成 unified diff を作る（Tauri 非依存の純関数）。
/// 未追跡ファイルは HEAD に存在せず `git diff` が空を返すため、GitHub 同様に新規全行を
/// `+` 行として見せる。ヘッダは自前形式（`new file: <path>`）で、フロントの parseUnifiedDiff が
/// meta / hunk / add に分類できる並びにする。末尾改行の有無で "No newline" マーカーを付ける。
pub fn build_untracked_diff(rel_path: &str, content: &str) -> String {
    let mut lines: Vec<&str> = Vec::new();
    let mut trailing_nl = false;
    if !content.is_empty() {
        lines = content.split('\n').collect();
        // 末尾改行由来の最終空要素だけを 1 つ落とし、「末尾改行あり」と記録する。
        if lines.last() == Some(&"") {
            lines.pop();
            trailing_nl = true;
        }
    }
    let n = lines.len();
    let mut out = String::new();
    out.push_str(&format!("new file: {rel_path}\n"));
    out.push_str(&format!("@@ -0,0 +{},{} @@\n", if n == 0 { 0 } else { 1 }, n));
    for line in &lines {
        out.push('+');
        out.push_str(line);
        out.push('\n');
    }
    // 末尾改行が無い実ファイルは git と同じく No newline マーカーを添える。
    if !trailing_nl && n > 0 {
        out.push_str("\\ No newline at end of file\n");
    }
    out
}

/// 1 ファイルの「HEAD からの変更」を unified diff テキストで返す（Tauri 非依存の実体）。
///
/// - `rel_path` は **リポジトリ root 基準**（git status が返すパスと同じ）。
/// - 追跡済みの変更は `git diff HEAD -- <path>`（ステージ済み + 未ステージの合算）。
///   HEAD が無い（コミット皆無の）リポジトリでは `git diff -- <path>` へフォールバック。
/// - 差分が空で、かつ未追跡（ls-files に無い）なら、ファイル内容から全行追加を合成する。
/// - 追跡済みで差分が無い（保存前 = ディスク未変更）ときは空文字列を返す（UI が「差分なし」表示）。
///
/// `git` はリポジトリ root を cwd（`-C`）にして実行するので、pathspec は root 基準でそのまま解釈される。
pub fn git_diff_impl(root: &Path, rel_path: &str) -> Result<String, String> {
    if rel_path.is_empty() || rel_path.contains('\0') {
        return Err("不正なパスです".to_string());
    }
    // 開いたフォルダがサブディレクトリでも root 基準の pathspec を使えるよう、repo root を解決する。
    // 失敗時は git の実 stderr と受領 root をそのまま見せる（generic 文言だと原因診断できないため）。
    let toplevel = run_git_result(root, &["rev-parse", "--show-toplevel"])
        .map(|s| s.trim().to_string())
        .map_err(|e| format!("git リポジトリを解決できません（root={}）: {e}", root.display()))?;
    if toplevel.is_empty() {
        return Err(format!("git リポジトリではありません（root={}）", root.display()));
    }
    let repo_root = Path::new(&toplevel);

    // 追跡済みの変更（HEAD 比・ステージ有無を問わず合算）。HEAD 無しは通常 diff へ退避。
    let tracked = run_git(repo_root, &["diff", "HEAD", "--", rel_path])
        .filter(|s| !s.is_empty())
        .or_else(|| run_git(repo_root, &["diff", "--", rel_path]).filter(|s| !s.is_empty()));
    if let Some(diff) = tracked {
        return Ok(diff);
    }

    // 差分が空。追跡済みなら「変更なし」（空文字列）。未追跡ならファイル内容を全行追加で合成。
    let is_tracked = run_git(repo_root, &["ls-files", "--error-unmatch", "--", rel_path]).is_some();
    if is_tracked {
        return Ok(String::new());
    }
    read_untracked_diff(repo_root, rel_path)
}

/// 未追跡ファイルを repo root 配下で安全に読み、合成 diff を返す。
/// canonicalize 後に root 配下判定でパストラバーサルを封じる（read_document_impl と同流儀）。
/// 非 UTF-8（バイナリ）は内容を出さず、その旨の 1 行 meta を返す。
fn read_untracked_diff(repo_root: &Path, rel_path: &str) -> Result<String, String> {
    let canon_root = std::fs::canonicalize(repo_root).map_err(|e| format!("ルート解決失敗: {e}"))?;
    let canon = std::fs::canonicalize(repo_root.join(rel_path))
        .map_err(|e| format!("ファイル解決失敗: {e}"))?;
    if !canon.starts_with(&canon_root) {
        return Err("ルート外へのアクセスは拒否されます".to_string());
    }
    let bytes = std::fs::read(&canon).map_err(|e| format!("読み取り失敗: {e}"))?;
    match String::from_utf8(bytes) {
        Ok(content) => Ok(build_untracked_diff(rel_path, &content)),
        Err(_) => Ok(format!("new file: {rel_path}\n(バイナリファイルのため差分は表示できません)\n")),
    }
}

/// フロントから `invoke("git_diff", { root, relPath })` で呼ぶラッパ。
/// 成功で unified diff テキスト（空文字列 = 差分なし）、非リポジトリ・不正パスは Err(メッセージ)。
#[tauri::command]
pub async fn git_diff(root: String, rel_path: String) -> Result<String, String> {
    spawn_git(move || git_diff_impl(Path::new(&root), &rel_path)).await
}

/// 1 ファイルの行別の履歴を `git blame --line-porcelain` のまま返す（Tauri 非依存の実体）。
///
/// 出力の解釈はフロント側（rowBlame.ts）が持つ。ここで構造体へ畳まないのは、
/// 行を検証シートの行 ID へ結び付ける処理がフロントにあり、途中で形を変えても
/// 通過するだけになるため。
///
/// 未追跡・コミット皆無・git 未導入は「履歴がまだ無い」だけなので、空文字列へ
/// 無害に劣化させる（UI は履歴を出さない）。
///
/// `rel_path` は **開いているフォルダ基準**（git status が返す repo root 基準ではない）。
/// git は cwd 基準で pathspec を解釈するので、フォルダがリポジトリのサブディレクトリでも
/// そのまま渡せる。
pub fn git_blame_impl(root: &Path, rel_path: &str) -> Result<String, String> {
    if rel_path.is_empty() || rel_path.contains('\0') {
        return Err("不正なパスです".to_string());
    }
    let toplevel = run_git_result(root, &["rev-parse", "--show-toplevel"])
        .map(|s| s.trim().to_string())
        .map_err(|e| format!("git リポジトリを解決できません（root={}）: {e}", root.display()))?;
    if toplevel.is_empty() {
        return Err(format!("git リポジトリではありません（root={}）", root.display()));
    }

    Ok(run_git(root, &["blame", "--line-porcelain", "--", rel_path]).unwrap_or_default())
}

/// フロントから `invoke("git_blame", { root, relPath })` で呼ぶラッパ。
/// 成功で porcelain テキスト（空文字列 = 履歴なし）、非リポジトリ・不正パスは Err(メッセージ)。
#[tauri::command]
pub async fn git_blame(root: String, rel_path: String) -> Result<String, String> {
    spawn_git(move || git_blame_impl(Path::new(&root), &rel_path)).await
}

/// コミット指定として受け付けてよいか。
///
/// 受けるのは **16 進のハッシュだけ**（7〜40 桁）。ブランチ名・タグ・`HEAD~2` のような
/// 相対指定は受けない。指定は履歴一覧（`git_log`）から選ばせる作りなので、ハッシュ以外を
/// 通す必要が無い。狭くしておけば `--upload-pack=...` のような引数への化けも、
/// `:` を含む別解釈も構文の時点で起こらない。
pub fn is_valid_commit_ref(commit: &str) -> bool {
    (7..=40).contains(&commit.len()) && commit.chars().all(|c| c.is_ascii_hexdigit())
}

/// `git show` へ渡す `<コミット>:<パス>` を組む。
///
/// パスの頭に `./` を付けるのは、この形が **cwd 基準**として解釈されるため。付けないと
/// リポジトリ root 基準になり、サブフォルダを開いているときだけ「その版には無い」と
/// 言われる。区切りは `/` へ寄せる（Windows の区切りのままでは git が別名として扱う）。
pub fn commit_path_spec(commit: &str, rel_path: &str) -> String {
    let slashed = rel_path.replace('\\', "/");
    format!("{commit}:./{slashed}")
}

/// 指定したコミット時点のファイル内容を返す（Tauri 非依存の実体）。
///
/// `Ok(None)` は「その版にこのファイルが無い」。空文字列（中身が空）と区別する。
/// 版間の差分では、比べる相手が無いのか空なのかで見せ方が変わる。
///
/// `rel_path` は **開いているフォルダ基準**（`git_blame` と同じ）。
pub fn git_show_impl(root: &Path, rel_path: &str, commit: &str) -> Result<Option<String>, String> {
    if !is_valid_commit_path(rel_path) {
        return Err(format!("履歴を見られないパスです: {rel_path}"));
    }
    if !is_valid_commit_ref(commit) {
        return Err(format!("コミットの指定が不正です: {commit}"));
    }
    let toplevel = run_git_result(root, &["rev-parse", "--show-toplevel"])
        .map(|s| s.trim().to_string())
        .map_err(|e| format!("git リポジトリを解決できません（root={}）: {e}", root.display()))?;
    if toplevel.is_empty() {
        return Err(format!("git リポジトリではありません（root={}）", root.display()));
    }

    let spec = commit_path_spec(commit, rel_path);
    Ok(run_git(root, &["show", &spec]))
}

/// フロントから `invoke("git_show", { root, relPath, commit })` で呼ぶラッパ。
/// 成功で内容、その版にファイルが無ければ null、不正なパス・コミットは Err(メッセージ)。
#[tauri::command]
pub async fn git_show(
    root: String,
    rel_path: String,
    commit: String,
) -> Result<Option<String>, String> {
    spawn_git(move || git_show_impl(Path::new(&root), &rel_path, &commit)).await
}

/// コミット 1 件分の見出し。中身の差分は `git_diff` 側で見る。
#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitLogEntry {
    /// 完全なコミットハッシュ（短縮は表示側で行う）。
    pub hash: String,
    pub author: String,
    /// 著者の日時（ISO 8601・オフセット付き）。並べ替えと表示は受け取った側が決める。
    pub date: String,
    /// コミットメッセージの 1 行目。
    pub subject: String,
}

/// 1 件を 4 つの欄に分け、件ごとに区切る書式。
/// 区切りに制御文字を使うのは、コミットメッセージに現れないため
/// （タブや `|` を使うと件名に混ざった瞬間に欄がずれる）。
const LOG_FORMAT: &str = "--pretty=format:%H\u{1f}%an\u{1f}%aI\u{1f}%s\u{1e}";

/// 既定の取得件数と上限。
///
/// 期間ではなく件数で切る。期間で切ると、動きの少ないリポジトリでは
/// 履歴があるのに何も出ない（無いのか出していないのかが利用者に分からない）。
const LOG_LIMIT_DEFAULT: u32 = 50;
const LOG_LIMIT_MAX: u32 = 200;

/// 要求された取得件数を実際に使う値へ丸める。
fn clamp_log_limit(limit: Option<u32>) -> u32 {
    limit.unwrap_or(LOG_LIMIT_DEFAULT).clamp(1, LOG_LIMIT_MAX)
}

/// `git log` の出力（LOG_FORMAT）をコミット一覧へ。
///
/// 欄が 4 つ揃っていない記録は捨てる。件名に区切り文字が混ざっても
/// 4 つ目以降は分けないので、見出しが黙って短くなることはない。
fn parse_log(stdout: &str) -> Vec<GitLogEntry> {
    stdout
        .split('\u{1e}')
        .filter_map(|record| {
            // 記録の間に改行が入る書式なので、次の記録の頭から落とす。
            let record = record.trim_start_matches(['\n', '\r']);
            if record.is_empty() {
                return None;
            }
            let mut parts = record.splitn(4, '\u{1f}');
            Some(GitLogEntry {
                hash: parts.next()?.to_string(),
                author: parts.next()?.to_string(),
                date: parts.next()?.to_string(),
                subject: parts.next()?.to_string(),
            })
        })
        .collect()
}

/// コミット履歴を新しい順に返す（Tauri 非依存の実体）。
///
/// `rel_path` を渡すとそのファイルに触れたコミットだけに絞る。
/// コミットが 1 つも無いリポジトリでは `git log` が失敗するが、それは
/// 「まだ無い」だけなので空の一覧へ無害に劣化させる（非リポジトリだけを Err にする）。
pub fn git_log_impl(
    root: &Path,
    rel_path: Option<&str>,
    limit: Option<u32>,
) -> Result<Vec<GitLogEntry>, String> {
    if let Some(path) = rel_path {
        if !is_valid_commit_path(path) {
            return Err(format!("履歴を見られないパスです: {path}"));
        }
    }
    let toplevel = run_git_result(root, &["rev-parse", "--show-toplevel"])
        .map(|s| s.trim().to_string())
        .map_err(|e| format!("git リポジトリを解決できません（root={}）: {e}", root.display()))?;
    if toplevel.is_empty() {
        return Err(format!("git リポジトリではありません（root={}）", root.display()));
    }

    let max_count = clamp_log_limit(limit).to_string();
    let mut args = vec!["log", "--max-count", max_count.as_str(), LOG_FORMAT];
    // pathspec は `--` の後ろに置く（先頭 '-' の名前でもオプションに化けない）。
    if let Some(path) = rel_path {
        args.push("--");
        args.push(path);
    }

    Ok(parse_log(&run_git(root, &args).unwrap_or_default()))
}

/// フロントから `invoke("git_log", { root, relPath, limit })` で呼ぶラッパ。
/// `relPath` 省略でリポジトリ全体、`limit` 省略で既定件数。
#[tauri::command]
pub async fn git_log(
    root: String,
    rel_path: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<GitLogEntry>, String> {
    spawn_git(move || git_log_impl(Path::new(&root), rel_path.as_deref(), limit)).await
}

/// 既定ブランチ名の設定が無いときに使う名前。
///
/// git 自身の既定は `master` だが、置き先（GitHub 等）の既定は `main` で、
/// 食い違ったまま最初の push をすると、同じ中身のブランチが 2 つ並ぶ。
const INIT_DEFAULT_BRANCH: &str = "main";

/// `git init` に渡す引数を決める。
///
/// 利用者が `init.defaultBranch` を設定しているならそれに従う（設定を上書きしない）。
/// 設定が無いときだけ既定を明示する。
fn init_args(configured_default: Option<&str>) -> Vec<&'static str> {
    match configured_default {
        Some(name) if !name.trim().is_empty() => vec!["init"],
        _ => vec!["init", "-b", INIT_DEFAULT_BRANCH],
    }
}

/// フォルダを Git リポジトリにする（Tauri 非依存の実体）。成功時は最新の GitStatus。
///
/// リモートは設定しない。作るのは手元の履歴だけで、どこへ出すかは別の操作にする。
pub fn git_init_impl(root: &Path) -> Result<GitStatus, String> {
    if !root.is_dir() {
        return Err(format!("フォルダがありません: {}", root.display()));
    }
    // `git init` は既にリポジトリでも成功する。ここで断らないと「押しても何も
    // 起きないボタン」になり、利用者からは失敗と区別が付かない。
    // 既存リポジトリのサブフォルダを開いている場合もここで止まる（既に管理下なので正しい）。
    if run_git(root, &["rev-parse", "--git-dir"]).is_some() {
        return Err("このフォルダは既に Git で管理されています".to_string());
    }

    let configured = run_git(root, &["config", "--get", "init.defaultBranch"])
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    run_git_result(root, &init_args(configured.as_deref()))?;
    Ok(git_status_impl(root))
}

/// フロントから `invoke("git_init", { root })` で呼ぶラッパ。
/// 成功で最新ステータス、失敗（既にリポジトリ・フォルダ無し・git 未導入）は Err(メッセージ)。
#[tauri::command]
pub async fn git_init(root: String) -> Result<GitStatus, String> {
    spawn_git(move || git_init_impl(Path::new(&root))).await
}

/// 受け付ける複製元の説明。断るときは必ずこれを添える（何を書けばよいかが分からないと直せない）。
const CLONE_URL_HELP: &str =
    "複製元は https:// / ssh:// / git@ホスト:パス / 手元のフォルダのみ受け付けます";

/// 手元のフォルダを指しているか（ドライブ・共有フォルダ・絶対パス）。
/// 空白を含みうるので、URL としての検査より先に通す。
fn is_local_repo_path(s: &str) -> bool {
    let bytes = s.as_bytes();
    // \server\share, //server/share
    if s.starts_with("\\\\") || s.starts_with("//") {
        return true;
    }
    // C:\... / C:/...
    if bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && (bytes[2] == b'\\' || bytes[2] == b'/')
    {
        return true;
    }
    s.starts_with('/') || s.starts_with('\\')
}

/// `https://…` の `https` を取り出す。`://` を持たない指定（scp 形式・`ext::…`）は None。
fn scheme_of(s: &str) -> Option<&str> {
    let at = s.find("://")?;
    let scheme = &s[..at];
    if scheme.is_empty()
        || !scheme
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '+' || c == '-' || c == '.')
    {
        return None;
    }
    Some(scheme)
}

/// scp 形式（`[利用者@]ホスト:パス`）か。
/// `ext::…`（任意コマンドを走らせる指定）はコロンが 2 つ続くのでここで落ちる。
fn is_scp_like(s: &str) -> bool {
    let Some(at) = s.find(':') else { return false };
    let (host, rest) = (&s[..at], &s[at + 1..]);
    !host.is_empty() && !host.contains('/') && !rest.is_empty() && !rest.starts_with(':')
}

/// URL に資格情報が埋まっていないか。
///
/// 埋まったまま clone すると `remote.origin.url` へ平文で残り、以後の push / pull の
/// 失敗メッセージにも出る。ファイルにも画面にも出るので、後から消し切れない。
///
/// `https` は利用者名だけでもトークンの置き場として使われるので丸ごと断る。
/// `ssh` の `git@ホスト` と scp 形式の利用者名は転送先の利用者名であって秘密ではないので通し、
/// パスワードを伴う形（`利用者:秘密@ホスト`）だけを断る。
fn check_no_credentials(url: &str, authority: &str, deny_user_only: bool) -> Result<(), String> {
    let Some(at) = authority.rfind('@') else {
        return Ok(());
    };
    let userinfo = &authority[..at];
    if deny_user_only || userinfo.contains(':') {
        return Err(format!(
            "複製元に資格情報を含めないでください（{}）。認証は OS に預けた資格情報が答えます",
            mask_userinfo(url)
        ));
    }
    Ok(())
}

/// 失敗メッセージへ載せる前に、資格情報の部分を伏せる。
/// 断った理由を示すのに中身は要らない（画面にもログにも残るため）。
fn mask_userinfo(url: &str) -> String {
    match url.find('@') {
        Some(at) => format!("***{}", &url[at..]),
        None => url.to_string(),
    }
}

/// 複製元として受け付けてよいか。git を呼ぶ前に断る（通信も認証も始めさせない）。
pub fn check_clone_url(url: &str) -> Result<(), String> {
    let url = url.trim();
    if url.is_empty() {
        return Err("複製元を入れてください".to_string());
    }
    if url.chars().any(char::is_control) {
        return Err("複製元に使えない文字が入っています".to_string());
    }
    // 先頭 '-' は git にオプションとして解釈されうる（`--upload-pack=…` は任意コマンドの実行）。
    if url.starts_with('-') {
        return Err(CLONE_URL_HELP.to_string());
    }
    if is_local_repo_path(url) {
        return Ok(());
    }
    if url.chars().any(char::is_whitespace) {
        return Err("複製元に空白が入っています".to_string());
    }

    match scheme_of(url) {
        Some("https") => check_no_credentials(url, authority_of(url), true),
        Some("ssh") | Some("file") => check_no_credentials(url, authority_of(url), false),
        // 平文で流れる経路は受け付けない。資格情報がそのまま経路上へ出る。
        Some("http") => {
            Err("暗号化されない http:// は受け付けません。https:// を使ってください".to_string())
        }
        Some(_) => Err(CLONE_URL_HELP.to_string()),
        None if is_scp_like(url) => {
            // scp 形式は最初の '/' までが `[利用者@]ホスト:` の側。
            // 最初の ':' で切ると `利用者:秘密@ホスト` の秘密がパス側へ逃げる。
            check_no_credentials(url, url.split('/').next().unwrap_or(""), false)
        }
        None => Err(CLONE_URL_HELP.to_string()),
    }
}

/// `scheme://ここ/…` を取り出す。scheme が無い形では使わない。
fn authority_of(url: &str) -> &str {
    let rest = match url.find("://") {
        Some(at) => &url[at + 3..],
        None => url,
    };
    match rest.find('/') {
        Some(at) => &rest[..at],
        None => rest,
    }
}

/// `git clone` に渡す引数。`--` を挟んで URL をオプションとして解釈させない。
/// 複製先は開いているフォルダそのもの（`.`）。
fn clone_args(url: &str) -> Vec<&str> {
    vec!["clone", "--", url, "."]
}

/// 開いているフォルダへリポジトリを複製する（Tauri 非依存の実体）。成功時は最新の GitStatus。
///
/// 資格情報はアプリでは預からない。OS の credential helper / SSH 鍵が答える経路だけを使い、
/// 答えられないときは（端末プロンプトを止めてあるので）待たずに失敗する。
pub fn git_clone_impl(dest: &Path, url: &str) -> Result<GitStatus, String> {
    let url = url.trim();
    check_clone_url(url)?;
    if !dest.is_dir() {
        return Err(format!("フォルダがありません: {}", dest.display()));
    }
    // 空でないフォルダへ複製すると、既にある物と混ざるのか失敗するのかが利用者から読めない。
    let mut entries =
        std::fs::read_dir(dest).map_err(|e| format!("フォルダを読めません: {e}"))?;
    if entries.next().is_some() {
        return Err(
            "このフォルダは空ではありません。空のフォルダを開いてから複製してください".to_string(),
        );
    }

    run_git_result(dest, &clone_args(url))?;
    Ok(git_status_impl(dest))
}

/// フロントから `invoke("git_clone", { root, url })` で呼ぶラッパ。
/// 成功で最新ステータス、失敗（受け付けない複製元・空でないフォルダ・認証・git 未導入）は Err。
#[tauri::command]
pub async fn git_clone(root: String, url: String) -> Result<GitStatus, String> {
    spawn_git(move || git_clone_impl(Path::new(&root), &url)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    /// テスト用に LF 区切りの porcelain を NUL 区切りへ変換する（-z 出力の模擬）。
    /// リネームの origPath は明示的に "\0" を書くのでそのまま活かす。
    fn nul(s: &str) -> String {
        s.replace('\n', "\0")
    }

    #[test]
    fn ブランチ名を取り出す() {
        let out = nul("# branch.oid abc123\n# branch.head main\n# branch.upstream origin/main\n# branch.ab +0 -0\n");
        let st = parse_status_porcelain_v2(&out, None);
        assert!(st.is_repo);
        assert_eq!(st.branch.as_deref(), Some("main"));
    }

    #[test]
    fn detached_head_はブランチ_none() {
        let out = nul("# branch.head (detached)\n# branch.ab +0 -0\n");
        let st = parse_status_porcelain_v2(&out, None);
        assert_eq!(st.branch, None);
    }

    #[test]
    fn ahead_behind_を数値化する() {
        let out = nul("# branch.head main\n# branch.ab +3 -2\n");
        let st = parse_status_porcelain_v2(&out, None);
        assert_eq!(st.ahead, 3);
        assert_eq!(st.behind, 2);
    }

    #[test]
    fn 未追跡ファイルを収集する() {
        let out = nul("# branch.head main\n? .tmp/\n? notes.md\n");
        let st = parse_status_porcelain_v2(&out, None);
        let untracked: Vec<_> = st
            .files
            .iter()
            .filter(|f| f.state == "untracked")
            .map(|f| f.rel_path.clone())
            .collect();
        assert_eq!(untracked, vec![".tmp/", "notes.md"]);
    }

    #[test]
    fn 変更ファイルはmodified_パスにスペースを含んでも取れる() {
        // "1 .M N... path with space.md"
        let out = nul("# branch.head main\n1 .M N... 100644 100644 100644 aaa bbb docs/a b.md\n");
        let st = parse_status_porcelain_v2(&out, None);
        assert_eq!(st.files.len(), 1);
        assert_eq!(st.files[0].rel_path, "docs/a b.md");
        assert_eq!(st.files[0].state, "modified");
    }

    #[test]
    fn 追加ステージはadded() {
        let out = nul("# branch.head main\n1 A. N... 000000 100644 100644 000 ccc new.md\n");
        let st = parse_status_porcelain_v2(&out, None);
        assert_eq!(st.files[0].state, "added");
    }

    #[test]
    fn 削除はdeleted() {
        let out = nul("# branch.head main\n1 .D N... 100644 100644 000000 ddd 000 gone.md\n");
        let st = parse_status_porcelain_v2(&out, None);
        assert_eq!(st.files[0].state, "deleted");
    }

    #[test]
    fn リネームはrenamed_で_origpathフィールドを読み飛ばす() {
        // type 2 エントリの後に origPath が別 NUL フィールドで続く。
        // 続けて別の通常変更が来ても、origPath を誤って解釈しないことを確認。
        let out = nul(
            "# branch.head main\n2 R. N... 100644 100644 100644 eee fff R100 new-name.md\nold-name.md\n1 .M N... 100644 100644 100644 aaa bbb other.md\n",
        );
        let st = parse_status_porcelain_v2(&out, None);
        assert_eq!(st.files.len(), 2, "リネーム 1 + 変更 1（origPath は数えない）");
        assert_eq!(st.files[0].rel_path, "new-name.md");
        assert_eq!(st.files[0].state, "renamed");
        assert_eq!(st.files[1].rel_path, "other.md");
        assert_eq!(st.files[1].state, "modified");
    }

    #[test]
    fn 未マージはconflicted() {
        let out = nul("# branch.head main\nu UU N... 100644 100644 100644 100644 aaa bbb ccc conflict.md\n");
        let st = parse_status_porcelain_v2(&out, None);
        assert_eq!(st.files.len(), 1);
        assert_eq!(st.files[0].state, "conflicted");
        assert_eq!(st.files[0].rel_path, "conflict.md");
    }

    #[test]
    fn 無視ファイルは表示しない() {
        let out = nul("# branch.head main\n! ignored.md\n? real.md\n");
        let st = parse_status_porcelain_v2(&out, None);
        assert_eq!(st.files.len(), 1);
        assert_eq!(st.files[0].rel_path, "real.md");
    }

    #[test]
    fn forge_はそのまま格納される() {
        let out = nul("# branch.head main\n");
        let st = parse_status_porcelain_v2(&out, Some("github".to_string()));
        assert_eq!(st.forge.as_deref(), Some("github"));
    }

    // ── detect_forge ─────────────────────────────────────────────────────

    #[test]
    fn detect_forge_github_https_ssh() {
        assert_eq!(
            detect_forge(Some("https://github.com/meta-taro/md-business.git")).as_deref(),
            Some("github")
        );
        assert_eq!(
            detect_forge(Some("git@github.com:meta-taro/md-business.git")).as_deref(),
            Some("github")
        );
    }

    #[test]
    fn detect_forge_gitlab_bitbucket() {
        assert_eq!(
            detect_forge(Some("https://gitlab.com/g/p.git")).as_deref(),
            Some("gitlab")
        );
        assert_eq!(
            detect_forge(Some("git@bitbucket.org:t/r.git")).as_deref(),
            Some("bitbucket")
        );
    }

    #[test]
    fn repo_name_はホストと所有者と名前を並べる() {
        assert_eq!(
            repo_name(Some("https://github.com/o/r.git")).as_deref(),
            Some("github.com/o/r")
        );
        assert_eq!(
            repo_name(Some("git@github.com:o/r.git")).as_deref(),
            Some("github.com/o/r")
        );
        assert_eq!(
            repo_name(Some("ssh://git@gitlab.example.jp/group/sub/r.git")).as_deref(),
            Some("gitlab.example.jp/group/sub/r")
        );
    }

    #[test]
    fn repo_name_は判定できないものをnoneにする() {
        assert_eq!(repo_name(None), None);
        assert_eq!(repo_name(Some("")), None);
        assert_eq!(repo_name(Some("/srv/git/r.git")), None);
    }

    #[test]
    fn detect_forge_未知はother_空はnone() {
        assert_eq!(
            detect_forge(Some("https://git.example.com/x.git")).as_deref(),
            Some("other")
        );
        assert_eq!(detect_forge(Some("   ")), None);
        assert_eq!(detect_forge(None), None);
    }

    // ── build_forge_file_url ─────────────────────────────────────────────

    #[test]
    fn forge_url_github_https_ssh_は同じ_blob_url() {
        let want = "https://github.com/meta-taro/md-business/blob/main/docs/a.md";
        assert_eq!(
            build_forge_file_url(
                Some("https://github.com/meta-taro/md-business.git"),
                "main",
                "docs/a.md"
            )
            .as_deref(),
            Some(want)
        );
        assert_eq!(
            build_forge_file_url(
                Some("git@github.com:meta-taro/md-business.git"),
                "main",
                "docs/a.md"
            )
            .as_deref(),
            Some(want)
        );
    }

    #[test]
    fn forge_url_gitlab_は_blob_bitbucket_は_src() {
        assert_eq!(
            build_forge_file_url(Some("https://gitlab.com/g/p.git"), "dev", "x.tsv").as_deref(),
            Some("https://gitlab.com/g/p/blob/dev/x.tsv")
        );
        assert_eq!(
            build_forge_file_url(Some("git@bitbucket.org:t/r.git"), "main", "y.md").as_deref(),
            Some("https://bitbucket.org/t/r/src/main/y.md")
        );
    }

    #[test]
    fn forge_url_relパスの区切りと先頭スラッシュを正規化() {
        assert_eq!(
            build_forge_file_url(
                Some("https://github.com/o/r"),
                "main",
                "\\sub\\file.md"
            )
            .as_deref(),
            Some("https://github.com/o/r/blob/main/sub/file.md")
        );
    }

    #[test]
    fn forge_url_未知フォージや空入力は_none() {
        // 未知フォージ（other）は URL を作らない。
        assert_eq!(
            build_forge_file_url(Some("https://git.example.com/x.git"), "main", "a.md"),
            None
        );
        // remote 無し・ブランチ空・パス空は None。
        assert_eq!(build_forge_file_url(None, "main", "a.md"), None);
        assert_eq!(
            build_forge_file_url(Some("https://github.com/o/r"), "", "a.md"),
            None
        );
        assert_eq!(
            build_forge_file_url(Some("https://github.com/o/r"), "main", "   "),
            None
        );
    }

    // ── normalize_prefix ─────────────────────────────────────────────────

    #[test]
    fn prefix_末尾改行を除き_スラッシュ終端を保証() {
        assert_eq!(normalize_prefix("apps/desktop/\n"), "apps/desktop/");
        assert_eq!(normalize_prefix("apps/desktop"), "apps/desktop/");
        assert_eq!(normalize_prefix("apps\\desktop\\"), "apps/desktop/");
    }

    #[test]
    fn prefix_repo_root_は空() {
        assert_eq!(normalize_prefix(""), "");
        assert_eq!(normalize_prefix("\n"), "");
    }

    // ── git_status_impl（graceful 劣化）─────────────────────────────────────

    #[test]
    fn git_status_非リポジトリはis_repo偽で空() {
        // git 管理外の temp ディレクトリ。git 未導入でも非 0 終了でも not_a_repo になる。
        use std::sync::atomic::{AtomicU32, Ordering};
        static N: AtomicU32 = AtomicU32::new(0);
        let n = N.fetch_add(1, Ordering::SeqCst);
        let dir =
            std::env::temp_dir().join(format!("mdbiz_gitnone_{}_{}", std::process::id(), n));
        std::fs::create_dir_all(&dir).expect("temp 作成");
        let st = git_status_impl(&dir);
        let _ = std::fs::remove_dir_all(&dir);
        assert!(!st.is_repo);
        assert_eq!(st.branch, None);
        assert!(st.files.is_empty());
    }

    // ── parse_branches ───────────────────────────────────────────────────

    #[test]
    fn branches_一覧をパースし空行と前後空白を除く() {
        let out = "main\nfeature/x\n\n  develop  \n";
        assert_eq!(parse_branches(out), vec!["main", "feature/x", "develop"]);
    }

    #[test]
    fn branches_空出力は空一覧() {
        assert!(parse_branches("").is_empty());
        assert!(parse_branches("\n \n").is_empty());
    }

    // ── is_safe_branch_name（引数注入防御）────────────────────────────────

    #[test]
    fn 安全なブランチ名のみ受理する() {
        assert!(is_safe_branch_name("main"));
        assert!(is_safe_branch_name("feature/x-1"));
        assert!(!is_safe_branch_name(""), "空は拒否");
        assert!(!is_safe_branch_name("-f"), "先頭ダッシュ=オプション注入を拒否");
        assert!(!is_safe_branch_name("a b"), "空白を含むものを拒否");
        assert!(!is_safe_branch_name("a\0b"), "NUL を拒否");
    }

    #[test]
    fn git_switch_不正名は_git実行前にエラー() {
        // 不正名はバリデーションで弾き、git を起動しない（副作用なし）。
        let dir = std::env::temp_dir();
        assert!(git_switch_impl(&dir, "-f").is_err());
        assert!(git_switch_impl(&dir, "").is_err());
    }

    // ── is_valid_commit_message（空コミット防止）──────────────────────────

    #[test]
    fn 非空のコミットメッセージのみ受理する() {
        assert!(is_valid_commit_message("修正: バグを直した"));
        assert!(is_valid_commit_message("-m から始まっても本文なら可"));
        assert!(!is_valid_commit_message(""), "空は拒否");
        assert!(!is_valid_commit_message("   "), "空白のみは拒否");
        assert!(!is_valid_commit_message("\n\t "), "改行・タブのみは拒否");
    }

    #[test]
    fn git_commit_空メッセージは_git実行前にエラー() {
        // 空メッセージはバリデーションで弾き、git を起動しない（空コミットを作らない）。
        let dir = std::env::temp_dir();
        assert!(git_commit_impl(&dir, "", &[]).is_err());
        assert!(git_commit_impl(&dir, "   ", &[]).is_err());
    }

    // ── build_untracked_diff（未追跡ファイルの合成 diff）──────────────────────

    #[test]
    fn untracked_diff_複数行を全て追加行にする() {
        let out = build_untracked_diff("notes.md", "行1\n行2\n");
        assert_eq!(
            out,
            "new file: notes.md\n@@ -0,0 +1,2 @@\n+行1\n+行2\n",
            "末尾改行ありは No newline マーカーを付けない"
        );
    }

    #[test]
    fn untracked_diff_末尾改行なしはマーカーを付ける() {
        let out = build_untracked_diff("a.txt", "只一行");
        assert_eq!(
            out,
            "new file: a.txt\n@@ -0,0 +1,1 @@\n+只一行\n\\ No newline at end of file\n"
        );
    }

    #[test]
    fn untracked_diff_空ファイルは_0行ハンク_マーカーなし() {
        let out = build_untracked_diff("empty.md", "");
        assert_eq!(out, "new file: empty.md\n@@ -0,0 +0,0 @@\n");
    }

    #[test]
    fn untracked_diff_中間の空行も追加行として保持する() {
        let out = build_untracked_diff("g.md", "x\n\ny\n");
        assert_eq!(out, "new file: g.md\n@@ -0,0 +1,3 @@\n+x\n+\n+y\n");
    }

    // ── git_diff_impl（事前バリデーション / 非リポジトリ）─────────────────────

    #[test]
    fn git_diff_不正パスは_git実行前にエラー() {
        // 空・NUL 入りはバリデーションで弾き、git を起動しない。
        let dir = std::env::temp_dir();
        assert!(git_diff_impl(&dir, "").is_err());
        assert!(git_diff_impl(&dir, "a\0b").is_err());
    }

    #[test]
    fn git_diff_非リポジトリはエラー() {
        // git 管理外の temp ディレクトリ。rev-parse が失敗し Err になる。
        use std::sync::atomic::{AtomicU32, Ordering};
        static N: AtomicU32 = AtomicU32::new(0);
        let n = N.fetch_add(1, Ordering::SeqCst);
        let dir =
            std::env::temp_dir().join(format!("mdbiz_gitdiffnone_{}_{}", std::process::id(), n));
        std::fs::create_dir_all(&dir).expect("temp 作成");
        let r = git_diff_impl(&dir, "notes.md");
        let _ = std::fs::remove_dir_all(&dir);
        assert!(r.is_err());
    }

    // ── parse_file_state（ファイル情報ダイアログ用の 1 ファイル状態）─────────

    #[test]
    fn ファイル状態_出力が空なら追跡済みで未変更() {
        assert_eq!(parse_file_state(""), "tracked");
    }

    #[test]
    fn ファイル状態_未追跡と除外設定を見分ける() {
        assert_eq!(parse_file_state(&nul("? notes.md\n")), "untracked");
        assert_eq!(parse_file_state(&nul("! build/out.md\n")), "ignored");
    }

    #[test]
    fn ファイル状態_変更種別はxyから決まる() {
        assert_eq!(
            parse_file_state(&nul("1 .M N... 100644 100644 100644 aaa bbb notes.md\n")),
            "modified"
        );
        assert_eq!(
            parse_file_state(&nul("1 A. N... 000000 100644 100644 000 ccc new.md\n")),
            "added"
        );
        assert_eq!(
            parse_file_state(&nul("1 .D N... 100644 100644 000000 aaa bbb gone.md\n")),
            "deleted"
        );
    }

    #[test]
    fn ファイル状態_リネームはrenamed() {
        let out = nul("2 R. N... 100644 100644 100644 aaa bbb R100 new.md\0old.md\n");
        assert_eq!(parse_file_state(&out), "renamed");
    }

    #[test]
    fn ファイル状態_未マージはconflicted() {
        let out = nul("u UU N... 100644 100644 100644 100644 aaa bbb ccc conflict.md\n");
        assert_eq!(parse_file_state(&out), "conflicted");
    }

    #[test]
    fn ファイル状態_非リポジトリはnotrepo() {
        // git 管理外の temp ディレクトリ。status が失敗し notRepo へ劣化する。
        use std::sync::atomic::{AtomicU32, Ordering};
        static N: AtomicU32 = AtomicU32::new(0);
        let n = N.fetch_add(1, Ordering::SeqCst);
        let dir =
            std::env::temp_dir().join(format!("mdbiz_gitfsnone_{}_{}", std::process::id(), n));
        std::fs::create_dir_all(&dir).expect("temp 作成");
        let state = git_file_state_impl(&dir, "notes.md");
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(state, "notRepo");
    }

    // ── is_valid_commit_path（コミット対象パスの受理範囲）────────────────────

    #[test]
    fn コミット対象はリポジトリ内の相対パスのみ受理する() {
        assert!(is_valid_commit_path("notes.md"));
        assert!(is_valid_commit_path("docs/test-specs/001-login.tsv"));
        assert!(is_valid_commit_path("docs\\a.md"), "Windows 区切りも可");
        assert!(is_valid_commit_path("-dash.md"), "`--` の後ろに置くので先頭ダッシュは可");
        assert!(is_valid_commit_path("日本語 の名前.md"), "空白・日本語は可");
        assert!(!is_valid_commit_path(""), "空は拒否");
        assert!(!is_valid_commit_path("   "), "空白のみは拒否");
        assert!(!is_valid_commit_path("a\0b"), "NUL を拒否");
        assert!(!is_valid_commit_path("../outside.md"), "リポジトリ外への脱出を拒否");
        assert!(!is_valid_commit_path("docs/../../x.md"), "途中の .. も拒否");
        assert!(!is_valid_commit_path("/etc/passwd"), "絶対パスを拒否");
        assert!(!is_valid_commit_path("\\\\server\\share\\a.md"), "UNC を拒否");
        assert!(!is_valid_commit_path("C:\\Windows\\a.md"), "ドライブ指定を拒否");
    }

    #[test]
    fn git_commit_不正パスは_git実行前にエラー() {
        // 不正パスはバリデーションで弾き、git を起動しない（部分ステージすら起こさない）。
        let dir = std::env::temp_dir();
        let bad = vec!["../outside.md".to_string()];
        assert!(git_commit_impl(&dir, "msg", &bad).is_err());
    }

    // ── 選択コミット（実リポジトリでの振る舞い）──────────────────────────────

    /// テスト用の一時リポジトリを作る。設定は当該リポジトリ内に閉じる（global を触らない）。
    fn temp_repo(tag: &str) -> std::path::PathBuf {
        use std::sync::atomic::{AtomicU32, Ordering};
        static N: AtomicU32 = AtomicU32::new(0);
        let n = N.fetch_add(1, Ordering::SeqCst);
        let dir =
            std::env::temp_dir().join(format!("mdbiz_{}_{}_{}", tag, std::process::id(), n));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("temp 作成");
        let git = |args: &[&str]| {
            git_command(&dir)
                .args(args)
                .output()
                .expect("git を実行できません（テストには git が要る）")
        };
        git(&["init"]);
        git(&["config", "user.email", "test@example.invalid"]);
        git(&["config", "user.name", "test"]);
        // 署名・hook は環境依存なのでこのリポジトリ内で無効化する（他人の環境設定に左右されない）。
        git(&["config", "commit.gpgsign", "false"]);
        git(&["config", "core.hooksPath", "no-such-hooks"]);
        dir
    }

    /// 追跡済みファイルの HEAD 時点の中身。無ければ None。
    /// 末尾改行は付いたまま返るので、比較する側で trim する。
    fn head_content(root: &Path, rel: &str) -> Option<String> {
        run_git(root, &["show", &format!("HEAD:{rel}")])
    }

    #[test]
    fn 選択したファイルだけがコミットに入る() {
        let dir = temp_repo("gitsel");
        std::fs::write(dir.join("wanted.md"), "入れる\n").expect("書き込み");
        std::fs::write(dir.join("unrelated.md"), "入れない\n").expect("書き込み");

        let paths = vec!["wanted.md".to_string()];
        let status = git_commit_impl(&dir, "選択コミット", &paths).expect("コミット成功");

        assert_eq!(
            head_content(&dir, "wanted.md").as_deref().map(str::trim),
            Some("入れる"),
            "選んだファイルは HEAD に入る"
        );
        assert!(
            head_content(&dir, "unrelated.md").is_none(),
            "選ばなかったファイルは HEAD に入らない"
        );
        assert!(
            status.files.iter().any(|f| f.rel_path == "unrelated.md"),
            "選ばなかったファイルは変更として残る"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn 選択コミットは先にステージ済みの別変更を巻き込まない() {
        // 利用者が CLI で別件を `git add` 済みでも、画面で選んだ分だけを記録する。
        let dir = temp_repo("gitsel2");
        std::fs::write(dir.join("wanted.md"), "入れる\n").expect("書き込み");
        std::fs::write(dir.join("staged.md"), "別件\n").expect("書き込み");
        run_git_result(&dir, &["add", "--", "staged.md"]).expect("事前ステージ");

        let paths = vec!["wanted.md".to_string()];
        git_commit_impl(&dir, "選択コミット", &paths).expect("コミット成功");

        assert!(
            head_content(&dir, "staged.md").is_none(),
            "先にステージされていた別件はコミットに入らない"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn 選択コミットは削除も記録する() {
        let dir = temp_repo("gitsel3");
        std::fs::write(dir.join("gone.md"), "消す\n").expect("書き込み");
        git_commit_impl(&dir, "初回", &[]).expect("初回コミット");
        std::fs::remove_file(dir.join("gone.md")).expect("削除");

        let paths = vec!["gone.md".to_string()];
        git_commit_impl(&dir, "削除", &paths).expect("コミット成功");

        assert!(
            head_content(&dir, "gone.md").is_none(),
            "削除が HEAD へ反映される"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn パス省略は従来どおり全変更をコミットする() {
        let dir = temp_repo("gitall");
        std::fs::write(dir.join("a.md"), "あ\n").expect("書き込み");
        std::fs::write(dir.join("b.md"), "い\n").expect("書き込み");

        git_commit_impl(&dir, "全部", &[]).expect("コミット成功");

        assert!(head_content(&dir, "a.md").is_some());
        assert!(head_content(&dir, "b.md").is_some());
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// テスト用に log 出力を組む（区切りは実装と同じ制御文字）。
    fn log_record(hash: &str, author: &str, date: &str, subject: &str) -> String {
        format!("{hash}\u{1f}{author}\u{1f}{date}\u{1f}{subject}\u{1e}\n")
    }

    #[test]
    fn log出力を1件ずつに分解する() {
        let stdout = log_record("abc123", "田中", "2026-08-15T09:00:00+09:00", "最初のコミット")
            + &log_record("def456", "sou", "2026-08-14T18:30:00+09:00", "直した");
        let entries = parse_log(&stdout);

        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].hash, "abc123");
        assert_eq!(entries[0].author, "田中");
        assert_eq!(entries[0].date, "2026-08-15T09:00:00+09:00");
        assert_eq!(entries[0].subject, "最初のコミット");
        assert_eq!(entries[1].hash, "def456");
    }

    #[test]
    fn 履歴が空なら空の一覧になる() {
        assert_eq!(parse_log(""), Vec::new());
        assert_eq!(parse_log("\n"), Vec::new());
    }

    // 件名に区切り文字が混ざっても、そこで切らずに件名の一部として残す
    // （切ると履歴の見出しが黙って短くなる＝別のコミットに見える）。
    #[test]
    fn 件名に区切り文字が混ざっても切り落とさない() {
        let stdout = log_record("h1", "a", "d", "前\u{1f}後");
        let entries = parse_log(&stdout);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].subject, "前\u{1f}後");
    }

    #[test]
    fn 欠けた行は捨てる() {
        let stdout = format!("こわれた記録\u{1e}\n{}", log_record("h1", "a", "d", "s"));
        let entries = parse_log(&stdout);
        assert_eq!(entries.len(), 1, "形が揃っている分だけ残る");
        assert_eq!(entries[0].hash, "h1");
    }

    // 全部返すと大きいので件数で切る。期間で切ると動きの少ないリポジトリで何も出ない。
    #[test]
    fn 取得件数には既定と上限がある() {
        assert_eq!(clamp_log_limit(None), 50, "指定なしは 50 件");
        assert_eq!(clamp_log_limit(Some(10)), 10);
        assert_eq!(clamp_log_limit(Some(0)), 1, "0 件では何も見えない");
        assert_eq!(clamp_log_limit(Some(9999)), 200, "上限で頭打ち");
    }

    #[test]
    fn 履歴を新しい順に返す() {
        let dir = temp_repo("gitlog");
        std::fs::write(dir.join("a.md"), "1\n").expect("書き込み");
        git_commit_impl(&dir, "ひとつ目", &[]).expect("コミット成功");
        std::fs::write(dir.join("a.md"), "2\n").expect("書き込み");
        git_commit_impl(&dir, "ふたつ目", &[]).expect("コミット成功");

        let entries = git_log_impl(&dir, None, None).expect("履歴取得成功");
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].subject, "ふたつ目", "新しいものが先頭");
        assert_eq!(entries[1].subject, "ひとつ目");
        assert_eq!(entries[0].author, "test");
        assert!(!entries[0].hash.is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn パスを指定するとそのファイルの履歴だけ返る() {
        let dir = temp_repo("gitlogpath");
        std::fs::write(dir.join("a.md"), "1\n").expect("書き込み");
        git_commit_impl(&dir, "a を足した", &[]).expect("コミット成功");
        std::fs::write(dir.join("b.md"), "1\n").expect("書き込み");
        git_commit_impl(&dir, "b を足した", &[]).expect("コミット成功");

        let entries = git_log_impl(&dir, Some("b.md"), None).expect("履歴取得成功");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].subject, "b を足した");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn 件数の指定を超えて返さない() {
        let dir = temp_repo("gitloglimit");
        for i in 0..3 {
            std::fs::write(dir.join("a.md"), format!("{i}\n")).expect("書き込み");
            git_commit_impl(&dir, &format!("{i} 回目"), &[]).expect("コミット成功");
        }

        let entries = git_log_impl(&dir, None, Some(2)).expect("履歴取得成功");
        assert_eq!(entries.len(), 2);
        let _ = std::fs::remove_dir_all(&dir);
    }

    // コミットが 1 つも無いリポジトリで git log は失敗するが、それは「まだ無い」だけ。
    #[test]
    fn コミットが無いリポジトリは空の一覧になる() {
        let dir = temp_repo("gitlogempty");
        assert_eq!(git_log_impl(&dir, None, None).expect("エラーにしない"), Vec::new());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn 履歴もリポジトリ外のパスは_git実行前にエラー() {
        let dir = temp_repo("gitlogbad");
        assert!(git_log_impl(&dir, Some("../外.md"), None).is_err());
        assert!(git_log_impl(&dir, Some("C:\\Windows\\win.ini"), None).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// git を持たない素のフォルダ（init を試す相手）。
    fn temp_plain_dir(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("mdbiz_{}_{}", tag, std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("temp 作成");
        dir
    }

    // 既定ブランチ名の設定があるならそれに従う（利用者の設定を上書きしない）。
    #[test]
    fn init_の引数は既定ブランチ設定の有無で決まる() {
        assert_eq!(init_args(None), vec!["init", "-b", "main"]);
        assert_eq!(init_args(Some("")), vec!["init", "-b", "main"], "空の設定は無いのと同じ");
        assert_eq!(init_args(Some("trunk")), vec!["init"], "設定があるなら git に任せる");
    }

    #[test]
    fn 素のフォルダをリポジトリにできる() {
        let dir = temp_plain_dir("gitinit");
        assert!(!git_status_impl(&dir).is_repo, "まだリポジトリではない");

        let status = git_init_impl(&dir).expect("init 成功");
        assert!(status.is_repo, "init 後はリポジトリとして見える");
        let _ = std::fs::remove_dir_all(&dir);
    }

    // `git init` は既にリポジトリでも成功してしまう。ここで断らないと
    // 「押しても何も起きないボタン」になり、利用者からは失敗と区別が付かない。
    #[test]
    fn 既にリポジトリなら断る() {
        let dir = temp_repo("gitinitagain");
        assert!(git_init_impl(&dir).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    // ---- clone --------------------------------------------------------------

    // URL に資格情報が埋まっていると、そのまま remote.origin.url へ平文で残り、
    // 以後の push / pull の失敗メッセージにも出る。git へ渡す前に断る。
    #[test]
    fn 資格情報の埋まった_url_は断る() {
        assert!(check_clone_url("https://user:token@example.com/a/b.git").is_err());
        assert!(check_clone_url("https://token@example.com/a/b.git").is_err());
        assert!(check_clone_url("ssh://user:pw@example.com/a/b.git").is_err());
        assert!(check_clone_url("user:pw@example.com:a/b.git").is_err());
    }

    #[test]
    fn 受け付ける複製元() {
        assert!(check_clone_url("https://example.com/a/b.git").is_ok());
        assert!(check_clone_url("ssh://example.com/a/b.git").is_ok());
        assert!(
            check_clone_url("ssh://git@example.com/a/b.git").is_ok(),
            "ssh の利用者名は秘密ではない"
        );
        assert!(
            check_clone_url("git@example.com:a/b.git").is_ok(),
            "scp 形式の利用者名は資格情報ではない"
        );
        assert!(check_clone_url("file:///srv/repos/b.git").is_ok());
        assert!(check_clone_url("/srv/repos/b.git").is_ok(), "手元のフォルダ");
        assert!(check_clone_url(r"C:\Users\me\My Docs\b").is_ok(), "空白を含む手元のパス");
        assert!(check_clone_url(r"\server\share\b.git").is_ok(), "共有フォルダ");
    }

    // ext:: は任意のコマンドを走らせる指定。http:// は資格情報が平文で流れる。
    #[test]
    fn 受け付けない複製元() {
        assert!(check_clone_url("").is_err());
        assert!(check_clone_url("   ").is_err());
        assert!(check_clone_url("--upload-pack=calc").is_err(), "オプションに見える指定");
        assert!(check_clone_url("ext::sh -c 'calc'").is_err());
        assert!(check_clone_url("http://example.com/a/b.git").is_err());
        assert!(check_clone_url("git://example.com/a/b.git").is_err());
        assert!(check_clone_url("https://exa mple.com/a/b.git").is_err(), "空白入りの url");
        assert!(check_clone_url("https://example.com/a/\u{7f}b.git").is_err(), "制御文字");
    }

    #[test]
    fn clone_の引数は_url_をオプションとして解釈させない() {
        assert_eq!(
            clone_args("https://example.com/a/b.git"),
            vec!["clone", "--", "https://example.com/a/b.git", "."],
        );
    }

    #[test]
    fn 空のフォルダへ複製できる() {
        let source = temp_repo("clonesrc");
        std::fs::write(source.join("a.md"), "本文\n").expect("書き込み");
        let git = |args: &[&str]| {
            git_command(&source).args(args).output().expect("git を実行できません")
        };
        git(&["add", "-A"]);
        git(&["commit", "-m", "first"]);

        let dest = temp_plain_dir("clonedst");
        let status = git_clone_impl(&dest, &source.to_string_lossy()).expect("clone 成功");
        assert!(status.is_repo, "複製後はリポジトリとして見える");
        assert!(dest.join("a.md").is_file(), "中身も来ている");

        let _ = std::fs::remove_dir_all(&source);
        let _ = std::fs::remove_dir_all(&dest);
    }

    // 空でないフォルダへ複製すると、既にある物と混ざるのか失敗するのかが利用者から読めない。
    #[test]
    fn 空でないフォルダへは複製しない() {
        let dir = temp_plain_dir("clonebusy");
        std::fs::write(dir.join("a.md"), "本文\n").expect("書き込み");
        assert!(git_clone_impl(&dir, "https://example.com/a/b.git").is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn 複製先が無いフォルダなら_git実行前にエラー() {
        let dir = std::env::temp_dir().join("mdbiz_clone_nosuch_dir");
        let _ = std::fs::remove_dir_all(&dir);
        assert!(git_clone_impl(&dir, "https://example.com/a/b.git").is_err());
    }

    // 通信の前に断る = 資格情報を伴う失敗を待たずに済む。
    #[test]
    fn 不正な複製元は_git実行前にエラー() {
        let dir = temp_plain_dir("cloneurl");
        let err = git_clone_impl(&dir, "http://example.com/a/b.git").expect_err("断る");
        assert!(err.contains("https"), "何を使えばよいかを言う: {err}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn 無いフォルダは_git実行前にエラー() {
        let dir = std::env::temp_dir().join("mdbiz_gitinit_absent");
        let _ = std::fs::remove_dir_all(&dir);
        assert!(git_init_impl(&dir).is_err());
    }

    #[test]
    fn コミット指定はハッシュだけ受ける() {
        assert!(is_valid_commit_ref("a1b2c3d"), "短縮ハッシュ（7 桁）を受ける");
        assert!(
            is_valid_commit_ref("0123456789abcdef0123456789abcdef01234567"),
            "完全なハッシュを受ける"
        );
        assert!(!is_valid_commit_ref("a1b2c3"), "6 桁は短すぎる");
        assert!(!is_valid_commit_ref("main"), "ブランチ名は受けない");
        assert!(!is_valid_commit_ref("HEAD~2"), "相対指定は受けない");
        assert!(!is_valid_commit_ref("--upload-pack=x"), "オプションへ化ける形を拒否");
        assert!(!is_valid_commit_ref(""), "空を拒否");
    }

    #[test]
    fn コミット指定は_cwd_基準のパスを組む() {
        assert_eq!(
            commit_path_spec("a1b2c3d", "docs/test-specs/001-login.tsv"),
            "a1b2c3d:./docs/test-specs/001-login.tsv"
        );
    }

    #[test]
    fn 区切りは_スラッシュ_へ寄せる() {
        assert_eq!(
            commit_path_spec("a1b2c3d", "docs\\a.tsv"),
            "a1b2c3d:./docs/a.tsv",
            "Windows の区切りのままでは git が別名として扱う"
        );
    }

    #[test]
    fn upstream_があるなら_送り先を決めない() {
        let plan = push_plan(true, Some("main"), &[]).expect("upstream 任せ");
        assert_eq!(plan.join(" "), "push");
    }

    #[test]
    fn upstream_が無いときの送り先() {
        let origin = vec!["origin".to_string()];
        let one = vec!["backup".to_string()];
        let many = vec!["backup".to_string(), "origin".to_string()];
        assert_eq!(
            push_plan(false, Some("feat"), &origin).expect("origin").join(" "),
            "push -u origin HEAD"
        );
        assert_eq!(
            push_plan(false, Some("feat"), &one).expect("1 つ").join(" "),
            "push -u backup HEAD",
            "1 つしか無いならそれを使う"
        );
        assert_eq!(
            push_plan(false, Some("feat"), &many).expect("origin 優先").join(" "),
            "push -u origin HEAD",
            "複数でも origin があれば origin"
        );
    }

    #[test]
    fn 送り先を決められないときは断る() {
        assert!(push_plan(false, Some("feat"), &[]).is_err(), "リモートが無い");
        let many = vec!["backup".to_string(), "mirror".to_string()];
        assert!(
            push_plan(false, Some("feat"), &many).is_err(),
            "複数あって origin が無ければ、どれへ出すかをアプリが決めない"
        );
        assert!(
            push_plan(false, None, &["origin".to_string()]).is_err(),
            "detached では、どのブランチへ出すかが定まらない"
        );
    }

    #[test]
    fn ブランチを作って切り替えられる() {
        let dir = temp_repo("gitbr");
        std::fs::write(dir.join("a.md"), "a
").expect("書き込み");
        git_commit_impl(&dir, "初回", &[]).expect("コミット");

        let status = git_switch_create_impl(&dir, "feature/x").expect("作成");
        assert_eq!(status.branch.as_deref(), Some("feature/x"));
        assert!(
            git_branches_impl(&dir).iter().any(|b| b == "feature/x"),
            "一覧にも出る"
        );
        assert!(
            git_switch_create_impl(&dir, "feature/x").is_err(),
            "既にある名前では作れない"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn 不正なブランチ名は_git実行前にエラー() {
        let dir = temp_repo("gitbrbad");
        assert!(git_switch_create_impl(&dir, "-f").is_err(), "先頭 '-'");
        assert!(git_switch_create_impl(&dir, "a b").is_err(), "空白");
        assert!(git_switch_create_impl(&dir, "").is_err(), "空");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn リモートの一覧を読む() {
        let dir = temp_repo("gitrem");
        assert!(git_remotes_impl(&dir).is_empty(), "足す前は空");
        run_git_result(&dir, &["remote", "add", "origin", "."]).expect("remote add");
        assert_eq!(git_remotes_impl(&dir), vec!["origin".to_string()]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn 送り先が無いリポジトリでは_pushしない() {
        let dir = temp_repo("gitpushnone");
        std::fs::write(dir.join("a.md"), "a
").expect("書き込み");
        git_commit_impl(&dir, "初回", &[]).expect("コミット");
        let err = git_push_impl(&dir).expect_err("送り先が無い");
        assert!(err.contains("送り先"), "読める理由を返す: {err}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn pushの案内から_urlを取り出す() {
        let out = "To github.example/o/r.git
remote: Create a pull request for 'feat/x' on GitHub by visiting:
remote:      https://github.example/o/r/pull/new/feat/x
remote:
 * [new branch]      HEAD -> feat/x
";
        assert_eq!(
            extract_forge_url(out).as_deref(),
            Some("https://github.example/o/r/pull/new/feat/x")
        );
    }

    #[test]
    fn 案内が無ければ_urlを出さない() {
        assert_eq!(extract_forge_url("Everything up-to-date
"), None);
        assert_eq!(extract_forge_url(""), None);
        assert_eq!(
            extract_forge_url("remote: visit http://github.example/o/r/pull/new/x
"),
            None,
            "https 以外は開かない"
        );
    }

    #[test]
    fn 資格情報つきの_urlは出さない() {
        assert_eq!(
            extract_forge_url("remote: https://user:token@github.example/o/r/pull/new/x
"),
            None
        );
    }

    #[test]
    fn 末尾の記号は_urlに含めない() {
        assert_eq!(
            extract_forge_url("remote: 詳しくは https://github.example/o/r/pull/new/x を開いてください。
")
                .as_deref(),
            Some("https://github.example/o/r/pull/new/x"),
        );
        assert_eq!(
            extract_forge_url("(https://github.example/o/r/pull/new/x)").as_deref(),
            Some("https://github.example/o/r/pull/new/x"),
        );
        assert_eq!(extract_forge_url("https://").as_deref(), None, "ホストが無い");
    }

    #[test]
    fn ローカルへのpushでは_urlは付かない() {
        let dir = temp_repo("gitpushlocal");
        let bare = temp_plain_dir("gitpushbare");
        let out = git_command(&bare)
            .args(["init", "--bare"])
            .output()
            .expect("bare 作成");
        assert!(out.status.success(), "bare init");
        let url = bare.to_string_lossy().replace(std::path::MAIN_SEPARATOR, "/");
        git_command(&dir)
            .args(["remote", "add", "origin", &url])
            .output()
            .expect("remote 追加");
        std::fs::write(dir.join("a.md"), "a
").expect("書き込み");
        git_commit_impl(&dir, "初回", &[]).expect("コミット");

        let outcome = git_push_impl(&dir).expect("push 成功");
        assert_eq!(outcome.status.ahead, 0, "送ったので進みは無い");
        assert_eq!(outcome.url, None, "ローカルの置き先は案内を出さない");
        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_dir_all(&bare);
    }
}
