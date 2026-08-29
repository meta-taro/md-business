//! 窓ごとの実行時状態の入れ物。
//!
//! ファイル監視・MCP サイドカー・プレビューサーバーは、いずれも「開いているフォルダ 1 つ」に
//! 結びついた状態を持つ。窓が 1 つしか無い間はアプリ全体で 1 つ `manage` すれば足りたが、
//! 2 つのフォルダを並べて開けるようにすると、窓ごとに別の実体が要る。
//!
//! 3 つを別々の表で持たず 1 つにまとめてあるのは、**生死が揃う**ため。窓が閉じたときに
//! 消すのは 1 か所で、消し忘れた状態だけが残ることが起きない。
//!
//! 鍵は窓のラベル（Tauri が窓に付ける一意な名前）。窓が閉じたら [`WindowStates::remove`] で
//! 外し、返ってきた実体を呼び出し側が畳む（子プロセス・待ち受けの後片付けは、状態を
//! 表から外したあとに行う）。

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Manager};

use crate::mcp::McpRuntime;
use crate::preview_server::PreviewServerState;
use crate::watch::WatchState;

/// 1 つの窓が持つ実行時状態。
#[derive(Default)]
pub struct WindowRuntime {
    pub watch: WatchState,
    pub mcp: McpRuntime,
    pub preview: PreviewServerState,
}

/// 窓ラベル → 実行時状態。アプリ全体で 1 つを `manage` する。
#[derive(Default)]
pub struct WindowStates {
    inner: Mutex<HashMap<String, Arc<WindowRuntime>>>,
    /// 窓ラベル → その窓が開いているフォルダ（予約台帳）。
    ///
    /// 「どの窓がどこを開いているか」は監視の登録先からも辿れるが、それは**開き終えてから**
    /// 登録される。開く前に取り合いを止めたいので、判断の材料を別に持つ。監視が張れない
    /// 場所（権限・ネットワーク越し）では監視が登録されないままになるので、そちらを
    /// 材料にすると取り合いを止める仕組みごと効かなくなる。
    claims: Mutex<HashMap<String, PathBuf>>,
}

impl WindowStates {
    /// そのラベルの状態を返す。初めてのラベルならその場で作る。
    ///
    /// 窓が出来てから状態を作るまでの間に、その窓からのコマンドが届きうる。先に作らせて
    /// おいて「無ければ失敗」にすると、順番の揺れがそのまま起動失敗として見える。
    pub fn get(&self, label: &str) -> Arc<WindowRuntime> {
        let mut map = self.lock();
        Arc::clone(
            map.entry(label.to_string())
                .or_insert_with(|| Arc::new(WindowRuntime::default())),
        )
    }

    /// 表から外して返す。知らないラベルなら None。
    ///
    /// 返した実体は呼び出し側が畳む。表から外すのと後片付けを 1 つの錠の中でやると、
    /// 子プロセスの停止を待つ間ほかの窓のコマンドが止まる。
    pub fn remove(&self, label: &str) -> Option<Arc<WindowRuntime>> {
        // 予約も一緒に返す。閉じた窓の予約が残ると、そのフォルダを二度と開けなくなる。
        self.claims().remove(label);
        self.lock().remove(label)
    }

    /// このフォルダをこの窓のものとして予約する。取れたら `None`、
    /// 既に**別の窓**が開いていればその窓のラベルを返す。
    ///
    /// 同じフォルダを 2 つの窓で開くと、窓ごとに 1 本ずつ持つもの（監視・MCP サーバー）が
    /// 同じ場所を取り合う。とくに接続情報のファイルは窓ごとに違う待ち受け先を書くので、
    /// 後から開いた窓が先の窓の分を上書きし、**先の窓につないだつもりのエージェントが
    /// 黙って別の窓へ行く**。
    ///
    /// 見てから書くまでを 1 つの錠の中で済ませる。分けると、2 つの窓が同時に開こうとした
    /// ときに両方とも「空いている」と見て、両方が開く。
    ///
    /// 入れ子（親と子）は指しているところが違うので取り合いにならない。同じフォルダのときだけ断る。
    pub fn claim(&self, label: &str, root: &Path) -> Option<String> {
        let mut claims = self.claims();
        if let Some((holder, _)) = claims
            .iter()
            .find(|(other, held)| other.as_str() != label && held.as_path() == root)
        {
            return Some(holder.clone());
        }
        // 1 つの窓が持つのは 1 フォルダ。開き先を移したら前のところは空ける。
        claims.insert(label.to_string(), root.to_path_buf());
        None
    }

    /// いま状態を持っている窓のラベル（順序は決まらない）。
    pub fn labels(&self) -> Vec<String> {
        self.lock().keys().cloned().collect()
    }

    /// 毒された錠からも中身を取り出す。ここに入っているのは表そのものだけで、
    /// 途中で落ちても半端な状態にはならない（挿入・削除しかしない）。表を諦めると
    /// 以後すべての窓が状態を引けなくなるので、中身を取って続ける。
    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<String, Arc<WindowRuntime>>> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn claims(&self) -> std::sync::MutexGuard<'_, HashMap<String, PathBuf>> {
        self.claims.lock().unwrap_or_else(|e| e.into_inner())
    }
}

