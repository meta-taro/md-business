//! Git 連携の Tauri コマンド（DESIGN 後続フェーズ 3「Git・フォージ」）。
//!
//! ワークスペース root が git リポジトリなら、ファイル別の変更状態（VSCode 風の
//! 色マーク用）とブランチ / ahead-behind / フォージ種別（StatusBar 用）を返す。
//!
//! 取得は `git` CLI を一度だけ実行する（`git status --porcelain=v2 --branch -z`）。
//! libgit2 系クレートは Windows ビルドが重いため採らない。git 未導入・非リポジトリ・
//! その他失敗時は `is_repo=false` の空ステータスへ無害に劣化させ、UI はマーク非表示にする。
//!
//! パース（porcelain v2 -z → GitStatus）とフォージ判定は Tauri 非依存の純関数へ寄せ、
//! `#[cfg(test)]` から固定文字列に対して単体テストする（workspace.rs と同流儀・§7.3）。

use serde::Serialize;
use std::path::Path;
use std::process::Command;

/// 1 ファイルの変更状態。`rel_path` は root からの相対パス（区切りは "/"）。
/// `state` は色マークの意味カテゴリ（フロントの gitMark が色・バッジ文字へ写像する）。
#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitFileStatus {
    pub rel_path: String,
    /// "modified" | "added" | "untracked" | "deleted" | "renamed" | "conflicted"
    pub state: String,
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

/// `git -C <root> <args...>` を実行し、成功時のみ stdout を UTF-8（lossy）で返す。
/// git 未導入（spawn 失敗）・非 0 終了（非リポジトリ等）は None（呼び出し側で graceful 劣化）。
/// `--no-optional-locks` で index.lock 生成を避け、他プロセスの git 操作と競合しないようにする。
fn run_git(root: &Path, args: &[&str]) -> Option<String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .arg("--no-optional-locks")
        .args(args)
        .output()
        .ok()?;
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

/// フロントから `invoke("git_status", { root })` で呼ぶ薄いラッパ。
/// 失敗は Err にせず `is_repo=false` を返す（UI はマーク非表示で劣化）。
#[tauri::command]
pub fn git_status(root: String) -> GitStatus {
    git_status_impl(Path::new(&root))
}

/// `run_git` の Result 版。失敗時は stderr（無ければ終了コード）を Err で返す。
/// switch のようにユーザーへ失敗理由を見せたい操作で使う。
fn run_git_result(root: &Path, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .arg("--no-optional-locks")
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
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
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
pub fn git_branches(root: String) -> Vec<String> {
    git_branches_impl(Path::new(&root))
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
pub fn git_switch(root: String, branch: String) -> Result<GitStatus, String> {
    git_switch_impl(Path::new(&root), &branch)
}

/// コミットメッセージとして受け付けてよいか（空・空白のみを弾く＝空コミット防止）。
/// メッセージは `git commit -m <msg>` の位置引数として渡すので、先頭 '-' でも
/// オプション注入にならない（`-m` が次の 1 引数を確実に消費する）。中身の検閲はしない。
pub fn is_valid_commit_message(message: &str) -> bool {
    !message.trim().is_empty()
}

/// 変更をすべてステージ（`git add -A`）してコミットする。成功時は最新の GitStatus を返す。
/// - 空メッセージは git 実行前に弾く（空コミットを作らない）。
/// - ステージ後に変更が無ければ `git commit` が失敗する＝その stderr をそのまま Err で返す。
/// - `--no-verify` は付けない（リポジトリ側の hook を尊重する）。
pub fn git_commit_impl(root: &Path, message: &str) -> Result<GitStatus, String> {
    if !is_valid_commit_message(message) {
        return Err("コミットメッセージを入力してください".to_string());
    }
    // 全変更をステージ（新規・削除・変更を含む）。add -A は cwd に関わらずリポジトリ全体。
    run_git_result(root, &["add", "-A"])?;
    // message は位置引数として渡す（先頭 '-' でも注入にならない）。
    run_git_result(root, &["commit", "-m", message])?;
    Ok(git_status_impl(root))
}

/// フロントから `invoke("git_commit", { root, message })` で呼ぶラッパ。
#[tauri::command]
pub fn git_commit(root: String, message: String) -> Result<GitStatus, String> {
    git_commit_impl(Path::new(&root), &message)
}

/// upstream へ push する。成功時は最新の GitStatus（ahead が解消される）を返す。
/// `--force` は使わない = 非 fast-forward は失敗させ、リモート履歴を上書きしない（安全側）。
/// 認証は OS の git 資格情報ヘルパ／SSH に委ねる（アプリは資格情報を一切扱わない・§15）。
/// upstream 未設定・認証失敗・非 ff 拒否は git の stderr をそのまま Err で返し、UI が提示する。
pub fn git_push_impl(root: &Path) -> Result<GitStatus, String> {
    run_git_result(root, &["push"])?;
    Ok(git_status_impl(root))
}

/// フロントから `invoke("git_push", { root })` で呼ぶラッパ。
#[tauri::command]
pub fn git_push(root: String) -> Result<GitStatus, String> {
    git_push_impl(Path::new(&root))
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
pub fn git_pull(root: String) -> Result<GitStatus, String> {
    git_pull_impl(Path::new(&root))
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
pub fn git_diff(root: String, rel_path: String) -> Result<String, String> {
    git_diff_impl(Path::new(&root), &rel_path)
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
    fn detect_forge_未知はother_空はnone() {
        assert_eq!(
            detect_forge(Some("https://git.example.com/x.git")).as_deref(),
            Some("other")
        );
        assert_eq!(detect_forge(Some("   ")), None);
        assert_eq!(detect_forge(None), None);
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
        assert!(git_commit_impl(&dir, "").is_err());
        assert!(git_commit_impl(&dir, "   ").is_err());
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
}
