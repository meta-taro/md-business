//! 外から届いた依頼を、どの窓へ回すかを決める。
//!
//! 窓が 1 つしか無い間は決める必要が無かった（届け先は「主窓」1 つ）。2 つのフォルダを
//! 並べて開けるようになると、依頼のたびに行き先が要る。
//!
//! 判断の材料は **窓がいま開いているフォルダ**。開いてほしいファイルを含むフォルダを
//! 持つ窓へ回せば、利用者から見て「そこに出てほしいところに出る」。どの窓にも含まれない
//! ときはここでは決めず、呼び出し側が決める（新しい窓を開く / 手前の窓に出す）。

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::{AppHandle, Manager};

/// 画面がまだ受け取れる状態でないときに、依頼を窓ごとに 1 件ずつ預かる場所。
///
/// 窓ごとに分けるのは、預かりが 1 枠しか無いと、2 つの窓へ続けて依頼が来たときに
/// 先の 1 件が上書きで消えるため。同じ窓への上書きは今までどおり（最後に頼まれたものが
/// 利用者の意図）。
#[derive(Default)]
pub struct PendingByWindow(Mutex<HashMap<String, String>>);

impl PendingByWindow {
    pub fn put(&self, label: &str, value: String) {
        if let Ok(mut map) = self.0.lock() {
            map.insert(label.to_string(), value);
        }
    }

    /// 取り出したら消す。画面を作り直すたびに同じものが開き直るのを避けるため。
    pub fn take(&self, label: &str) -> Option<String> {
        self.0.lock().ok().and_then(|mut map| map.remove(label))
    }
}

/// 依頼されたファイルを含むフォルダを開いている窓を選ぶ。
///
/// 入れ子（あるフォルダと、その中のフォルダを別々の窓で開いている）のときは **深い方**を
/// 選ぶ。浅い方にも含まれてはいるが、細かく指している窓のほうが利用者の関心に近い。
/// フォルダを開いていない窓は選ばない（開く先が無い）。
pub fn pick_by_root(roots: &[(String, Option<PathBuf>)], target: &Path) -> Option<String> {
    roots
        .iter()
        .filter_map(|(label, root)| root.as_ref().map(|r| (label, r)))
        .filter(|(_, root)| target.starts_with(root))
        .max_by_key(|(_, root)| root.components().count())
        .map(|(label, _)| label.clone())
}

/// いま窓が開いているフォルダの一覧（ラベルと組で返す）。
pub fn open_roots(app: &AppHandle) -> Vec<(String, Option<PathBuf>)> {
    app.state::<crate::window_state::WindowStates>().labels()
        .into_iter()
        .map(|label| {
            let root = crate::watch::current_root(&crate::window_state::for_label(app, &label).watch);
            (label, root)
        })
        .collect()
}

/// 手前にある窓。どれも手前に無ければ最初の窓。
///
/// フォルダで決められない依頼（共有リンクのように、開く先を画面側が決めるもの）の行き先。
/// 利用者が今見ている窓に出るのが、いちばん驚きが少ない。
///
/// アプリ全体が裏にあるとき（ブラウザからリンクを押した直後など）はどの窓も手前ではない。
/// そのときは最初の窓に出す。どこにも出さないより、決まった場所に出るほうが探しやすい。
pub fn focused_or_main(app: &AppHandle) -> String {
    app.webview_windows()
        .iter()
        .find(|(_, w)| w.is_focused().unwrap_or(false))
        .map(|(label, _)| label.clone())
        .unwrap_or_else(|| crate::MAIN_WINDOW.to_string())
}

/// 窓を前へ出す。
///
/// 外から頼まれたときは、頼んだ側から見て「開いた」と分かる必要がある。畳んだままでも
/// 裏に隠れたままでも、押しても何も起きなかったように映る。
pub fn focus(app: &AppHandle, label: &str) {
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// 依頼されたファイルの行き先。フォルダで決まらなければ手前の窓。
pub fn target_for_path(app: &AppHandle, path: &Path) -> String {
    // 監視ルートは実体のパスで持っている。渡された綴りのまま比べると、
    // 同じ場所を指していても前後関係が取れない（別名・相対・短縮名）。
    let canon = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    pick_by_root(&open_roots(app), &canon).unwrap_or_else(|| focused_or_main(app))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn roots(pairs: &[(&str, Option<&str>)]) -> Vec<(String, Option<PathBuf>)> {
        pairs
            .iter()
            .map(|(label, root)| (label.to_string(), root.map(PathBuf::from)))
            .collect()
    }

    #[test]
    fn 開いているフォルダの中のファイルはその窓が受け取る() {
        let list = roots(&[("main", Some("/work/lp")), ("w2", Some("/work/sheets"))]);
        assert_eq!(
            pick_by_root(&list, Path::new("/work/sheets/docs/001.tsv")),
            Some("w2".to_string())
        );
    }

    #[test]
    fn どの窓のフォルダにも入っていなければ決まらない() {
        let list = roots(&[("main", Some("/work/lp"))]);
        assert_eq!(pick_by_root(&list, Path::new("/other/a.md")), None);
    }

    #[test]
    fn 入れ子なら深い方の窓が受け取る() {
        let list = roots(&[("main", Some("/work")), ("w2", Some("/work/lp"))]);
        assert_eq!(
            pick_by_root(&list, Path::new("/work/lp/index.md")),
            Some("w2".to_string())
        );
    }

    #[test]
    fn フォルダを開いていない窓は選ばれない() {
        let list = roots(&[("main", None), ("w2", Some("/work"))]);
        assert_eq!(
            pick_by_root(&list, Path::new("/work/a.md")),
            Some("w2".to_string())
        );
        assert_eq!(pick_by_root(&roots(&[("main", None)]), Path::new("/work/a.md")), None);
    }

    #[test]
    fn 名前の途中まで一致しただけでは受け取らない() {
        // `/work/lp` と `/work/lp-old` は別のフォルダ。文字列として前方一致するだけで
        // 回してしまうと、隣のフォルダを開いている窓に出る。
        let list = roots(&[("main", Some("/work/lp"))]);
        assert_eq!(pick_by_root(&list, Path::new("/work/lp-old/index.md")), None);
    }
}