/// 呼び出し元の窓の状態を引く。Tauri コマンドから使う。
pub fn of(window: &tauri::Window) -> Arc<WindowRuntime> {
    for_label(window.app_handle(), window.label())
}

/// ラベルを直接指定して引く。窓を引数に取れない経路（起動・後片付け・監視の折り返し）用。
pub fn for_label(app: &AppHandle, label: &str) -> Arc<WindowRuntime> {
    app.state::<WindowStates>().get(label)
}

/// 窓が閉じたときの後片付け。表から外してから、外に出したものを畳む。
///
/// 順序が逆だと、畳んでいる最中に同じラベルで引いた側が「もう死んでいる状態」を掴む。
/// 知らないラベル（状態を持たないまま閉じた窓）なら何もしない。
pub fn close(app: &AppHandle, label: &str) {
    // 窓宛の預かりも一緒に捨てる。窓の名前は使い回されるので、残しておくと
    // あとから開いた窓が前の窓宛の依頼を受け取る。実行時状態を持たないまま閉じた窓でも
    // 預かりだけは在りうるので、状態を引く前に行う。
    crate::open_arg::forget(app, label);
    crate::deep_link::forget(app, label);
    let Some(runtime) = app.state::<WindowStates>().remove(label) else {
        return;
    };
    crate::watch::stop(&runtime.watch);
    crate::mcp::shutdown(&runtime.mcp);
    crate::preview_server::shutdown(&runtime.preview);
}

/// 残っている窓の状態をすべて畳む。アプリ終了時に呼ぶ。
pub fn close_all(app: &AppHandle) {
    for label in app.state::<WindowStates>().labels() {
        close(app, &label);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn 同じラベルは同じ実体を返す() {
        let states = WindowStates::default();
        let a = states.get("main");
        let b = states.get("main");
        assert!(Arc::ptr_eq(&a, &b), "同じ窓なら同じ状態でなければならない");
        assert_eq!(states.labels().len(), 1);
    }

    #[test]
    fn 違うラベルは別の実体になる() {
        let states = WindowStates::default();
        let a = states.get("main");
        let b = states.get("w2");
        assert!(!Arc::ptr_eq(&a, &b), "窓が違えば状態も別でなければならない");
        assert_eq!(states.labels().len(), 2);
    }

    #[test]
    fn 外すと表から消える() {
        let states = WindowStates::default();
        let a = states.get("main");
        states.get("w2");

        let removed = states.remove("main").expect("外せる");
        assert!(Arc::ptr_eq(&a, &removed), "外した実体が返る");
        assert_eq!(states.labels().len(), 1);
        assert_eq!(states.labels(), vec!["w2".to_string()]);
    }

    #[test]
    fn 知らないラベルを外しても何も起きない() {
        let states = WindowStates::default();
        states.get("main");
        assert!(states.remove("w9").is_none());
        assert_eq!(states.labels().len(), 1);
    }

    #[test]
    fn 空いているフォルダは予約できる() {
        let states = WindowStates::default();
        assert_eq!(states.claim("main", Path::new("/work/lp")), None);
    }

    #[test]
    fn 別の窓が持っているフォルダは断る() {
        let states = WindowStates::default();
        states.claim("main", Path::new("/work/lp"));
        assert_eq!(
            states.claim("w2", Path::new("/work/lp")),
            Some("main".to_string())
        );
    }

    #[test]
    fn 同じ窓が同じフォルダを開き直すのは通る() {
        // 保存・改名・ブランチ切替では同じフォルダを開き直す。ここで塞ぐと何もできなくなる。
        let states = WindowStates::default();
        states.claim("main", Path::new("/work/lp"));
        assert_eq!(states.claim("main", Path::new("/work/lp")), None);
    }

    #[test]
    fn 窓が別のフォルダへ移ると前のフォルダは空く() {
        let states = WindowStates::default();
        states.claim("main", Path::new("/work/lp"));
        states.claim("main", Path::new("/work/sheets"));
        assert_eq!(states.claim("w2", Path::new("/work/lp")), None);
    }

    #[test]
    fn 窓を外すと予約も空く() {
        let states = WindowStates::default();
        states.get("main");
        states.claim("main", Path::new("/work/lp"));
        states.remove("main");
        assert_eq!(states.claim("w2", Path::new("/work/lp")), None);
    }

    #[test]
    fn 入れ子は別のフォルダとして扱う() {
        // 監視も MCP もフォルダ単位なので、指しているところが違えば取り合いにならない。
        let states = WindowStates::default();
        states.claim("main", Path::new("/work"));
        assert_eq!(states.claim("w2", Path::new("/work/lp")), None);
    }

    #[test]
    fn 外したあとに同じラベルを引くと新しい実体になる() {
        let states = WindowStates::default();
        let first = states.get("main");
        states.remove("main");
        let second = states.get("main");
        assert!(
            !Arc::ptr_eq(&first, &second),
            "閉じた窓の状態が次の窓へ引き継がれてはならない"
        );
    }
}
