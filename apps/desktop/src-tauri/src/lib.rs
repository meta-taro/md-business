mod capture;
pub mod capture_logic;
#[cfg(windows)]
mod capture_win;
mod deep_link;
mod fileinfo;
mod git;
mod image;
pub mod image_logic;
mod logscan;
mod mcp;
mod mcp_logic;
mod open_arg;
mod preview_server;
mod preview_server_logic;
mod trust;
mod trust_logic;
mod watch;
mod watch_logic;
mod workspace;

/// アプリのエントリポイント。main / モバイル entry から共有される。
/// Git / フォージ / PDF / MCP の Tauri command はこの Builder に順次登録する（Phase 3-4）。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    // 二重起動の抑止は最初に登録する（後続のプラグインが立ち上がる前に決める必要がある）。
    // 既に動いていれば、こちらのプロセスは引数を渡して終わる。
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
        open_arg::handle_second_instance(app, &argv);
    }));
    // 共有リンク（md-business://...）の受け口。single-instance より後に登録する
    // （既に動いているときは、そちらが窓を決めてからリンクが回ってくる）。
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_deep_link::init());
    builder
        // フォルダ選択（tauri-plugin-dialog）。権限は capability で open のみに絞る（設計書 §8.2）。
        .plugin(tauri_plugin_dialog::init())
        // 更新適用後の再起動に使うプロセス制御プラグイン。
        .plugin(tauri_plugin_process::init())
        // 外部リンク（リポジトリ / 操作マニュアル）を既定ブラウザで開く。権限は open-url のみ。
        .plugin(tauri_plugin_opener::init())
        // ファイル監視の実行時状態（watcher ハンドル / 自己書き込み記録 / 監視ルート）。
        .manage(watch::WatchState::default())
        // 組み込み MCP サーバー（サイドカー）の実行時状態。
        .manage(mcp::McpRuntime::default())
        // ブラウザ表示用ローカルサーバーの実行時状態（立っているのは 0 個か 1 個）。
        .manage(preview_server::PreviewServerState::default())
        // 起動引数で頼まれたファイル（画面が受け取りに来るまでの預かり）。
        .manage(open_arg::PendingOpen::default())
        // 共有リンクで頼まれた文書（同上）。
        .manage(deep_link::PendingLink::default())
        .setup(|app| {
            // 自動アップデータはデスクトップのみ対応。AppHandle 確定後に登録する。
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            // MCP は付加機能。起動に失敗しても劣化表示に留め、setup は成功させる。
            mcp::start(app.handle());
            // 起動引数で開くよう頼まれていれば預かる（画面ができてから取りに来る）。
            open_arg::remember_startup_args(app.handle());
            #[cfg(desktop)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                // 配布物では OS への登録をインストーラが行う。開発ビルドにはインストーラが
                // 無いので、その場合だけ自分で登録する（登録先はこのビルドの実行ファイル）。
                #[cfg(all(debug_assertions, any(windows, target_os = "linux")))]
                let _ = app.deep_link().register_all();
                // 起動のきっかけが共有リンクだった場合の分。
                deep_link::remember_startup_link(app.handle());
                // 起動した後に届く分（既に動いている窓へ回ってくる）。
                let handle = app.handle().clone();
                app.deep_link().on_open_url(move |event| {
                    if let Some(url) = event.urls().first() {
                        deep_link::remember(&handle, url.as_str());
                    }
                });
            }
            Ok(())
        })
        // 文書ツリーの走査 / 読込 / 書込コマンド（設計書 §5）。
        .invoke_handler(tauri::generate_handler![
            workspace::scan_documents,
            workspace::scan_site_assets,
            workspace::read_document,
            workspace::read_project_config,
            workspace::set_web_mode,
            workspace::write_document,
            workspace::create_document,
            workspace::rename_entry,
            workspace::directory_exists,
            workspace::export_html,
            workspace::export_site,
            capture::export_image,
            image::read_image,
            watch::watch_workspace,
            watch::unwatch_workspace,
            git::git_status,
            git::git_branches,
            git::git_switch,
            git::git_switch_create,
            git::git_commit,
            git::git_push,
            git::publish_survey,
            git::git_pull,
            git::git_diff,
            git::git_blame,
            git::git_show,
            git::git_log,
            git::git_init,
            git::git_clone,
            git::forge_file_url,
            git::git_identity,
            git::git_file_state,
            fileinfo::file_stat,
            fileinfo::file_digest,
            logscan::read_file_lines,
            logscan::scan_logs,
            mcp::mcp_status,
            mcp::mcp_set_root,
            mcp::mcp_respond,
            mcp::mcp_write_client_config,
            mcp::mcp_client_config,
            mcp::mcp_retry,
            open_arg::take_open_request,
            deep_link::take_link_request,
            preview_server::start_preview_server,
            preview_server::update_preview_server,
            preview_server::refresh_preview_asset,
            preview_server::stop_preview_server,
            preview_server::preview_server_status,
            preview_server::open_preview_in_browser,
            preview_server::installed_browsers,
            preview_server::exported_site_csp,
            trust::project_trust_status,
            trust::grant_project_trust,
            trust::revoke_project_trust
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| {
            // 終了時に外へ出したものを畳む。放置すると子プロセスが孤児として残り、
            // ブラウザ表示の待ち受けもポートを掴んだままになりうる。
            if let tauri::RunEvent::Exit = event {
                mcp::shutdown(app);
                preview_server::shutdown(app);
            }
        });
}
