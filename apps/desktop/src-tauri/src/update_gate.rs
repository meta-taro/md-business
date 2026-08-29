//! 更新確認を、窓の数ではなくプロセスに 1 回にする。
//!
//! 起動して少し経つと、画面は自分で更新の有無を見に行く。窓が 2 つあると、同じ問い合わせが
//! 2 回出る。利用者から見ると同じ知らせが 2 枚重なって出るし、通信も無駄に増える。
//!
//! どの窓が最初に立ち上がるかは決まっていないので、「最初の窓だけが見に行く」という決め方は
//! できない（最初の窓を閉じていると、誰も見に行かなくなる）。先に言い出した 1 つが受け持つ形にする。

use std::sync::atomic::{AtomicBool, Ordering};

#[derive(Default)]
pub struct UpdateCheckOnce(AtomicBool);

impl UpdateCheckOnce {
    /// 受け持つかどうか。最初に呼んだ 1 回だけ `true`。
    pub fn claim(&self) -> bool {
        !self.0.swap(true, Ordering::SeqCst)
    }
}

/// 起動後の更新確認をこの窓が受け持つか。
#[tauri::command]
pub fn claim_update_check(state: tauri::State<UpdateCheckOnce>) -> bool {
    state.claim()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 受け持つのは最初の一つだけ() {
        let once = UpdateCheckOnce::default();
        assert!(once.claim());
        assert!(!once.claim());
        assert!(!once.claim());
    }
}
