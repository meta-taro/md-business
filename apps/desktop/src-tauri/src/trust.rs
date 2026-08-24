//! 同意の保存先と、画面から呼ぶ口（ファイル / Tauri 依存）。
//!
//! 判断そのものは [`crate::trust_logic`] にある。ここが持つのは「どこに置くか」と
//! 「読めなかったときにどちらへ転ぶか」だけ。
//!
//! 置き場はアプリの設定領域で、プロジェクトのフォルダの外にある。中に置くと同意ごと
//! clone で配れることになり、「この PC で 1 回押す」が成り立たなくなる。
//! 無い・読めない・壊れているはすべて「まだ何も許していない」として扱う（＝また聞く）。
//! 書けないときは失敗として返す。黙って「許可済み」へ倒れる道は作らない。

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::trust_logic::{
    grant, parse_store, project_key, revoke, serialize_store, TrustStore,
};

/// 同意を覚えておくファイル名。アプリの設定領域に置く。
const STORE_FILE_NAME: &str = "trust.json";

/// 読み出しから書き戻しまでを 1 つずつにする。画面と MCP から同時に届くと、
/// 後から書いたほうが前の許可を消してしまう。
static STORE_LOCK: Mutex<()> = Mutex::new(());

/// 1 つのフォルダについての同意の状態。画面にも MCP にも同じ形で返す。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrustStatus {
    /// 尋ねられたフォルダ。表示用なので、呼び出し側の綴りをそのまま返す。
    pub path: String,
    /// 一覧で使う鍵。同じフォルダなら綴りが違っても同じになる。
    pub key: String,
    pub trusted: bool,
    /// 許した時刻（Unix 秒）。許していなければ無い。
    pub granted_at: Option<i64>,
}

fn now_secs() -> i64 {
    match SystemTime::now().duration_since(UNIX_EPOCH) {
        Ok(elapsed) => elapsed.as_secs() as i64,
        // 時計が epoch より前に設定されている環境。押した事実のほうが本体なので、
        // 時刻が取れないことを理由に許可そのものを落とさない。
        Err(_) => 0,
    }
}

fn store_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|_| "設定の置き場所が分かりません".to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("設定の置き場所を作れません: {}", e))?;
    Ok(dir.join(STORE_FILE_NAME))
}

/// 保存先を読む。無い・読めない・壊れているは、どれも「まだ何も許していない」。
///
/// 読めないことを失敗として上へ返すと、呼び出し側がその失敗をどう扱うかで
/// 許可の有無が決まってしまう。ここで空へ倒しておけば、最悪でももう一度聞くだけになる。
fn load_store(path: &Path) -> TrustStore {
    match std::fs::read_to_string(path) {
        Ok(text) => parse_store(&text),
        Err(_) => TrustStore::default(),
    }
}

/// 保存先へ書く。書けなければ失敗として返す。
///
/// 「押したのに次回また聞かれる」は、黙って起きると原因が分からない壊れ方になる。
fn save_store(path: &Path, store: &TrustStore) -> Result<(), String> {
    std::fs::write(path, serialize_store(store)).map_err(|e| format!("同意を保存できません: {}", e))
}

/// フォルダを同意の鍵へ落とす。
///
/// 綴りの揺れ（末尾の区切り・大文字小文字・短縮名・記号リンク）で別のフォルダに見えると、
/// 一度許したものをもう一度聞くことになる。実在する場所へ解決してから鍵にする。
/// 解決できない綴りは断る。指す先が分からないまま許可の対象にはしない。
fn resolve(folder: &str) -> Result<String, String> {
    let path =
        std::fs::canonicalize(folder).map_err(|_| format!("{} を開けません", folder))?;
    if !path.is_dir() {
        return Err(format!("{} はフォルダではありません", folder));
    }
    project_key(&path).ok_or_else(|| format!("{} の場所を特定できません", folder))
}

fn status_of(store: &TrustStore, key: String, folder: &str) -> TrustStatus {
    let granted_at = store
        .projects
        .iter()
        .find(|project| project.key == key)
        .map(|project| project.granted_at);
    TrustStatus {
        path: folder.to_owned(),
        key,
        trusted: granted_at.is_some(),
        granted_at,
    }
}

/// 保存先を読み書きする間、他の呼び出しを待たせる。
///
/// ロックが壊れている（保持したまま panic した）ときは失敗として返す。
/// 読めない一覧を空とみなして先へ進むと、許可を消したまま書き戻すことになる。
fn with_store<T>(
    store: &Path,
    body: impl FnOnce(TrustStore) -> Result<T, String>,
) -> Result<T, String> {
    let _guard = STORE_LOCK
        .lock()
        .map_err(|_| "同意の一覧を読めません".to_string())?;
    body(load_store(store))
}

fn status_impl(store: &Path, folder: &str) -> Result<TrustStatus, String> {
    let key = resolve(folder)?;
    with_store(store, |loaded| Ok(status_of(&loaded, key, folder)))
}

fn grant_impl(store: &Path, folder: &str, now: i64) -> Result<TrustStatus, String> {
    let key = resolve(folder)?;
    with_store(store, |mut loaded| {
        grant(&mut loaded, &key, folder, now);
        save_store(store, &loaded)?;
        Ok(status_of(&loaded, key, folder))
    })
}

