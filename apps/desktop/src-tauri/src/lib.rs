mod git;
mod workspace;

/// アプリのエントリポイント。main / モバイル entry から共有される。
/// Git / フォージ / PDF / MCP の Tauri command はこの Builder に順次登録する（Phase 3-4）。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // フォルダ選択（tauri-plugin-dialog）。権限は capability で open のみに絞る（設計書 §8.2）。
        .plugin(tauri_plugin_dialog::init())
        // 文書ツリーの走査 / 読込 / 書込コマンド（設計書 §5）。
        .invoke_handler(tauri::generate_handler![
            workspace::scan_documents,
            workspace::read_document,
            workspace::write_document,
            git::git_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
