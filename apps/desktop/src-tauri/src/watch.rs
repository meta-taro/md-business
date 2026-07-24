//! ファイル監視の配線層（notify / Tauri ランタイム依存）。
//!
//! 純ロジック（分類・エコー抑制の判断）は [`crate::watch_logic`] に寄せてあり、ここは
//! notify の実イベントを受けて純ロジックへ橋渡しし、通過した変更を `workspace-file-changed`
//! イベントとしてフロントへ発行する「橋渡し」だけを持つ。notify の `EventKind` → [`RawEvent`]
//! の写像（[`map_event_kind`]）はここに置くが写像自体は純粋なので単体検査する。

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use notify::event::ModifyKind;
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, FileIdMap};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::watch_logic::{
    classify_event, is_recent_self_write, map_changes_dedup, prune_expired, RawEvent,
};

/// 連続イベントを束ねる待ち時間。保存直後の複数イベント（truncate→write→close 等）を 1 回に畳む。
const DEBOUNCE_MS: u64 = 300;
/// 自己書き込みをエコーとみなす有効期間。debounce + FS 遅延を吸収しつつ、直後の外部編集を
/// 取りこぼさない範囲に収める。
const SELF_WRITE_WINDOW: Duration = Duration::from_millis(2000);

/// ファイル監視の実行時状態。アプリ全体で 1 つを `manage` する。
///
/// - `debouncer`: 現在の監視ハンドル。`None` で監視停止。差し替え時は先に `None` を代入して
///   旧 watcher を Drop（スレッド停止）してから新規を入れる。
/// - `recent_writes`: 自分の保存の canonical パスと時刻。watcher が拾った自己書き込みを抑制する。
/// - `root`: 分類に使う canonical な監視ルート。notify が報告する絶対パスと接頭辞が揃う。
pub struct WatchState {
    debouncer: Mutex<Option<Debouncer<RecommendedWatcher, FileIdMap>>>,
    recent_writes: Mutex<Vec<(PathBuf, Instant)>>,
    root: Mutex<Option<PathBuf>>,
}

impl Default for WatchState {
    fn default() -> Self {
        WatchState {
            debouncer: Mutex::new(None),
            recent_writes: Mutex::new(Vec::new()),
            root: Mutex::new(None),
        }
    }
}

/// 自分の保存（`write_document` / `create_document` 成功）を記録し、直後に跳ね返る watcher
/// イベントを抑制できるようにする。`canon_path` は書き込んだファイルの canonical パス。
pub fn record_self_write(state: &WatchState, canon_path: PathBuf) {
    if let Ok(mut recent) = state.recent_writes.lock() {
        let now = Instant::now();
        prune_expired(&mut recent, now, SELF_WRITE_WINDOW);
        recent.push((canon_path, now));
    }
}

/// notify の `EventKind` を、判断に必要な粒度の [`RawEvent`] へ写す（純関数）。
///
/// 作成 / 削除 / リネームはツリー構造が変わるため rescan 系、内容変更は modified に写す。
/// メタデータのみ（タイムスタンプ・権限）とアクセスは画面反映に無関係なので `Other`（無視）。
/// 種別不明（`Any`）は取りこぼしを避けるため内容変更寄りに倒す。
pub fn map_event_kind(kind: &EventKind) -> RawEvent {
    match kind {
        EventKind::Create(_) => RawEvent::Created,
        EventKind::Remove(_) => RawEvent::Removed,
        EventKind::Modify(ModifyKind::Name(_)) => RawEvent::Renamed,
        EventKind::Modify(ModifyKind::Metadata(_)) => RawEvent::Other,
        EventKind::Modify(_) => RawEvent::Modified,
        EventKind::Any => RawEvent::Modified,
        EventKind::Access(_) | EventKind::Other => RawEvent::Other,
    }
}

/// debouncer から届いたイベント束を分類し、自己書き込みを除いた変更を発行する。
///
/// panic は `panic = "abort"`（release）で即プロセス終了に直結するため、この経路では
/// unwrap を使わず、ロック失敗・ルート未設定は「何もしない」で優雅に抜ける。
fn handle_debounced(app: &AppHandle, res: DebounceEventResult) {
    // 監視エラー（束）は起動をブロックしない方針で握りつぶす（劣化＝通知が来ないだけ）。
    let events = match res {
        Ok(events) => events,
        Err(_errors) => return,
    };
    let state = app.state::<WatchState>();

    let root = match state.root.lock() {
        Ok(guard) => match guard.as_ref() {
            Some(r) => r.clone(),
            None => return, // 監視ルート未設定
        },
        Err(_) => return,
    };

    let now = Instant::now();
    // 期限切れを掃除しつつ、この束の判定に使うスナップショットを取る。
    let recent: Vec<(PathBuf, Instant)> = match state.recent_writes.lock() {
        Ok(mut guard) => {
            prune_expired(&mut guard, now, SELF_WRITE_WINDOW);
            guard.clone()
        }
        Err(_) => return,
    };

    let mut changes = Vec::new();
    for ev in &events {
        let raw = map_event_kind(&ev.event.kind);
        if raw == RawEvent::Other {
            continue;
        }
        // 自己書き込み由来のパスを除外してから分類する。
        let paths: Vec<PathBuf> = ev
            .event
            .paths
            .iter()
            .filter(|p| !is_recent_self_write(p, &recent, now, SELF_WRITE_WINDOW))
            .cloned()
            .collect();
        if paths.is_empty() {
            continue;
        }
        changes.extend(classify_event(raw, &paths, &root));
    }

    // 同一 relPath+kind の重複を畳んでから発行（束内に重複が出やすい）。
    for change in map_changes_dedup(changes) {
        let _ = app.emit("workspace-file-changed", &change);
    }
}

