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

use std::cell::{Cell, RefCell};
use std::path::Path;
use std::rc::Rc;
use std::time::{Duration, Instant};

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use webview2_com::Microsoft::Web::WebView2::Win32::{
    CreateCoreWebView2EnvironmentWithOptions, ICoreWebView2, ICoreWebView2Controller,
    ICoreWebView2Environment, COREWEBVIEW2_WEB_RESOURCE_CONTEXT_DOCUMENT,
};
use webview2_com::{
    CallDevToolsProtocolMethodCompletedHandler, CreateCoreWebView2ControllerCompletedHandler,
    CreateCoreWebView2EnvironmentCompletedHandler, NavigationCompletedEventHandler,
    NavigationStartingEventHandler, WebResourceRequestedEventHandler,
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

    lock_down(&webview, &environment)?;

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

/// 撮る webview を、渡した HTML を 1 枚描くだけのものにする。
///
/// 撮る HTML は呼ぶ側で既に組み上がっている（図は画像に、本文は無害化済み）。描かせるのに
/// 脚本は要らない。ここで止めておけば、呼ぶ側が何を渡しても、撮る道具が脚本を走らせたり
/// よそのページへ移ったりすることは無い。
///
/// 画像や字など、描くための読み込みは止めない。本文が外の画像を指していれば、
/// 下見と同じく写るのが正しい出来上がりなので。
fn lock_down(
    webview: &ICoreWebView2,
    environment: &ICoreWebView2Environment,
) -> Result<(), String> {
    let fail = |error: windows::core::Error| format!("画像を作れませんでした: {error}");
    let settings = unsafe { webview.Settings() }.map_err(fail)?;
    unsafe {
        settings.SetIsScriptEnabled(false).map_err(fail)?;
        settings.SetIsWebMessageEnabled(false).map_err(fail)?;
        settings
            .SetAreDefaultScriptDialogsEnabled(false)
            .map_err(fail)?;
    }

    // 移ってよいのは、渡した HTML を開く最初の 1 回だけ。meta refresh などで
    // 別のページへ移ろうとしたら断る。
    let opened = Rc::new(Cell::new(false));
    let navigation = NavigationStartingEventHandler::create(Box::new(move |_, args| {
        if opened.replace(true) {
            if let Some(args) = args {
                unsafe { args.SetCancel(true) }?
            }
        }
        Ok(())
    }));
    // 枠の中身はどれも読まない（撮る HTML に枠を使う理由が無い）。
    let frame = NavigationStartingEventHandler::create(Box::new(|_, args| {
        if let Some(args) = args {
            unsafe { args.SetCancel(true) }?;
        }
        Ok(())
    }));
    // 移るのを断っても、行き先への頼み自体は先に出ていく。ページとして読む頼みは
    // 外へ出る前にここで止める（渡した HTML は data: で開くので、ここには来ない）。
    let refusal =
        unsafe { environment.CreateWebResourceResponse(None, 403, w!("Forbidden"), w!("")) }
            .map_err(fail)?;
    let document = WebResourceRequestedEventHandler::create(Box::new(move |_, args| {
        if let Some(args) = args {
            unsafe { args.SetResponse(&refusal) }?;
        }
        Ok(())
    }));
    let mut token = Default::default();
    unsafe { webview.add_NavigationStarting(&navigation, &mut token) }.map_err(fail)?;
    unsafe { webview.add_FrameNavigationStarting(&frame, &mut token) }.map_err(fail)?;
    unsafe {
        webview.AddWebResourceRequestedFilter(w!("*"), COREWEBVIEW2_WEB_RESOURCE_CONTEXT_DOCUMENT)
    }
    .map_err(fail)?;
    unsafe { webview.add_WebResourceRequested(&document, &mut token) }.map_err(fail)?;
    Ok(())
}

/// 撮るのは 1 度に 1 枚ずつ。
///
/// WebView2 を立てるところが同じプロセスの中で重なると、**断りが返るのではなくプロセスごと落ちる**
/// （Chromium 側が自分で止める。返り値が無いので、呼んだ側は何も受け取れない）。窓は複数開けるし
/// エージェントからの頼みも同時に来るので、重なりは普通に起こる。待たせるほうが、落ちて何も
/// 返らないよりよい。
static TURN: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// 順番を待ってから `job` を通す。
///
/// 前の撮影が途中で落ちて鍵が汚れていても、通す。汚れているのは前の 1 枚の話で、
/// 次の 1 枚を撮れない理由にはならない（ここで断ると、一度失敗した後は撮れなくなる）。
fn in_turn<T>(job: impl FnOnce() -> T) -> T {
    let _turn = TURN.lock().unwrap_or_else(|poison| poison.into_inner());
    job()
}

/// HTML を画像にする。
///
/// `user_data_dir` は WebView2 が使う作業場所。アプリの持ち物の中を渡す。
pub fn capture(html: &str, spec: &ShotSpec, user_data_dir: &Path) -> Result<Vec<u8>, String> {
    // 通せない注文は、道具を立ち上げる前に断る（待つ前に断るので、順番も取らない）。
    validate(spec)?;

    // WebView2 は自分の筋（STA）とメッセージの回りを要る。アプリ本体の筋は別の回り方を
    // しているので、撮るときだけ専用の筋を立てる。
    let html = html.to_string();
    let spec = spec.clone();
    let user_data_dir = user_data_dir.to_path_buf();
    in_turn(move || {
        std::thread::spawn(move || shoot(&html, &spec, &user_data_dir))
            .join()
            .map_err(|_| "画像を作れませんでした（撮影が異常終了しました）。".to_string())?
    })
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

    /// 重なって撮ろうとしても、実際に撮っているのは常に 1 本であることを確かめる。
    ///
    /// 重なると落ちるのは WebView2 の中なので、落ちる側を書いて確かめることはできない
    /// （落ちたテストは結果を報告せずに消える）。代わりに、重なり得ないことのほうを見る。
    #[test]
    fn 撮るのは一度に一本だけ() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        use std::sync::Arc;

        let live = Arc::new(AtomicUsize::new(0));
        let most = Arc::new(AtomicUsize::new(0));
        let hands: Vec<_> = (0..8)
            .map(|_| {
                let live = live.clone();
                let most = most.clone();
                std::thread::spawn(move || {
                    in_turn(|| {
                        let now = live.fetch_add(1, Ordering::SeqCst) + 1;
                        most.fetch_max(now, Ordering::SeqCst);
                        std::thread::sleep(std::time::Duration::from_millis(5));
                        live.fetch_sub(1, Ordering::SeqCst);
                    })
                })
            })
            .collect();
        for hand in hands {
            hand.join().unwrap();
        }
        assert_eq!(most.load(Ordering::SeqCst), 1);
    }

    /// WebView2 の作業場所は、テストごとに分ける。
    ///
    /// 同じフォルダを 2 つの WebView2 が同時に開くことはできない。重なり自体は
    /// `in_turn` が止めているので、ここで分けるのは後始末を混ぜないためのもの
    /// （前のテストの残りを次のテストが読まないようにする）。
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

    /// 手元に待ち受けを 1 本立て、撮影中にそこへ頼みが届いたかで、描いた中身が
    /// 外へ出ようとしたかを見る。画素を読むより確かで、読み違えようが無い。
    fn knocked_while(job: impl FnOnce(u16) -> Result<Vec<u8>, String>) -> Option<bool> {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let port = listener.local_addr().unwrap().port();
        match job(port) {
            Ok(_) => {}
            Err(message) if skipped(&message) => {
                eprintln!("見送り: {message}");
                return None;
            }
            Err(message) => panic!("{message}"),
        }
        // 遅れて来る分も拾う（撮り終えてから届く頼みもある）。
        // 繋ぎに来ただけ（先回りの接続）は数えない。頼みの中身が届いたときだけ数える。
        let until = Instant::now() + Duration::from_secs(2);
        while Instant::now() < until {
            if let Ok((mut stream, _)) = listener.accept() {
                use std::io::Read;
                stream.set_nonblocking(false).unwrap();
                stream
                    .set_read_timeout(Some(Duration::from_millis(500)))
                    .unwrap();
                let mut head = [0u8; 16];
                if matches!(stream.read(&mut head), Ok(n) if n > 0) {
                    return Some(true);
                }
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        Some(false)
    }

    fn small_png() -> ShotSpec {
        ShotSpec {
            width: 200,
            height: 100,
            scale: 1.0,
            format: ImageFormat::Png { transparent: false },
        }
    }

    #[test]
    fn 描く中身の脚本は動かさない() {
        let knocked = knocked_while(|port| {
            let html = format!(
                r#"<!doctype html><meta charset="utf-8"><body><script>fetch("http://127.0.0.1:{port}/")</script>"#
            );
            capture(&html, &small_png(), &work_dir("script"))
        });
        assert_ne!(knocked, Some(true), "脚本が動いて外へ出ようとした");
    }

    #[test]
    fn 描く中身からよそへ移らない() {
        let knocked = knocked_while(|port| {
            let html = format!(
                r#"<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=http://127.0.0.1:{port}/"><body>x"#
            );
            capture(&html, &small_png(), &work_dir("navigate"))
        });
        assert_ne!(knocked, Some(true), "別のページへ移ろうとした");
    }

    /// 止めるのは脚本と移動だけ。本文が外の画像を指していれば、下見と同じく読みに行く。
    ///
    /// 画像は読み終わるまで描き終わらないので、ここでは待ち受けが返事まで返す
    /// （返さないと、撮影が期限まで待ってから断る）。
    #[test]
    fn 描くための読み込みは止めない() {
        use std::io::{Read, Write};
        use std::sync::atomic::{AtomicBool, Ordering};
        use std::sync::Arc;

        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let asked = Arc::new(AtomicBool::new(false));
        let seen = asked.clone();
        std::thread::spawn(move || {
            for mut stream in listener.incoming().flatten() {
                let mut head = [0u8; 1024];
                if matches!(stream.read(&mut head), Ok(n) if n > 0) {
                    seen.store(true, Ordering::SeqCst);
                }
                let _ = stream.write_all(
                    b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                );
            }
        });

        let html = format!(
            r#"<!doctype html><meta charset="utf-8"><body><img src="http://127.0.0.1:{port}/a.png">"#
        );
        match capture(&html, &small_png(), &work_dir("image")) {
            Ok(_) => assert!(asked.load(Ordering::SeqCst), "画像を読みに行かなかった"),
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
