//! Windows で撮る（WebView2 の DevTools Protocol）。
//!
//! アプリが既に抱えている WebView2 に、Chromium の DevTools Protocol を直接投げて撮る。
//! 画像を出すためだけに Chromium をもう 1 つ同梱する必要が無い（配布物が増えない）のが理由。
//!
//! 使うのは 3 つだけ。
//!
//! - `Emulation.setDeviceMetricsOverride` — 撮る寸法と倍率を決める
//! - `Emulation.setDefaultBackgroundColorOverride` — 背景を抜く（透過 PNG のとき）
//! - `Page.captureScreenshot` — 撮る
//!
//! 画面に見えている webview には触らない。撮るたびに専用の WebView2 を作って捨てる。
//! 見えている側の寸法を書き換えると、利用者の画面が撮影のたびに歪むため。
//!
//! ひとつ制約がある。**親ウィンドウが「表示状態」でないと撮影が返ってこない。**
//! 描かれていないものは撮りようが無い、ということらしい。そこで画面の外へ置いたまま
//! 表示状態にする。タスクバーにも Alt+Tab にも出さないので、利用者からは見えない。

use std::cell::RefCell;
use std::path::Path;
use std::rc::Rc;
use std::time::{Duration, Instant};

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use webview2_com::Microsoft::Web::WebView2::Win32::{
    CreateCoreWebView2EnvironmentWithOptions, ICoreWebView2, ICoreWebView2Controller,
    ICoreWebView2Environment,
};
use webview2_com::{
    CallDevToolsProtocolMethodCompletedHandler, CreateCoreWebView2ControllerCompletedHandler,
    CreateCoreWebView2EnvironmentCompletedHandler, NavigationCompletedEventHandler,
};
use windows::core::{w, HSTRING, PCWSTR};
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, PeekMessageW, RegisterClassW,
    SetWindowPos, ShowWindow, TranslateMessage, MSG, PM_REMOVE, SWP_NOACTIVATE, SW_SHOWNOACTIVATE,
    WNDCLASSW, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_POPUP,
};

use crate::capture_logic::{
    metrics_params, screenshot_params, transparent_background_params, validate, wants_transparency,
    ShotSpec,
};

/// 撮る道具そのものが無いときの断り文の頭。呼ぶ側はこれで
/// 「この環境では撮れない」と「撮ろうとして失敗した」を読み分ける。
pub const UNAVAILABLE: &str = "この環境では画像を撮れません";

/// 待つ上限。撮る寸法が大きいと時間がかかるが、返らないまま止まるよりは
/// 断ったほうが原因を追える。
const DEADLINE: Duration = Duration::from_secs(60);

/// 撮る窓の大きさ。撮る画像の寸法とは無関係で、小さくてよい
/// （`captureBeyondViewport` が窓の外まで撮る）。
const WINDOW_W: i32 = 400;
const WINDOW_H: i32 = 300;

unsafe extern "system" fn wndproc(
    hwnd: HWND,
    message: u32,
    wparam: windows::Win32::Foundation::WPARAM,
    lparam: windows::Win32::Foundation::LPARAM,
) -> windows::Win32::Foundation::LRESULT {
    DefWindowProcW(hwnd, message, wparam, lparam)
}

/// `done` が真になるまで、この筋のメッセージを回しながら待つ。
///
/// webview2-com にも待つ関数はあるが、そちらは上限を持たない。返らない相手に当たると
/// アプリごと止まるので、上限付きのものをここで持つ。
fn pump_until<F: Fn() -> bool>(done: F) -> bool {
    let limit = Instant::now() + DEADLINE;
    while !done() {
        if Instant::now() > limit {
            return false;
        }
        unsafe {
            let mut message = MSG::default();
            while PeekMessageW(&mut message, None, 0, 0, PM_REMOVE).as_bool() {
                let _ = TranslateMessage(&message);
                DispatchMessageW(&message);
            }
        }
        std::thread::sleep(Duration::from_millis(5));
    }
    true
}

/// 撮り終えたら窓を必ず畳む（途中で断ったときも通る）。
struct HiddenWindow(HWND);

impl Drop for HiddenWindow {
    fn drop(&mut self) {
        unsafe {
            let _ = DestroyWindow(self.0);
        }
    }
}

