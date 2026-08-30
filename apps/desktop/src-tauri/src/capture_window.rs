//! 「今の画面はこう見えている」を返す入口（Tauri command）。
//!
//! [`crate::capture`] とは別物。あちらは**文書を画像に起こす**もので、こちらは
//! **アプリの窓そのものを撮る**。困っている人が何を見ているのかを、言葉に頼らず
//! そのまま渡すためにある。
//!
//! 撮ったものはファイルに置かず、その場で返す。置くと後片付けが要るうえ、
//! 画面の写しが黙って残る。**残すかどうかは受け取った側が決める**。

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde::Serialize;

use crate::capture_window_logic::{plan_shot, png_size, DEFAULT_MAX_EDGE};

/// 撮れたもの。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowShot {
    /// PNG を base64 にしたもの。
    pub data: String,
    /// 画像そのものの大きさ（**撮る前の見込みではなく、撮れたものを数えた値**）。
    pub width: u32,
    pub height: u32,
    /// 撮ったときの窓の大きさ。縮めたかどうかがこの 2 つとの差で分かる。
    pub window_width: u32,
    pub window_height: u32,
}

/// この窓を撮る。
///
/// `max_edge` は長辺の上限。省くと [`DEFAULT_MAX_EDGE`]。**大きい窓は縮めるが、
/// 小さい窓は引き伸ばさない**。
///
/// `async` にしてあるのは待ち方のため。同期の command は主スレッドで走るので、
/// そこで webview の返事を待つと、返事を運ぶ側の筋を自分で塞いで動かなくなる。
#[tauri::command(async)]
pub fn capture_window(
    window: tauri::WebviewWindow,
    max_edge: Option<u32>,
) -> Result<WindowShot, String> {
    let size = window
        .inner_size()
        .map_err(|error| format!("窓の大きさが取れません: {error}"))?;
    let scale_factor = window
        .scale_factor()
        .map_err(|error| format!("画面の拡大率が取れません: {error}"))?;
    let plan = plan_shot(
        size.width,
        size.height,
        scale_factor,
        max_edge.unwrap_or(DEFAULT_MAX_EDGE),
    )?;

    let bytes = shoot(&window, &plan)?;
    // 予想ではなく実物から数える。ずれていたら実物のほうが正しい。
    let (width, height) = png_size(&bytes).ok_or("撮れたものが画像になっていません")?;

    Ok(WindowShot {
        data: STANDARD.encode(&bytes),
        width,
        height,
        window_width: size.width,
        window_height: size.height,
    })
}

#[cfg(windows)]
fn shoot(
    window: &tauri::WebviewWindow,
    plan: &crate::capture_window_logic::ShotPlan,
) -> Result<Vec<u8>, String> {
    crate::capture_window_win::capture(window, plan)
}

#[cfg(not(windows))]
fn shoot(
    _window: &tauri::WebviewWindow,
    _plan: &crate::capture_window_logic::ShotPlan,
) -> Result<Vec<u8>, String> {
    // 撮る口は今のところ Windows のぶんしか書いていない。撮れないことを言う。
    // 黙って空の画像を返すと、受け取った側は「何も映っていない画面」だと読む。
    Err("この環境では窓を撮れません".to_string())
}