fn revoke_impl(store: &Path, folder: &str) -> Result<TrustStatus, String> {
    let key = resolve(folder)?;
    with_store(store, |mut loaded| {
        // 元から無くても保存はする。取り消したのに残っている状態を作らない。
        revoke(&mut loaded, &key);
        save_store(store, &loaded)?;
        Ok(status_of(&loaded, key, folder))
    })
}

/// このフォルダを、この PC で許してあるかを答える。
#[tauri::command]
pub fn project_trust_status(app: AppHandle, path: String) -> Result<TrustStatus, String> {
    status_impl(&store_path(&app)?, &path)
}

/// このフォルダを許す。**人が画面で押したときだけ呼ぶ。**
#[tauri::command]
pub fn grant_project_trust(app: AppHandle, path: String) -> Result<TrustStatus, String> {
    grant_impl(&store_path(&app)?, &path, now_secs())
}

/// 許可を取り消す。
#[tauri::command]
pub fn revoke_project_trust(app: AppHandle, path: String) -> Result<TrustStatus, String> {
    revoke_impl(&store_path(&app)?, &path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::MAIN_SEPARATOR;
    use std::sync::atomic::{AtomicU32, Ordering};

    /// テスト専用の一意な temp ルート。Drop で後始末する。
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

        fn sub(&self, name: &str) -> PathBuf {
            let p = self.path.join(name);
            std::fs::create_dir_all(&p).expect("フォルダ作成");
            p
        }

        fn store(&self) -> PathBuf {
            self.path.join("trust.json")
        }

    }

    impl Drop for TempRoot {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    fn folder(root: &TempRoot) -> String {
        root.sub("project").display().to_string()
    }

    #[test]
    fn 許していないフォルダは同意なしで返る() {
        let root = TempRoot::new("trust_none");
        let status = status_impl(&root.store(), &folder(&root)).expect("読める");
        assert!(!status.trusted);
        assert_eq!(status.granted_at, None);
        assert!(!status.key.is_empty());
    }

    #[test]
    fn 許すと同意ありになり時刻が残る() {
        let root = TempRoot::new("trust_grant");
        let target = folder(&root);
        let status = grant_impl(&root.store(), &target, 1_700_000_000).expect("許可できる");
        assert!(status.trusted);
        assert_eq!(status.granted_at, Some(1_700_000_000));
    }

    #[test]
    fn 許可は保存先に残る() {
        let root = TempRoot::new("trust_persist");
        let target = folder(&root);
        grant_impl(&root.store(), &target, 1_700_000_000).expect("許可できる");
        let status = status_impl(&root.store(), &target).expect("読める");
        assert!(status.trusted);
        assert_eq!(status.granted_at, Some(1_700_000_000));
    }

    #[test]
    fn 取り消すと同意なしに戻る() {
        let root = TempRoot::new("trust_revoke");
        let target = folder(&root);
        grant_impl(&root.store(), &target, 1_700_000_000).expect("許可できる");
        let status = revoke_impl(&root.store(), &target).expect("取り消せる");
        assert!(!status.trusted);
        assert!(!status_impl(&root.store(), &target).expect("読める").trusted);
    }

    #[test]
    fn 綴りが違っても同じフォルダなら聞き直さない() {
        let root = TempRoot::new("trust_spell");
        let target = folder(&root);
        grant_impl(&root.store(), &target, 1_700_000_000).expect("許可できる");
        let with_separator = format!("{}{}", target, MAIN_SEPARATOR);
        assert!(status_impl(&root.store(), &with_separator)
            .expect("読める")
            .trusted);
    }

    #[test]
    fn 別のフォルダは許可を引き継がない() {
        let root = TempRoot::new("trust_other");
        let target = folder(&root);
        grant_impl(&root.store(), &target, 1_700_000_000).expect("許可できる");
        let other = root.sub("other").display().to_string();
        assert!(!status_impl(&root.store(), &other).expect("読める").trusted);
    }

    #[test]
    fn 無いフォルダは断る() {
        let root = TempRoot::new("trust_missing");
        let missing = root.path.join("nope").display().to_string();
        assert!(status_impl(&root.store(), &missing).is_err());
    }

    #[test]
    fn ファイルは許可の対象にしない() {
        let root = TempRoot::new("trust_file");
        let file = root.path.join("a.md");
        std::fs::write(&file, b"x").expect("書ける");
        assert!(grant_impl(&root.store(), &file.display().to_string(), 1).is_err());
    }

    #[test]
    fn 壊れた保存先は空として扱い上書きできる() {
        let root = TempRoot::new("trust_broken");
        std::fs::write(root.store(), b"{ not json").expect("書ける");
        let target = folder(&root);
        assert!(!status_impl(&root.store(), &target).expect("読める").trusted);
        let status = grant_impl(&root.store(), &target, 1_700_000_000).expect("許可できる");
        assert!(status.trusted);
    }

    #[test]
    fn 保存先が無ければ空として読める() {
        let root = TempRoot::new("trust_absent");
        assert_eq!(load_store(&root.store()), TrustStore::default());
    }
}