/// 画面の外に、見えない窓を 1 つ作る。
fn create_hidden_window() -> Result<HWND, String> {
    let instance =
        unsafe { GetModuleHandleW(None) }.map_err(|error| format!("{UNAVAILABLE}: {error}"))?;
    let class_name = w!("md_business_capture_window");
    let class = WNDCLASSW {
        hInstance: instance.into(),
        lpszClassName: class_name,
        lpfnWndProc: Some(wndproc),
        ..Default::default()
    };
    // 2 度目以降は既に登録済みで 0 が返る。それで困らないので見ない。
    unsafe { RegisterClassW(&class) };

    let hwnd = unsafe {
        CreateWindowExW(
            // タスクバーにも Alt+Tab にも出さない。
            WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
            class_name,
            w!("md-business capture"),
            WS_POPUP,
            0,
            0,
            WINDOW_W,
            WINDOW_H,
            None,
            None,
            Some(instance.into()),
            None,
        )
    }
    .map_err(|error| format!("{UNAVAILABLE}: {error}"))?;

    // 画面の外へ置いたまま表示状態にする。描かれていないものは撮れないため。
    unsafe {
        let _ = SetWindowPos(
            hwnd,
            None,
            -32_000,
            -32_000,
            WINDOW_W,
            WINDOW_H,
            SWP_NOACTIVATE,
        );
        let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
    }
    Ok(hwnd)
}

fn create_environment(user_data_dir: &Path) -> Result<ICoreWebView2Environment, String> {
    std::fs::create_dir_all(user_data_dir)
        .map_err(|error| format!("{UNAVAILABLE}: 作業場所を作れません: {error}"))?;
    let folder = HSTRING::from(user_data_dir.to_string_lossy().as_ref());

    let slot: Rc<RefCell<Option<ICoreWebView2Environment>>> = Rc::new(RefCell::new(None));
    let sink = slot.clone();
    let handler = CreateCoreWebView2EnvironmentCompletedHandler::create(Box::new(
        move |result, environment| {
            result?;
            *sink.borrow_mut() = environment;
            Ok(())
        },
    ));
    unsafe {
        CreateCoreWebView2EnvironmentWithOptions(
            PCWSTR::null(),
            PCWSTR(folder.as_ptr()),
            None,
            &handler,
        )
    }
    .map_err(|error| format!("{UNAVAILABLE}: {error}"))?;

    if !pump_until(|| slot.borrow().is_some()) {
        return Err(format!("{UNAVAILABLE}: 用意が終わりませんでした。"));
    }
    let environment = slot.borrow().clone();
    environment.ok_or_else(|| format!("{UNAVAILABLE}: 用意できませんでした。"))
}

fn create_controller(
    environment: &ICoreWebView2Environment,
    hwnd: HWND,
) -> Result<ICoreWebView2Controller, String> {
    let slot: Rc<RefCell<Option<ICoreWebView2Controller>>> = Rc::new(RefCell::new(None));
    let sink = slot.clone();
    let handler = CreateCoreWebView2ControllerCompletedHandler::create(Box::new(
        move |result, controller| {
            result?;
            *sink.borrow_mut() = controller;
            Ok(())
        },
    ));
    unsafe { environment.CreateCoreWebView2Controller(hwnd, &handler) }
        .map_err(|error| format!("{UNAVAILABLE}: {error}"))?;

    if !pump_until(|| slot.borrow().is_some()) {
        return Err(format!("{UNAVAILABLE}: 描く側の用意が終わりませんでした。"));
    }
    let controller = slot.borrow().clone();
    controller.ok_or_else(|| format!("{UNAVAILABLE}: 描く側を用意できませんでした。"))
}

/// DevTools Protocol を 1 つ投げて、返ってきた JSON を受け取る。
fn call(webview: &ICoreWebView2, method: &str, params: String) -> Result<String, String> {
    let slot: Rc<RefCell<Option<String>>> = Rc::new(RefCell::new(None));
    let sink = slot.clone();
    let handler =
        CallDevToolsProtocolMethodCompletedHandler::create(Box::new(move |result, answer| {
            result?;
            *sink.borrow_mut() = Some(answer);
            Ok(())
        }));
    unsafe {
        webview.CallDevToolsProtocolMethod(&HSTRING::from(method), &HSTRING::from(params), &handler)
    }
    .map_err(|error| format!("画像を作れませんでした（{method}）: {error}"))?;

    if !pump_until(|| slot.borrow().is_some()) {
        return Err(format!(
            "画像を作れませんでした（{method} の返りがありません）。"
        ));
    }
    let answer = slot.borrow().clone();
    answer.ok_or_else(|| format!("画像を作れませんでした（{method}）。"))
}