/// `root` の再帰監視を開始する。既存の監視は先に停止してから張り替える（フォルダ切替対応）。
/// 分類・エコー抑制のパス比較を合わせるため、canonical な root を保存して監視する。
#[tauri::command]
pub fn watch_workspace(
    app: AppHandle,
    state: State<WatchState>,
    root: String,
) -> Result<(), String> {
    let canon_root =
        std::fs::canonicalize(&root).map_err(|e| format!("監視ルート解決失敗: {}", e))?;

    // 旧 watcher を Drop してから新規を張る（スレッドの二重起動を避ける）。
    {
        let mut deb = state
            .debouncer
            .lock()
            .map_err(|_| "監視状態のロック失敗".to_string())?;
        *deb = None;
    }
    {
        let mut r = state
            .root
            .lock()
            .map_err(|_| "監視ルートのロック失敗".to_string())?;
        *r = Some(canon_root.clone());
    }

    let app_for_cb = app.clone();
    let mut debouncer = new_debouncer(
        Duration::from_millis(DEBOUNCE_MS),
        None,
        move |res: DebounceEventResult| handle_debounced(&app_for_cb, res),
    )
    .map_err(|e| format!("監視の初期化失敗: {}", e))?;
    debouncer
        .watcher()
        .watch(&canon_root, RecursiveMode::Recursive)
        .map_err(|e| format!("監視の開始失敗: {}", e))?;
    // リネーム追跡のため file-id キャッシュにも監視ルートを登録する。
    debouncer
        .cache()
        .add_root(&canon_root, RecursiveMode::Recursive);

    let mut deb = state
        .debouncer
        .lock()
        .map_err(|_| "監視状態のロック失敗".to_string())?;
    *deb = Some(debouncer);
    Ok(())
}

/// 監視を停止する（フォルダを閉じた時など）。多重呼び出し・未監視でも安全。
#[tauri::command]
pub fn unwatch_workspace(state: State<WatchState>) -> Result<(), String> {
    let mut deb = state
        .debouncer
        .lock()
        .map_err(|_| "監視状態のロック失敗".to_string())?;
    *deb = None;
    if let Ok(mut r) = state.root.lock() {
        *r = None;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{
        AccessKind, CreateKind, DataChange, MetadataKind, ModifyKind, RemoveKind, RenameMode,
    };

    #[test]
    fn 作成イベントはcreatedに写す() {
        assert_eq!(
            map_event_kind(&EventKind::Create(CreateKind::File)),
            RawEvent::Created
        );
    }

    #[test]
    fn 削除イベントはremovedに写す() {
        assert_eq!(
            map_event_kind(&EventKind::Remove(RemoveKind::File)),
            RawEvent::Removed
        );
    }

    #[test]
    fn リネームはrenamedに写す() {
        assert_eq!(
            map_event_kind(&EventKind::Modify(ModifyKind::Name(RenameMode::Both))),
            RawEvent::Renamed
        );
    }

    #[test]
    fn 内容変更はmodifiedに写す() {
        assert_eq!(
            map_event_kind(&EventKind::Modify(ModifyKind::Data(DataChange::Content))),
            RawEvent::Modified
        );
    }

    #[test]
    fn メタデータのみの変更は無視する() {
        assert_eq!(
            map_event_kind(&EventKind::Modify(ModifyKind::Metadata(
                MetadataKind::WriteTime
            ))),
            RawEvent::Other
        );
    }

    #[test]
    fn アクセスイベントは無視する() {
        assert_eq!(
            map_event_kind(&EventKind::Access(AccessKind::Read)),
            RawEvent::Other
        );
    }

    #[test]
    fn 種別不明modify_anyは内容変更寄りに倒す() {
        assert_eq!(
            map_event_kind(&EventKind::Modify(ModifyKind::Any)),
            RawEvent::Modified
        );
        // イベント全体の Any も、取りこぼしを避けて modified 扱い。
        assert_eq!(map_event_kind(&EventKind::Any), RawEvent::Modified);
    }
}
