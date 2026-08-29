//! 更新確認を、窓の数ではなくプロセスに 1 回にする。
//!
//! 起動して少し経つと、画面は自分で更新の有無を見に行く。窓が 2 つあると、同じ問い合わせが
//! 2 回出る。利用者から見ると同じ知らせが 2 枚重なって出るし、通信も無駄に増える。
//!
//! どの窓が最初に立ち上がるかは決まっていないので、「最初の窓だけが見に行く」という決め方は
//! できない（最初の窓を閉じていると、誰も見に行かなくなる）。先に言い出した 1 つが受け持つ形にする。

use std::sync::Mutex;

#[derive(Default)]
struct Gate {
    /// いま受け持っている窓。見終わるまで空かない。
    holder: Option<String>,
    /// 一度でも見終わったか。以後は誰も受け持たない。
    done: bool,
}

#[derive(Default)]
pub struct UpdateCheckOnce(Mutex<Gate>);

impl UpdateCheckOnce {
    /// この窓が受け持つか。受け持っている窓が居るあいだ、および見終わったあとは `false`。
    pub fn claim(&self, label: &str) -> bool {
        let mut gate = self.lock();
        if gate.done || gate.holder.is_some() {
            return false;
        }
        gate.holder = Some(label.to_string());
        true
    }

    /// 見終わった。以後どの窓も受け持たない。
    pub fn finish(&self) {
        let mut gate = self.lock();
        gate.done = true;
        gate.holder = None;
    }

    /// その窓が受け持ったまま閉じたときに手放す。
    ///
    /// 手放さないと、**誰も見に行かないまま起動中ずっと塞がる**。見終わったあとは
    /// 空けない（空けると、あとから開いた窓がもう一度見に行って同じ知らせが二度出る）。
    pub fn release(&self, label: &str) {
        let mut gate = self.lock();
        if gate.holder.as_deref() == Some(label) {
            gate.holder = None;
        }
    }

    /// 毒された錠からも中身を取り出す。持っているのは受け持ちの印だけで、途中で落ちても
    /// 半端な状態にはならない。諦めると以後どの窓も更新を見に行けなくなる。
    fn lock(&self) -> std::sync::MutexGuard<'_, Gate> {
        self.0.lock().unwrap_or_else(|e| e.into_inner())
    }
}

/// 起動後の更新確認をこの窓が受け持つか。
#[tauri::command]
pub fn claim_update_check(window: tauri::Window, state: tauri::State<UpdateCheckOnce>) -> bool {
    state.claim(window.label())
}

/// 窓が閉じたときに受け持ちを手放す。
pub fn forget(app: &tauri::AppHandle, label: &str) {
    if let Some(state) = tauri::Manager::try_state::<UpdateCheckOnce>(app) {
        state.release(label);
    }
}

/// 受け持った窓が見終わったことを伝える。
#[tauri::command]
pub fn finish_update_check(state: tauri::State<UpdateCheckOnce>) {
    state.finish();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 受け持つのは最初の一つだけ() {
        let once = UpdateCheckOnce::default();
        assert!(once.claim("main"));
        assert!(!once.claim("w2"));
        assert!(!once.claim("w3"));
    }

    #[test]
    fn 受け持った窓が閉じたら次の窓が受け持てる() {
        // 見に行く前に閉じられると、誰も見に行かないまま起動中ずっと塞がる。
        let once = UpdateCheckOnce::default();
        assert!(once.claim("main"));
        once.release("main");
        assert!(once.claim("w2"));
    }

    #[test]
    fn 見終わったあとは誰も受け持たない() {
        // ここで空けると、あとから開いた窓がもう一度見に行って同じ知らせが二度出る。
        let once = UpdateCheckOnce::default();
        assert!(once.claim("main"));
        once.finish();
        once.release("main");
        assert!(!once.claim("w2"));
    }

    #[test]
    fn 受け持っていない窓が閉じても取り上げない() {
        let once = UpdateCheckOnce::default();
        assert!(once.claim("main"));
        once.release("w2");
        assert!(!once.claim("w3"));
    }
}