/// 1 枚ぶんの撮影。専用の WebView2 を立てて撮り、閉じる。
fn shoot(html: &str, spec: &ShotSpec, user_data_dir: &Path) -> Result<Vec<u8>, String> {
    unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) }
        .ok()
        .map_err(|error| format!("{UNAVAILABLE}: {error}"))?;

    let outcome = shoot_inner(html, spec, user_data_dir);

    unsafe { CoUninitialize() };
    outcome
}

fn shoot_inner(html: &str, spec: &ShotSpec, user_data_dir: &Path) -> Result<Vec<u8>, String> {
    let hwnd = create_hidden_window()?;
    // 途中で断っても畳まれるよう、作った直後に後片付けへ預ける。
    let _window = HiddenWindow(hwnd);

    let environment = create_environment(user_data_dir)?;
    let controller = create_controller(&environment, hwnd)?;
    unsafe {
        controller.SetBounds(RECT {
            left: 0,
            top: 0,
            right: WINDOW_W,
            bottom: WINDOW_H,
        })
    }
    .map_err(|error| format!("{UNAVAILABLE}: {error}"))?;
    let webview =
        unsafe { controller.CoreWebView2() }.map_err(|error| format!("{UNAVAILABLE}: {error}"))?;

    let done = Rc::new(RefCell::new(false));
    let sink = done.clone();
    let handler = NavigationCompletedEventHandler::create(Box::new(move |_, _| {
        *sink.borrow_mut() = true;
        Ok(())
    }));
    let mut token = Default::default();
    unsafe { webview.add_NavigationCompleted(&handler, &mut token) }
        .map_err(|error| format!("画像を作れませんでした: {error}"))?;
    unsafe { webview.NavigateToString(&HSTRING::from(html)) }
        .map_err(|error| format!("画像を作れませんでした: {error}"))?;
    if !pump_until(|| *done.borrow()) {
        return Err("画像を作れませんでした（描画が終わりません）。".into());
    }

    call(
        &webview,
        "Emulation.setDeviceMetricsOverride",
        metrics_params(spec),
    )?;
    if wants_transparency(spec) {
        call(
            &webview,
            "Emulation.setDefaultBackgroundColorOverride",
            transparent_background_params(),
        )?;
    }
    let answer = call(&webview, "Page.captureScreenshot", screenshot_params(spec))?;

    let parsed: serde_json::Value = serde_json::from_str(&answer)
        .map_err(|error| format!("画像を作れませんでした: {error}"))?;
    let encoded = parsed
        .get("data")
        .and_then(|value| value.as_str())
        .ok_or("画像を作れませんでした（中身が返りませんでした）。")?;
    let bytes = STANDARD
        .decode(encoded)
        .map_err(|error| format!("画像を作れませんでした: {error}"))?;

    unsafe { controller.Close() }.map_err(|error| format!("後片付けに失敗しました: {error}"))?;
    Ok(bytes)
}

