/// アプリのエントリポイント。main / モバイル entry から共有される。
/// Git / フォージ / PDF / MCP の Tauri command はこの Builder に順次登録する（Phase 3-4）。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
