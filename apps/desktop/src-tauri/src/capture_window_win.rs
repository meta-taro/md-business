//! Windows で「今見えている窓」を撮る。
//!
//! 撮るのは画面ではなく、アプリが抱えている WebView2 そのもの
//! （`Page.captureScreenshot` を DevTools Protocol で投げる）。この窓は枠を OS に
//! 描かせていない（`decorations: false`）ので、**webview の中身がそのまま窓ぜんぶ**になる。
//!
//! 画面をなぞらないことで得られるものが 3 つある。
//!
//! - 手前に別のアプリが重なっていても、写るのはこの窓だけ（利用者の他の作業が混ざらない）
//! - 畳んでいない限り、隠れていても撮れる
//! - 撮るために窓を手前に出す必要が無い（撮ったせいで利用者の操作が飛ばない）
//!
//! WebView2 を触れるのはアプリの主スレッドの上だけなので、そこへ渡して、結果は
//! 通り道（チャネル）で受け取る。**待つ側でメッセージを回さない**——回すと、
//! 撮っている最中の webview へ内側から入り込むことになる。

use std::sync::mpsc::sync_channel;
use std::time::Duration;

use webview2_com::CallDevToolsProtocolMethodCompletedHandler;
use windows::core::HSTRING;

use crate::capture_window_logic::{decode_screenshot, screenshot_params, ShotPlan};

/// 撮る道具そのものへ届かないときの断り文の頭。
pub const UNAVAILABLE: &str = "この環境では窓を撮れません";

/// 待つ上限。画面 1 枚ぶんなので長くは要らない。返らないまま止まるより断る。
const DEADLINE: Duration = Duration::from_secs(20);

/// 見えている窓を撮り、PNG の中身を返す。
pub fn capture(window: &tauri::WebviewWindow, plan: &ShotPlan) -> Result<Vec<u8>, String> {
    let params = screenshot_params(plan);
    // 主スレッドから 1 度だけ返る。取りに来る側は 1 人なので 1 つ分あれば足りる。
    let (sender, receiver) = sync_channel::<Result<String, String>>(1);

    window
        .with_webview(move |platform| {
            let controller = platform.controller();
            let outcome = (|| -> Result<(), String> {
                let core = unsafe { controller.CoreWebView2() }
                    .map_err(|error| format!("{UNAVAILABLE}: {error}"))?;
                let sink = sender.clone();
                let handler = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(
                    move |result, answer| {
                        // 失敗も必ず送り返す。黙ると待っている側は時間切れまで止まる。
                        let _ = sink.send(match result {
                            Ok(()) => Ok(answer),
                            Err(error) => Err(format!("撮れませんでした: {error}")),
                        });
                        Ok(())
                    },
                ));
                unsafe {
                    core.CallDevToolsProtocolMethod(
                        &HSTRING::from("Page.captureScreenshot"),
                        &HSTRING::from(params),
                        &handler,
                    )
                }
                .map_err(|error| format!("撮る指示を出せませんでした: {error}"))
            })();
            // 頼む前に転んだ場合、待ち手には何も届かない。断り文をここで送る。
            if let Err(error) = outcome {
                let _ = sender.send(Err(error));
            }
        })
        .map_err(|error| format!("{UNAVAILABLE}: 画面へ届きません（{error}）"))?;

    let answer = receiver
        .recv_timeout(DEADLINE)
        .map_err(|_| format!("{UNAVAILABLE}: 撮った返りがありません"))??;
    decode_screenshot(&answer)
}