/// HTML を画像にする。
///
/// `user_data_dir` は WebView2 が使う作業場所。アプリの持ち物の中を渡す。
pub fn capture(html: &str, spec: &ShotSpec, user_data_dir: &Path) -> Result<Vec<u8>, String> {
    // 通せない注文は、道具を立ち上げる前に断る。
    validate(spec)?;

    // WebView2 は自分の筋（STA）とメッセージの回りを要る。アプリ本体の筋は別の回り方を
    // しているので、撮るときだけ専用の筋を立てる。
    let html = html.to_string();
    let spec = spec.clone();
    let user_data_dir = user_data_dir.to_path_buf();
    std::thread::spawn(move || shoot(&html, &spec, &user_data_dir))
        .join()
        .map_err(|_| "画像を作れませんでした（撮影が異常終了しました）。".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::capture_logic::ImageFormat;

    /// PNG の IHDR から幅・高さ・カラータイプを読む。
    /// 先頭 8 バイトが署名、続く 8 バイトが長さとチャンク名、その後が本体。
    fn png_head(bytes: &[u8]) -> Option<(u32, u32, u8)> {
        if bytes.len() < 26 || &bytes[0..8] != b"\x89PNG\r\n\x1a\n" || &bytes[12..16] != b"IHDR" {
            return None;
        }
        let width = u32::from_be_bytes(bytes[16..20].try_into().ok()?);
        let height = u32::from_be_bytes(bytes[20..24].try_into().ok()?);
        Some((width, height, bytes[25]))
    }

    /// WebView2 の作業場所は、テストごとに分ける。
    ///
    /// 同じフォルダを 2 つの WebView2 が同時に開くことはできない。断られるだけなら
    /// 見送りとして扱えるが、実際には**プロセスごと落ちる**（テストは並列に走るので、
    /// 撮るテストが 3 本重なると時々そうなる）。落ちた側は結果を報告しないまま消えるため、
    /// 一覧には「まだ走っていないテスト」だけが残り、どれが原因かは出てこない。
    fn work_dir(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "md-business-capture-test-{}-{name}",
            std::process::id()
        ))
    }

    /// WebView2 そのものが無い環境（ランタイム未導入・画面の無いセッション）では
    /// 撮れないのが当たり前なので、失敗ではなく見送りとして扱う。
    /// 用意できたのに撮れなかった場合だけを失敗にする。
    fn skipped(message: &str) -> bool {
        message.starts_with(UNAVAILABLE)
    }

    #[test]
    fn 窓の大きさに縛られず倍率も効く() {
        let html = r#"<!doctype html><meta charset="utf-8">
<style>html,body{margin:0}.a{width:100%;height:100vh;background:#2a4d7a}</style><div class="a"></div>"#;
        let spec = ShotSpec {
            width: 1200,
            height: 630,
            scale: 2.0,
            format: ImageFormat::Png { transparent: false },
        };
        match capture(html, &spec, &work_dir("scale")) {
            // 撮る窓は 1200×630 より小さい。それでも 2 倍の 2400×1260 が出る。
            Ok(bytes) => assert_eq!(png_head(&bytes).map(|(w, h, _)| (w, h)), Some((2400, 1260))),
            Err(message) if skipped(&message) => eprintln!("見送り: {message}"),
            Err(message) => panic!("{message}"),
        }
    }

    #[test]
    fn 透過を頼むとアルファが付く() {
        let html = r#"<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;background:transparent}.a{width:100px;height:100px;background:#b91c1c}</style><div class="a"></div>"#;
        let spec = ShotSpec {
            width: 400,
            height: 200,
            scale: 1.0,
            format: ImageFormat::Png { transparent: true },
        };
        match capture(html, &spec, &work_dir("alpha")) {
            // カラータイプ 6 = RGBA。背景を抜かないと 2（RGB）になる。
            Ok(bytes) => assert_eq!(png_head(&bytes).map(|(_, _, kind)| kind), Some(6)),
            Err(message) if skipped(&message) => eprintln!("見送り: {message}"),
            Err(message) => panic!("{message}"),
        }
    }

    #[test]
    fn jpeg_で頼むと_jpeg_が返る() {
        let html = r#"<!doctype html><meta charset="utf-8"><body style="background:#eee">"#;
        let spec = ShotSpec {
            width: 200,
            height: 100,
            scale: 1.0,
            format: ImageFormat::Jpeg { quality: 85 },
        };
        match capture(html, &spec, &work_dir("jpeg")) {
            Ok(bytes) => {
                assert_eq!(&bytes[0..2], &[0xff, 0xd8], "JPEG の先頭ではない");
                assert!(png_head(&bytes).is_none(), "PNG が返っている");
            }
            Err(message) if skipped(&message) => eprintln!("見送り: {message}"),
            Err(message) => panic!("{message}"),
        }
    }

    #[test]
    fn 通せない注文は撮る前に断る() {
        let spec = ShotSpec {
            width: 0,
            height: 630,
            scale: 1.0,
            format: ImageFormat::Png { transparent: false },
        };
        let message = capture("<p>x</p>", &spec, &work_dir("reject")).expect_err("断るはず");
        assert!(message.contains("1 以上"), "{message}");
    }
}
