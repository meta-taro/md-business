// UI シェルの文言辞書（en / ja / zh / ko）。
// Messages インターフェースで全キーを固定し、各ロケール辞書を Messages 型に縛ることで
// 「あるロケールだけキー欠落」をコンパイルエラーとして検出する。
import type { Locale } from './locales';

/**
 * 翻訳キーの一覧。ドット区切りの平坦キー。
 * 値内の {name} はプレースホルダ（translate の interpolate が差し込む）。
 */
export interface Messages {
  // アプリ全体・タイトルバー
  'app.docPlaceholder': string;
  'app.unsaved': string;
  'app.unsavedLong': string;
  // 汎用
  'common.close': string;
  // 主要アクション
  'action.save': string;
  'action.saving': string;
  'action.saveTitle': string;
  'action.pdf': string;
  'action.pdfExport': string;
  'action.pdfTitle': string;
  'action.theme': string;
  'action.themeToLight': string;
  'action.themeToDark': string;
  'action.help': string;
  'action.autosave': string;
  'action.autosaveOn': string;
  'action.autosaveOff': string;
  'state.on': string;
  'state.off': string;
  // ウィンドウコントロール
  'window.minimize': string;
  'window.maximize': string;
  'window.restore': string;
  'window.close': string;
  // 言語セレクタ
  'lang.label': string;
  // 検索バー（エディター / プレビュー共通）
  'search.placeholder': string;
  'search.caseSensitive': string;
  'search.regex': string;
  'search.wholeWord': string;
  'search.previous': string;
  'search.next': string;
  'search.close': string;
  'search.noMatches': string;
  'search.count': string;
  'search.inEditor': string;
  'search.inPreview': string;
  // ステータスバー（Git / ブランチ / ソース管理 / forge / MCP）
  'status.branchSwitchTitle': string;
  'status.branchSwitchLabel': string;
  'status.branchSwitchFailed': string;
  'status.noLocalBranches': string;
  'status.aheadBehindTitle': string;
  'status.changeCount': string;
  'status.noRepo': string;
  'status.sourceControlTitle': string;
  'status.sourceControl': string;
  'status.forge': string;
  'status.mcpReady': string;
  'status.mcpStarting': string;
  'status.mcpOff': string;
  'status.saving': string;
  'status.unsaved': string;
  'status.savedAt': string;
  'status.savedAtTitle': string;
  // 下部ソース管理ドロワー（コミット / プッシュ / プル）
  'scm.closePanel': string;
  'scm.pullTitle': string;
  'scm.pushTitle': string;
  'scm.failed': string;
  'scm.pushed': string;
  'scm.pulled': string;
  'scm.committed': string;
  'scm.changes': string;
  'scm.noChanges': string;
  'scm.fileRowTitle': string;
  'scm.commitHead': string;
  'scm.messagePlaceholder': string;
  'scm.working': string;
  'scm.commit': string;
  'scm.commitCount': string;
  'scm.stageHint': string;
  'diff.label': string;
  'diff.backToPreviewTitle': string;
  'diff.backToPreview': string;
  'diff.loading': string;
  'diff.failed': string;
  'diff.none': string;
  // 左レール（ファイルツリー / エクスプローラー）
  'tree.label': string;
  'tree.expandExplorer': string;
  'tree.collapseExplorer': string;
  'tree.explorer': string;
  'tree.openOtherFolder': string;
  'tree.filterPlaceholder': string;
  'tree.filterClearTitle': string;
  'tree.filterClear': string;
  'tree.emptyHint': string;
  'tree.loading': string;
  'tree.openFolder': string;
  'tree.filterNoMatch': string;
  'tree.noFiles': string;
  'tree.truncated': string;
  // 左レールの右クリックメニュー（reveal / パスコピー / リモートで開く）
  'tree.recent': string;
  'tree.recentPick': string;
  'tree.recentMissing': string;
  'tree.recentForget': string;
  'tree.recentLastFile': string;
  'tree.restored': string;
  'tree.menuRename': string;
  'tree.menuReveal': string;
  'tree.menuCopyName': string;
  'tree.menuCopyRelPath': string;
  'tree.menuCopyPath': string;
  'tree.menuOpenForge': string;
  'tree.renameHint': string;
  'tree.renameErrorEmpty': string;
  'tree.renameErrorSeparator': string;
  'tree.renameErrorInvalidChar': string;
  'tree.renameErrorExtension': string;
  // Git 変更状態（ツリーのバッジ説明）
  'git.state.modified': string;
  'git.state.added': string;
  'git.state.untracked': string;
  'git.state.deleted': string;
  'git.state.renamed': string;
  'git.state.conflicted': string;
  // 右パネル（Git / AI / MCP）
  'panel.label': string;
  'panel.collapse': string;
  'panel.expand': string;
  'panel.hint': string;
  // MCP タブ（組み込みサーバーの接続状態・操作ログ）
  'mcp.starting': string;
  'mcp.copyToken': string;
  'mcp.copied': string;
  'mcp.copyConfig': string;
  'mcp.copiedConfig': string;
  'mcp.howto': string;
  'mcp.howtoStep1': string;
  'mcp.howtoStep2': string;
  'mcp.howtoStep3': string;
  'mcp.howtoNote': string;
  'mcp.logsEmpty': string;
  'mcp.logsDisabled': string;
  'mcp.reason.sidecarMissing': string;
  'mcp.reason.nodeMissing': string;
  'mcp.reason.spawnFailed': string;
  'mcp.reason.noOutput': string;
  'mcp.reason.exitedEarly': string;
  'mcp.reason.serverError': string;
  'mcp.reason.statusUnreadable': string;
  'mcp.reason.unknown': string;
  // ヘルプポップオーバー
  'help.title': string;
  'help.desktopEdition': string;
  'help.checkUpdate': string;
  'help.manual': string;
  'help.shortcuts': string;
  'help.shortcutsGrid': string;
  'help.scGridEdit': string;
  'help.scGridSelect': string;
  'help.scGridSelectAll': string;
  'help.scGridCopy': string;
  'help.scGridPaste': string;
  'help.scGridUndo': string;
  'help.scGridExitFullscreen': string;
  'help.license': string;
  'help.repository': string;
  'help.openInBrowser': string;
  // レイアウト（レール幅ディバイダ）
  'layout.railDividerLabel': string;
  // 中央（エディター↔プレビュー分割・競合バナー・グリッド）
  'page.conflictChanged': string;
  'page.conflictReload': string;
  'page.conflictKeep': string;
  'page.editorHead': string;
  'page.editorPaneLabel': string;
  'page.previewPaneLabel': string;
  'page.dividerLabel': string;
  'page.diffHead': string;
  'page.gridHead': string;
  'page.gridFullscreenTitle': string;
  'page.gridRestoreTitle': string;
  'page.gridFullscreenBtn': string;
  'page.gridRestoreBtn': string;
  'page.previewHead': string;
  'page.previewTitle': string;
  'page.frontmatterHint': string;
  'frontmatter.failed': string;
  'frontmatter.atLine': string;
  'frontmatter.indentation': string;
  'frontmatter.tab': string;
  'frontmatter.duplicateKey': string;
  'frontmatter.unterminated': string;
  'frontmatter.blockMapping': string;
  'frontmatter.tooLarge': string;
  'frontmatter.tooManyAnchors': string;
  'frontmatter.tooManyAliases': string;
  'frontmatter.unknown': string;
}

/** 翻訳キー型（t() の引数に使う）。 */
export type MessageKey = keyof Messages;

const en: Messages = {
  'app.docPlaceholder': 'Select a document',
  'app.unsaved': 'Unsaved',
  'app.unsavedLong': 'You have unsaved changes',
  'common.close': 'Close',
  'action.save': 'Save',
  'action.saving': 'Saving…',
  'action.saveTitle': 'Save (Ctrl+S / ⌘S)',
  'action.pdf': 'PDF',
  'action.pdfExport': 'Export PDF',
  'action.pdfTitle': 'Export PDF (Ctrl+P / ⌘P — print the preview as A4)',
  'action.theme': 'Theme',
  'action.themeToLight': 'Switch to light theme',
  'action.themeToDark': 'Switch to dark theme',
  'action.help': 'Help',
  'action.autosave': 'Autosave',
  'action.autosaveOn': 'Autosave: on — click to turn off',
  'action.autosaveOff': 'Autosave: off — click to turn on',
  'state.on': 'On',
  'state.off': 'Off',
  'window.minimize': 'Minimize',
  'window.maximize': 'Maximize',
  'window.restore': 'Restore',
  'window.close': 'Close',
  'lang.label': 'Language',
  'search.placeholder': 'Search',
  'search.caseSensitive': 'Match case',
  'search.regex': 'Regular expression',
  'search.wholeWord': 'Whole word',
  'search.previous': 'Previous match',
  'search.next': 'Next match',
  'search.close': 'Close',
  'search.noMatches': 'No matches',
  'search.count': '{cur}/{total}',
  'search.inEditor': 'Editor',
  'search.inPreview': 'Preview',
  'status.branchSwitchTitle': 'Click to switch branch',
  'status.branchSwitchLabel': 'Switch branch',
  'status.branchSwitchFailed': 'Could not switch',
  'status.noLocalBranches': 'No local branches',
  'status.aheadBehindTitle': 'Commits ahead / behind remote',
  'status.changeCount': '{count} changes',
  'status.noRepo': 'No repository',
  'status.sourceControlTitle': 'Source control (commit / push / pull)',
  'status.sourceControl': 'Source control',
  'status.forge': 'forge: {name}',
  'status.mcpReady': 'MCP: running',
  'status.mcpStarting': 'MCP: starting',
  'status.mcpOff': 'MCP: stopped',
  'status.saving': 'Saving…',
  'status.unsaved': 'Unsaved changes',
  'status.savedAt': 'Saved at {time}',
  'status.savedAtTitle': 'Time of the last successful save of the open file',
  'scm.closePanel': 'Close source control',
  'scm.pullTitle': 'git pull --ff-only (fast-forward only)',
  'scm.pushTitle': 'git push (never --force; uses your system git credentials)',
  'scm.failed': 'Failed',
  'scm.pushed': 'Pushed',
  'scm.pulled': 'Pulled',
  'scm.committed': 'Committed {count} change(s)',
  'scm.changes': 'Changes',
  'scm.noChanges': 'No changes',
  'scm.fileRowTitle': '{path} (click to show the diff)',
  'scm.commitHead': 'Commit',
  'scm.messagePlaceholder': 'Describe the change (Ctrl/⌘+Enter to commit)',
  'scm.working': 'Working…',
  'scm.commit': 'Commit',
  'scm.commitCount': 'Commit {count}',
  'scm.stageHint': 'Stages every change (git add -A) and commits.',
  'diff.label': 'Diff view',
  'diff.backToPreviewTitle': 'Close the diff and go back to the preview',
  'diff.backToPreview': 'Back to preview',
  'diff.loading': 'Loading the diff…',
  'diff.failed': 'Could not load the diff',
  'diff.none': 'This file has no changes on disk (it matches what is saved and staged).',
  'tree.label': 'File tree',
  'tree.expandExplorer': 'Open explorer',
  'tree.collapseExplorer': 'Collapse explorer',
  'tree.explorer': 'Explorer',
  'tree.openOtherFolder': 'Open another folder',
  'tree.filterPlaceholder': 'Filter by file name',
  'tree.filterClearTitle': 'Clear filter (Esc)',
  'tree.filterClear': 'Clear filter',
  'tree.emptyHint': 'Open a folder to\nsee the document tree',
  'tree.loading': 'Loading…',
  'tree.openFolder': 'Open folder',
  'tree.filterNoMatch': 'No files match\n"{query}"',
  'tree.noFiles': 'No .md / .tsv\nfiles found',
  'tree.truncated': 'Showing partial results (limit reached)',
  'tree.recent': 'Recent folders',
  'tree.recentPick': 'Pick a recent folder',
  'tree.recentMissing': 'Not found',
  'tree.recentForget': 'Remove from list',
  'tree.recentLastFile': 'Last open: {file}',
  'tree.restored': 'Resumed where you left off',
  'tree.menuRename': 'Rename',
  'tree.menuReveal': 'Reveal in File Explorer',
  'tree.menuCopyName': 'Copy name',
  'tree.menuCopyRelPath': 'Copy relative path',
  'tree.menuCopyPath': 'Copy full path',
  'tree.menuOpenForge': 'Open on remote',
  'tree.renameHint': 'Enter to apply, Esc to cancel',
  'tree.renameErrorEmpty': 'Enter a name',
  'tree.renameErrorSeparator': 'A name cannot contain path separators',
  'tree.renameErrorInvalidChar': 'That name contains characters that cannot be used',
  'tree.renameErrorExtension': 'The extension must stay .md or .tsv',
  'git.state.modified': 'Modified (uncommitted)',
  'git.state.added': 'Staged addition',
  'git.state.untracked': 'Untracked (new)',
  'git.state.deleted': 'Deleted',
  'git.state.renamed': 'Renamed',
  'git.state.conflicted': 'Conflicted',
  'panel.label': 'Git / AI / MCP panel',
  'panel.collapse': 'Collapse panel',
  'panel.expand': 'Open panel',
  'panel.hint': 'Git diff, AI, and MCP logs\nwill appear in a later phase',
  'mcp.starting': 'Starting…',
  'mcp.copyToken': 'Copy access token',
  'mcp.copied': 'Token copied',
  'mcp.copyConfig': 'Copy client settings',
  'mcp.copiedConfig': 'Settings copied',
  'mcp.howto': 'How to connect an AI client',
  'mcp.howtoStep1': 'Press “Copy client settings” above.',
  'mcp.howtoStep2':
    'Paste them into the MCP settings of your AI client (Claude Code, Claude Desktop, Cursor, Cline and so on).',
  'mcp.howtoStep3':
    'The folder open in this window is what the AI reads and writes. Switch folders and the AI follows.',
  'mcp.howtoNote':
    'The address and access token stay the same the next time you start the app, so settings you pasted keep working.',
  'mcp.logsEmpty': 'Actions from your AI client will appear here',
  'mcp.logsDisabled': 'The server is not running, so no actions are recorded',
  'mcp.reason.sidecarMissing': 'MCP server files were not found',
  'mcp.reason.nodeMissing': 'Node was not found. Install Node to enable MCP',
  'mcp.reason.spawnFailed': 'The MCP server could not be started',
  'mcp.reason.noOutput': 'No output could be read from the MCP server',
  'mcp.reason.exitedEarly': 'The MCP server stopped before it was ready',
  'mcp.reason.serverError': 'The MCP server reported an error',
  'mcp.reason.statusUnreadable': 'The MCP status could not be read',
  'mcp.reason.unknown': 'Unavailable',
  'help.title': 'Help & version info',
  'help.desktopEdition': 'Desktop edition',
  'help.checkUpdate': 'Check for updates',
  'help.manual': 'User guide',
  'help.shortcuts': 'Keyboard shortcuts',
  'help.shortcutsGrid': 'Verification grid',
  'help.scGridEdit': 'Edit cell',
  'help.scGridSelect': 'Extend selection',
  'help.scGridSelectAll': 'Select whole table',
  'help.scGridCopy': 'Copy selection',
  'help.scGridPaste': 'Paste',
  'help.scGridUndo': 'Undo / redo',
  'help.scGridExitFullscreen': 'Leave full screen',
  'help.license': 'License',
  'help.repository': 'Repository',
  'help.openInBrowser': 'Open in browser',
  'layout.railDividerLabel': 'Resize explorer (double-click to reset width)',
  'page.conflictChanged': 'This file was changed externally',
  'page.conflictReload': 'Reload (discard edits)',
  'page.conflictKeep': 'Keep edits',
  'page.editorHead': 'Editor — Markdown',
  'page.editorPaneLabel': 'Markdown editor',
  'page.previewPaneLabel': 'Viewer (preview)',
  'page.dividerLabel': 'Resize editor and preview (double-click to reset to 50/50)',
  'page.diffHead': 'Diff — Git',
  'page.gridHead': 'Test sheet — grid editing',
  'page.gridFullscreenTitle': 'Show grid fullscreen',
  'page.gridRestoreTitle': 'Back to split view (Esc)',
  'page.gridFullscreenBtn': '⤢ Fullscreen',
  'page.gridRestoreBtn': '↙ Back to split',
  'page.previewHead': 'Preview',
  'page.previewTitle': '{label} preview',
  'page.frontmatterHint': 'Check the frontmatter format (the top block enclosed by ---)',
  'frontmatter.failed': 'Could not read the frontmatter. {detail}',
  'frontmatter.atLine': 'Line {line}: {detail}',
  'frontmatter.indentation': 'the indentation does not line up with the lines above.',
  'frontmatter.tab': 'a tab is used for indentation. Use spaces instead.',
  'frontmatter.duplicateKey': 'the same item name appears twice.',
  'frontmatter.unterminated': 'a quote or bracket was opened but never closed.',
  'frontmatter.blockMapping': 'this line is not written as `name: value`.',
  'frontmatter.tooLarge': 'the frontmatter block is too large to read.',
  'frontmatter.tooManyAnchors': 'too many YAML anchors (&name) are declared.',
  'frontmatter.tooManyAliases': 'too many YAML references (*name) are used.',
  'frontmatter.unknown': 'reading stopped here ({raw}).',
};

const ja: Messages = {
  'app.docPlaceholder': '文書を選択してください',
  'app.unsaved': '未保存',
  'app.unsavedLong': '未保存の変更があります',
  'common.close': '閉じる',
  'action.save': '保存',
  'action.saving': '保存中…',
  'action.saveTitle': '保存（Ctrl+S / ⌘S）',
  'action.pdf': 'PDF',
  'action.pdfExport': 'PDF 出力',
  'action.pdfTitle': 'PDF 出力（Ctrl+P / ⌘P・プレビューを A4 で印刷／保存）',
  'action.theme': 'テーマ',
  'action.themeToLight': 'ライトテーマに切替',
  'action.themeToDark': 'ダークテーマに切替',
  'action.help': 'ヘルプ',
  'action.autosave': '自動保存',
  'action.autosaveOn': '自動保存: オン（クリックでオフ）',
  'action.autosaveOff': '自動保存: オフ（クリックでオン）',
  'state.on': 'オン',
  'state.off': 'オフ',
  'window.minimize': '最小化',
  'window.maximize': '最大化',
  'window.restore': '元のサイズに戻す',
  'window.close': '閉じる',
  'lang.label': '言語',
  'search.placeholder': '検索',
  'search.caseSensitive': '大文字小文字を区別',
  'search.regex': '正規表現',
  'search.wholeWord': '単語単位',
  'search.previous': '前の一致',
  'search.next': '次の一致',
  'search.close': '閉じる',
  'search.noMatches': '一致なし',
  'search.count': '{cur}/{total}',
  'search.inEditor': 'エディター',
  'search.inPreview': 'プレビュー',
  'status.branchSwitchTitle': 'クリックでブランチを切り替え',
  'status.branchSwitchLabel': 'ブランチを切り替え',
  'status.branchSwitchFailed': '切り替えできませんでした',
  'status.noLocalBranches': 'ローカルブランチがありません',
  'status.aheadBehindTitle': 'リモートとの先行 / 遅延コミット数',
  'status.changeCount': '変更 {count}',
  'status.noRepo': 'リポジトリ未接続',
  'status.sourceControlTitle': 'ソース管理（コミット / プッシュ / プル）',
  'status.sourceControl': 'ソース管理',
  'status.forge': 'forge: {name}',
  'status.mcpReady': 'MCP: 稼働中',
  'status.mcpStarting': 'MCP: 起動中',
  'status.mcpOff': 'MCP: 停止中',
  'status.saving': '保存中…',
  'status.unsaved': '未保存の変更',
  'status.savedAt': '{time} に保存',
  'status.savedAtTitle': '開いているファイルを最後に保存できた時刻',
  'scm.closePanel': 'ソース管理を閉じる',
  'scm.pullTitle': 'git pull --ff-only（fast-forward のみ）',
  'scm.pushTitle': 'git push（--force なし・認証は OS の git 資格情報）',
  'scm.failed': '失敗しました',
  'scm.pushed': 'push しました',
  'scm.pulled': 'pull しました',
  'scm.committed': '{count} 件の変更をコミットしました',
  'scm.changes': '変更',
  'scm.noChanges': '変更はありません',
  'scm.fileRowTitle': '{path}（クリックで差分表示）',
  'scm.commitHead': 'コミット',
  'scm.messagePlaceholder': '変更の概要を入力（Ctrl/⌘+Enter でコミット）',
  'scm.working': '処理中…',
  'scm.commit': 'コミット',
  'scm.commitCount': '{count} 件をコミット',
  'scm.stageHint': '全変更をステージ（git add -A）してコミットします。',
  'diff.label': '差分ビュー',
  'diff.backToPreviewTitle': '差分を閉じてプレビューに戻る',
  'diff.backToPreview': 'プレビューに戻る',
  'diff.loading': '差分を取得中…',
  'diff.failed': '差分を取得できませんでした',
  'diff.none': 'このファイルにディスク上の差分はありません（保存済み・ステージ内容と一致）。',
  'tree.label': 'ファイルツリー',
  'tree.expandExplorer': 'エクスプローラーを開く',
  'tree.collapseExplorer': 'エクスプローラーを畳む',
  'tree.explorer': 'エクスプローラー',
  'tree.openOtherFolder': '別のフォルダを開く',
  'tree.filterPlaceholder': 'ファイル名で絞り込み',
  'tree.filterClearTitle': 'フィルタをクリア（Esc）',
  'tree.filterClear': 'フィルタをクリア',
  'tree.emptyHint': 'フォルダを開くと\n文書ツリーが表示されます',
  'tree.loading': '読み込み中…',
  'tree.openFolder': 'フォルダを開く',
  'tree.filterNoMatch': '「{query}」に\n一致するファイルがありません',
  'tree.noFiles': '.md / .tsv が\n見つかりませんでした',
  'tree.truncated': '一部のみ表示（上限に達したため打ち切りました）',
  'tree.recent': '最近開いたフォルダ',
  'tree.recentPick': '最近開いたフォルダから選ぶ',
  'tree.recentMissing': '見つかりません',
  'tree.recentForget': '一覧から削除',
  'tree.recentLastFile': '前回開いていた: {file}',
  'tree.restored': '前回の続きから開きました',
  'tree.menuRename': '名前の変更',
  'tree.menuReveal': 'エクスプローラーで表示',
  'tree.menuCopyName': '名前をコピー',
  'tree.menuCopyRelPath': '相対パスをコピー',
  'tree.menuCopyPath': 'フルパスをコピー',
  'tree.menuOpenForge': 'リモートで開く',
  'tree.renameHint': 'Enter で確定・Esc で取り消し',
  'tree.renameErrorEmpty': '名前を入力してください',
  'tree.renameErrorSeparator': '名前に区切り文字は使えません',
  'tree.renameErrorInvalidChar': '名前に使えない文字が含まれています',
  'tree.renameErrorExtension': '拡張子は .md / .tsv のままにしてください',
  'git.state.modified': '変更あり（未コミット）',
  'git.state.added': 'ステージ済みの追加',
  'git.state.untracked': '未追跡（新規）',
  'git.state.deleted': '削除',
  'git.state.renamed': 'リネーム',
  'git.state.conflicted': 'コンフリクト',
  'panel.label': 'Git / AI / MCP パネル',
  'panel.collapse': 'パネルを畳む',
  'panel.expand': 'パネルを開く',
  'panel.hint': 'Git 差分・AI・MCP ログは\n後続フェーズで表示されます',
  'mcp.starting': '起動中…',
  'mcp.copyToken': '接続トークンを写す',
  'mcp.copied': 'トークンを写しました',
  'mcp.copyConfig': '接続設定を写す',
  'mcp.copiedConfig': '接続設定を写しました',
  'mcp.howto': 'AI クライアントとつなぐ手順',
  'mcp.howtoStep1': '上の「接続設定を写す」を押す。',
  'mcp.howtoStep2':
    'AI クライアント（Claude Code / Claude Desktop / Cursor / Cline など）の MCP 設定へ貼る。',
  'mcp.howtoStep3':
    'この画面で開いているフォルダが AI の読み書き対象になる。フォルダを切り替えれば AI も追いかける。',
  'mcp.howtoNote':
    '接続先とトークンは次に起動しても変わらないので、貼った設定はそのまま使い続けられる。',
  'mcp.logsEmpty': 'AI からの操作がここに並びます',
  'mcp.logsDisabled': 'サーバーが動いていないため操作は記録されません',
  'mcp.reason.sidecarMissing': 'MCP サーバー本体が見つかりません',
  'mcp.reason.nodeMissing': 'Node が見つかりません。Node を入れると MCP 連携が使えます',
  'mcp.reason.spawnFailed': 'MCP サーバーを起動できませんでした',
  'mcp.reason.noOutput': 'MCP サーバーの出力を受け取れません',
  'mcp.reason.exitedEarly': 'MCP サーバーが接続可能になる前に終了しました',
  'mcp.reason.serverError': 'MCP サーバーがエラーを報告しました',
  'mcp.reason.statusUnreadable': 'MCP の状態を取得できません',
  'mcp.reason.unknown': '利用できません',
  'help.title': 'ヘルプ・バージョン情報',
  'help.desktopEdition': 'デスクトップ版',
  'help.checkUpdate': '更新を確認',
  'help.manual': '操作マニュアル',
  'help.shortcuts': 'キーボードショートカット',
  'help.shortcutsGrid': '検証グリッド',
  'help.scGridEdit': 'セルを編集',
  'help.scGridSelect': '選択範囲を広げる',
  'help.scGridSelectAll': '表全体を選択',
  'help.scGridCopy': '選択範囲をコピー',
  'help.scGridPaste': '貼り付け',
  'help.scGridUndo': '元に戻す / やり直す',
  'help.scGridExitFullscreen': '全画面を抜ける',
  'help.license': 'ライセンス',
  'help.repository': 'リポジトリ',
  'help.openInBrowser': 'ブラウザで開く',
  'layout.railDividerLabel': 'エクスプローラーの幅を調整（ダブルクリックで初期幅に戻す）',
  'page.conflictChanged': '外部でこのファイルが変更されました',
  'page.conflictReload': '再読込（編集を破棄）',
  'page.conflictKeep': '編集を残す',
  'page.editorHead': 'エディター — Markdown',
  'page.editorPaneLabel': 'Markdown エディター',
  'page.previewPaneLabel': 'ビューワー（プレビュー）',
  'page.dividerLabel': 'エディターとプレビューの幅を調整（ダブルクリックで 50/50 に戻す）',
  'page.diffHead': '差分 — Git',
  'page.gridHead': '検証シート — グリッド編集',
  'page.gridFullscreenTitle': 'グリッドを全画面表示',
  'page.gridRestoreTitle': '分割表示に戻す（Esc）',
  'page.gridFullscreenBtn': '⤢ 全画面',
  'page.gridRestoreBtn': '↙ 分割に戻す',
  'page.previewHead': 'プレビュー',
  'page.previewTitle': '{label}プレビュー',
  'page.frontmatterHint': 'frontmatter（--- で囲む先頭ブロック）の書式を確認してください',
  'frontmatter.failed': 'frontmatter を読み取れませんでした。{detail}',
  'frontmatter.atLine': '{line} 行目: {detail}',
  'frontmatter.indentation': '行頭の字下げが、上の行とそろっていません。',
  'frontmatter.tab': '字下げにタブが使われています。空白に置き換えてください。',
  'frontmatter.duplicateKey': '同じ項目名が 2 回書かれています。',
  'frontmatter.unterminated': '引用符またはかっこが閉じられていません。',
  'frontmatter.blockMapping': 'この行が「項目名: 値」の形になっていません。',
  'frontmatter.tooLarge': 'frontmatter が大きすぎて読み取れません。',
  'frontmatter.tooManyAnchors': 'YAML のアンカー（&名前）が多すぎます。',
  'frontmatter.tooManyAliases': 'YAML の参照（*名前）が多すぎます。',
  'frontmatter.unknown': 'ここで読み取りが止まりました（{raw}）。',
};

const zh: Messages = {
  'app.docPlaceholder': '请选择文档',
  'app.unsaved': '未保存',
  'app.unsavedLong': '有未保存的更改',
  'common.close': '关闭',
  'action.save': '保存',
  'action.saving': '正在保存…',
  'action.saveTitle': '保存（Ctrl+S / ⌘S）',
  'action.pdf': 'PDF',
  'action.pdfExport': '导出 PDF',
  'action.pdfTitle': '导出 PDF（Ctrl+P / ⌘P・将预览按 A4 打印／保存）',
  'action.theme': '主题',
  'action.themeToLight': '切换到浅色主题',
  'action.themeToDark': '切换到深色主题',
  'action.help': '帮助',
  'action.autosave': '自动保存',
  'action.autosaveOn': '自动保存：开（点击关闭）',
  'action.autosaveOff': '自动保存：关（点击开启）',
  'state.on': '开',
  'state.off': '关',
  'window.minimize': '最小化',
  'window.maximize': '最大化',
  'window.restore': '还原',
  'window.close': '关闭',
  'lang.label': '语言',
  'search.placeholder': '搜索',
  'search.caseSensitive': '区分大小写',
  'search.regex': '正则表达式',
  'search.wholeWord': '全字匹配',
  'search.previous': '上一个匹配',
  'search.next': '下一个匹配',
  'search.close': '关闭',
  'search.noMatches': '无匹配',
  'search.count': '{cur}/{total}',
  'search.inEditor': '编辑器',
  'search.inPreview': '预览',
  'status.branchSwitchTitle': '点击切换分支',
  'status.branchSwitchLabel': '切换分支',
  'status.branchSwitchFailed': '无法切换',
  'status.noLocalBranches': '没有本地分支',
  'status.aheadBehindTitle': '领先／落后远程的提交数',
  'status.changeCount': '更改 {count}',
  'status.noRepo': '未连接仓库',
  'status.sourceControlTitle': '源代码管理（提交／推送／拉取）',
  'status.sourceControl': '源代码管理',
  'status.forge': 'forge: {name}',
  'status.mcpReady': 'MCP: 运行中',
  'status.mcpStarting': 'MCP: 启动中',
  'status.mcpOff': 'MCP: 已停止',
  'status.saving': '保存中…',
  'status.unsaved': '未保存的更改',
  'status.savedAt': '{time} 已保存',
  'status.savedAtTitle': '当前文件最后一次成功保存的时间',
  'scm.closePanel': '关闭源代码管理',
  'scm.pullTitle': 'git pull --ff-only（仅快进）',
  'scm.pushTitle': 'git push（不使用 --force，认证由系统 git 凭据处理）',
  'scm.failed': '操作失败',
  'scm.pushed': '已推送',
  'scm.pulled': '已拉取',
  'scm.committed': '已提交 {count} 项更改',
  'scm.changes': '更改',
  'scm.noChanges': '没有更改',
  'scm.fileRowTitle': '{path}（点击查看差异）',
  'scm.commitHead': '提交',
  'scm.messagePlaceholder': '输入更改摘要（Ctrl/⌘+Enter 提交）',
  'scm.working': '处理中…',
  'scm.commit': '提交',
  'scm.commitCount': '提交 {count} 项',
  'scm.stageHint': '暂存全部更改（git add -A）后提交。',
  'diff.label': '差异视图',
  'diff.backToPreviewTitle': '关闭差异并返回预览',
  'diff.backToPreview': '返回预览',
  'diff.loading': '正在获取差异…',
  'diff.failed': '无法获取差异',
  'diff.none': '该文件在磁盘上没有差异（与已保存、已暂存的内容一致）。',
  'tree.label': '文件树',
  'tree.expandExplorer': '打开资源管理器',
  'tree.collapseExplorer': '折叠资源管理器',
  'tree.explorer': '资源管理器',
  'tree.openOtherFolder': '打开其他文件夹',
  'tree.filterPlaceholder': '按文件名筛选',
  'tree.filterClearTitle': '清除筛选（Esc）',
  'tree.filterClear': '清除筛选',
  'tree.emptyHint': '打开文件夹后\n将显示文档树',
  'tree.loading': '加载中…',
  'tree.openFolder': '打开文件夹',
  'tree.filterNoMatch': '没有匹配\n“{query}”的文件',
  'tree.noFiles': '未找到\n.md / .tsv 文件',
  'tree.truncated': '仅显示部分（已达上限而截断）',
  'tree.recent': '最近打开的文件夹',
  'tree.recentPick': '从最近打开的文件夹中选择',
  'tree.recentMissing': '未找到',
  'tree.recentForget': '从列表中移除',
  'tree.recentLastFile': '上次打开：{file}',
  'tree.restored': '已恢复到上次的位置',
  'tree.menuRename': '重命名',
  'tree.menuReveal': '在资源管理器中显示',
  'tree.menuCopyName': '复制名称',
  'tree.menuCopyRelPath': '复制相对路径',
  'tree.menuCopyPath': '复制完整路径',
  'tree.menuOpenForge': '在远程仓库打开',
  'tree.renameHint': 'Enter 确认，Esc 取消',
  'tree.renameErrorEmpty': '请输入名称',
  'tree.renameErrorSeparator': '名称中不能包含路径分隔符',
  'tree.renameErrorInvalidChar': '名称中包含无法使用的字符',
  'tree.renameErrorExtension': '扩展名必须保持为 .md 或 .tsv',
  'git.state.modified': '已更改（未提交）',
  'git.state.added': '已暂存的新增',
  'git.state.untracked': '未跟踪（新增）',
  'git.state.deleted': '已删除',
  'git.state.renamed': '已重命名',
  'git.state.conflicted': '冲突',
  'panel.label': 'Git / AI / MCP 面板',
  'panel.collapse': '折叠面板',
  'panel.expand': '打开面板',
  'panel.hint': 'Git 差异、AI、MCP 日志\n将在后续阶段显示',
  'mcp.starting': '启动中…',
  'mcp.copyToken': '复制连接令牌',
  'mcp.copied': '已复制令牌',
  'mcp.copyConfig': '复制连接设置',
  'mcp.copiedConfig': '已复制连接设置',
  'mcp.howto': '连接 AI 客户端的步骤',
  'mcp.howtoStep1': '点击上方的「复制连接设置」。',
  'mcp.howtoStep2':
    '粘贴到 AI 客户端（Claude Code / Claude Desktop / Cursor / Cline 等）的 MCP 设置中。',
  'mcp.howtoStep3': '此窗口打开的文件夹即 AI 读写的对象。切换文件夹后 AI 也会跟随。',
  'mcp.howtoNote': '下次启动应用时地址和令牌不变，粘贴过的设置可以继续使用。',
  'mcp.logsEmpty': 'AI 的操作将显示在这里',
  'mcp.logsDisabled': '服务器未运行，因此不会记录操作',
  'mcp.reason.sidecarMissing': '未找到 MCP 服务器本体',
  'mcp.reason.nodeMissing': '未找到 Node。安装 Node 后即可使用 MCP',
  'mcp.reason.spawnFailed': '无法启动 MCP 服务器',
  'mcp.reason.noOutput': '无法读取 MCP 服务器的输出',
  'mcp.reason.exitedEarly': 'MCP 服务器在就绪前已退出',
  'mcp.reason.serverError': 'MCP 服务器报告了错误',
  'mcp.reason.statusUnreadable': '无法获取 MCP 的状态',
  'mcp.reason.unknown': '不可用',
  'help.title': '帮助・版本信息',
  'help.desktopEdition': '桌面版',
  'help.checkUpdate': '检查更新',
  'help.manual': '操作手册',
  'help.shortcuts': '键盘快捷键',
  'help.shortcutsGrid': '验证网格',
  'help.scGridEdit': '编辑单元格',
  'help.scGridSelect': '扩展选区',
  'help.scGridSelectAll': '选择整个表格',
  'help.scGridCopy': '复制选区',
  'help.scGridPaste': '粘贴',
  'help.scGridUndo': '撤销 / 重做',
  'help.scGridExitFullscreen': '退出全屏',
  'help.license': '许可证',
  'help.repository': '仓库',
  'help.openInBrowser': '在浏览器中打开',
  'layout.railDividerLabel': '调整资源管理器宽度（双击恢复初始宽度）',
  'page.conflictChanged': '此文件已被外部更改',
  'page.conflictReload': '重新加载（放弃编辑）',
  'page.conflictKeep': '保留编辑',
  'page.editorHead': '编辑器 — Markdown',
  'page.editorPaneLabel': 'Markdown 编辑器',
  'page.previewPaneLabel': '查看器（预览）',
  'page.dividerLabel': '调整编辑器和预览宽度（双击恢复 50/50）',
  'page.diffHead': '差异 — Git',
  'page.gridHead': '验证表 — 网格编辑',
  'page.gridFullscreenTitle': '全屏显示网格',
  'page.gridRestoreTitle': '返回分屏视图（Esc）',
  'page.gridFullscreenBtn': '⤢ 全屏',
  'page.gridRestoreBtn': '↙ 返回分屏',
  'page.previewHead': '预览',
  'page.previewTitle': '{label}预览',
  'page.frontmatterHint': '请检查 frontmatter（由 --- 包围的开头块）的格式',
  'frontmatter.failed': '无法读取 frontmatter。{detail}',
  'frontmatter.atLine': '第 {line} 行：{detail}',
  'frontmatter.indentation': '行首缩进与上面几行没有对齐。',
  'frontmatter.tab': '缩进使用了制表符，请改用空格。',
  'frontmatter.duplicateKey': '同一个项目名出现了两次。',
  'frontmatter.unterminated': '引号或括号没有闭合。',
  'frontmatter.blockMapping': '该行没有写成「项目名: 值」的形式。',
  'frontmatter.tooLarge': 'frontmatter 过大，无法读取。',
  'frontmatter.tooManyAnchors': 'YAML 锚点（&名称）过多。',
  'frontmatter.tooManyAliases': 'YAML 引用（*名称）过多。',
  'frontmatter.unknown': '读取在此处中断（{raw}）。',
};

const ko: Messages = {
  'app.docPlaceholder': '문서를 선택하세요',
  'app.unsaved': '저장 안 됨',
  'app.unsavedLong': '저장하지 않은 변경 사항이 있습니다',
  'common.close': '닫기',
  'action.save': '저장',
  'action.saving': '저장 중…',
  'action.saveTitle': '저장 (Ctrl+S / ⌘S)',
  'action.pdf': 'PDF',
  'action.pdfExport': 'PDF 내보내기',
  'action.pdfTitle': 'PDF 내보내기 (Ctrl+P / ⌘P · 미리보기를 A4로 인쇄／저장)',
  'action.theme': '테마',
  'action.themeToLight': '라이트 테마로 전환',
  'action.themeToDark': '다크 테마로 전환',
  'action.help': '도움말',
  'action.autosave': '자동 저장',
  'action.autosaveOn': '자동 저장: 켬(클릭하여 끄기)',
  'action.autosaveOff': '자동 저장: 끔(클릭하여 켜기)',
  'state.on': '켬',
  'state.off': '끔',
  'window.minimize': '최소화',
  'window.maximize': '최대화',
  'window.restore': '이전 크기로 복원',
  'window.close': '닫기',
  'lang.label': '언어',
  'search.placeholder': '검색',
  'search.caseSensitive': '대소문자 구분',
  'search.regex': '정규식',
  'search.wholeWord': '단어 단위',
  'search.previous': '이전 일치',
  'search.next': '다음 일치',
  'search.close': '닫기',
  'search.noMatches': '일치 없음',
  'search.count': '{cur}/{total}',
  'search.inEditor': '편집기',
  'search.inPreview': '미리보기',
  'status.branchSwitchTitle': '클릭하여 브랜치 전환',
  'status.branchSwitchLabel': '브랜치 전환',
  'status.branchSwitchFailed': '전환할 수 없습니다',
  'status.noLocalBranches': '로컬 브랜치가 없습니다',
  'status.aheadBehindTitle': '원격 대비 앞선／뒤처진 커밋 수',
  'status.changeCount': '변경 {count}',
  'status.noRepo': '저장소 미연결',
  'status.sourceControlTitle': '소스 제어 (커밋 / 푸시 / 풀)',
  'status.sourceControl': '소스 제어',
  'status.forge': 'forge: {name}',
  'status.mcpReady': 'MCP: 실행 중',
  'status.mcpStarting': 'MCP: 시작 중',
  'status.mcpOff': 'MCP: 중지됨',
  'status.saving': '저장 중…',
  'status.unsaved': '저장되지 않은 변경',
  'status.savedAt': '{time}에 저장',
  'status.savedAtTitle': '열려 있는 파일을 마지막으로 저장한 시각',
  'scm.closePanel': '소스 제어 닫기',
  'scm.pullTitle': 'git pull --ff-only(fast-forward만)',
  'scm.pushTitle': 'git push(--force 없음, 인증은 시스템 git 자격 증명 사용)',
  'scm.failed': '실패했습니다',
  'scm.pushed': 'push 했습니다',
  'scm.pulled': 'pull 했습니다',
  'scm.committed': '{count}건의 변경을 커밋했습니다',
  'scm.changes': '변경',
  'scm.noChanges': '변경 사항이 없습니다',
  'scm.fileRowTitle': '{path}(클릭하면 차이를 표시)',
  'scm.commitHead': '커밋',
  'scm.messagePlaceholder': '변경 내용을 입력(Ctrl/⌘+Enter 로 커밋)',
  'scm.working': '처리 중…',
  'scm.commit': '커밋',
  'scm.commitCount': '{count}건 커밋',
  'scm.stageHint': '모든 변경을 스테이지(git add -A)한 뒤 커밋합니다.',
  'diff.label': '차이 보기',
  'diff.backToPreviewTitle': '차이를 닫고 미리보기로 돌아가기',
  'diff.backToPreview': '미리보기로 돌아가기',
  'diff.loading': '차이를 가져오는 중…',
  'diff.failed': '차이를 가져오지 못했습니다',
  'diff.none': '이 파일에는 디스크상의 차이가 없습니다(저장·스테이지된 내용과 동일).',
  'tree.label': '파일 트리',
  'tree.expandExplorer': '탐색기 열기',
  'tree.collapseExplorer': '탐색기 접기',
  'tree.explorer': '탐색기',
  'tree.openOtherFolder': '다른 폴더 열기',
  'tree.filterPlaceholder': '파일 이름으로 필터',
  'tree.filterClearTitle': '필터 지우기 (Esc)',
  'tree.filterClear': '필터 지우기',
  'tree.emptyHint': '폴더를 열면\n문서 트리가 표시됩니다',
  'tree.loading': '불러오는 중…',
  'tree.openFolder': '폴더 열기',
  'tree.filterNoMatch': '"{query}"과(와)\n일치하는 파일이 없습니다',
  'tree.noFiles': '.md / .tsv 파일을\n찾을 수 없습니다',
  'tree.truncated': '일부만 표시 (상한에 도달하여 중단)',
  'tree.recent': '최근 연 폴더',
  'tree.recentPick': '최근 연 폴더에서 선택',
  'tree.recentMissing': '찾을 수 없음',
  'tree.recentForget': '목록에서 삭제',
  'tree.recentLastFile': '지난번 파일: {file}',
  'tree.restored': '지난번 위치에서 이어서 열었습니다',
  'tree.menuRename': '이름 바꾸기',
  'tree.menuReveal': '탐색기에서 표시',
  'tree.menuCopyName': '이름 복사',
  'tree.menuCopyRelPath': '상대 경로 복사',
  'tree.menuCopyPath': '전체 경로 복사',
  'tree.menuOpenForge': '원격 저장소에서 열기',
  'tree.renameHint': 'Enter로 확정, Esc로 취소',
  'tree.renameErrorEmpty': '이름을 입력하세요',
  'tree.renameErrorSeparator': '이름에 경로 구분자는 사용할 수 없습니다',
  'tree.renameErrorInvalidChar': '이름에 사용할 수 없는 문자가 있습니다',
  'tree.renameErrorExtension': '확장자는 .md 또는 .tsv 여야 합니다',
  'git.state.modified': '변경됨 (커밋 안 됨)',
  'git.state.added': '스테이지된 추가',
  'git.state.untracked': '추적 안 됨 (신규)',
  'git.state.deleted': '삭제됨',
  'git.state.renamed': '이름 변경됨',
  'git.state.conflicted': '충돌',
  'panel.label': 'Git / AI / MCP 패널',
  'panel.collapse': '패널 접기',
  'panel.expand': '패널 열기',
  'panel.hint': 'Git 차이・AI・MCP 로그는\n다음 단계에서 표시됩니다',
  'mcp.starting': '시작 중…',
  'mcp.copyToken': '접속 토큰 복사',
  'mcp.copied': '토큰을 복사했습니다',
  'mcp.copyConfig': '연결 설정 복사',
  'mcp.copiedConfig': '연결 설정을 복사했습니다',
  'mcp.howto': 'AI 클라이언트 연결 방법',
  'mcp.howtoStep1': '위의 「연결 설정 복사」를 누릅니다.',
  'mcp.howtoStep2':
    'AI 클라이언트(Claude Code / Claude Desktop / Cursor / Cline 등)의 MCP 설정에 붙여 넣습니다.',
  'mcp.howtoStep3':
    '이 창에서 열어 둔 폴더가 AI의 읽기·쓰기 대상입니다. 폴더를 바꾸면 AI도 따라갑니다.',
  'mcp.howtoNote':
    '앱을 다시 시작해도 주소와 토큰이 그대로이므로 붙여 넣은 설정을 계속 사용할 수 있습니다.',
  'mcp.logsEmpty': 'AI 의 작업이 여기에 표시됩니다',
  'mcp.logsDisabled': '서버가 실행 중이 아니므로 작업이 기록되지 않습니다',
  'mcp.reason.sidecarMissing': 'MCP 서버 본체를 찾을 수 없습니다',
  'mcp.reason.nodeMissing': 'Node 를 찾을 수 없습니다. Node 를 설치하면 MCP 를 사용할 수 있습니다',
  'mcp.reason.spawnFailed': 'MCP 서버를 시작할 수 없었습니다',
  'mcp.reason.noOutput': 'MCP 서버의 출력을 읽을 수 없습니다',
  'mcp.reason.exitedEarly': 'MCP 서버가 준비되기 전에 종료되었습니다',
  'mcp.reason.serverError': 'MCP 서버가 오류를 보고했습니다',
  'mcp.reason.statusUnreadable': 'MCP 상태를 가져올 수 없습니다',
  'mcp.reason.unknown': '사용할 수 없습니다',
  'help.title': '도움말・버전 정보',
  'help.desktopEdition': '데스크톱 버전',
  'help.checkUpdate': '업데이트 확인',
  'help.manual': '사용 설명서',
  'help.shortcuts': '키보드 단축키',
  'help.shortcutsGrid': '검증 그리드',
  'help.scGridEdit': '셀 편집',
  'help.scGridSelect': '선택 영역 확장',
  'help.scGridSelectAll': '표 전체 선택',
  'help.scGridCopy': '선택 영역 복사',
  'help.scGridPaste': '붙여넣기',
  'help.scGridUndo': '실행 취소 / 다시 실행',
  'help.scGridExitFullscreen': '전체 화면 나가기',
  'help.license': '라이선스',
  'help.repository': '저장소',
  'help.openInBrowser': '브라우저에서 열기',
  'layout.railDividerLabel': '탐색기 너비 조정 (더블클릭으로 기본 너비 복원)',
  'page.conflictChanged': '이 파일이 외부에서 변경되었습니다',
  'page.conflictReload': '다시 불러오기 (편집 삭제)',
  'page.conflictKeep': '편집 유지',
  'page.editorHead': '편집기 — Markdown',
  'page.editorPaneLabel': 'Markdown 편집기',
  'page.previewPaneLabel': '뷰어 (미리보기)',
  'page.dividerLabel': '편집기와 미리보기 너비 조정 (더블클릭으로 50/50 복원)',
  'page.diffHead': '차이 — Git',
  'page.gridHead': '검증 시트 — 그리드 편집',
  'page.gridFullscreenTitle': '그리드 전체 화면',
  'page.gridRestoreTitle': '분할 보기로 복귀 (Esc)',
  'page.gridFullscreenBtn': '⤢ 전체 화면',
  'page.gridRestoreBtn': '↙ 분할로 복귀',
  'page.previewHead': '미리보기',
  'page.previewTitle': '{label} 미리보기',
  'page.frontmatterHint': 'frontmatter(--- 로 감싼 첫 블록) 형식을 확인하세요',
  'frontmatter.failed': 'frontmatter를 읽을 수 없습니다. {detail}',
  'frontmatter.atLine': '{line}번째 줄: {detail}',
  'frontmatter.indentation': '줄 앞 들여쓰기가 위 줄과 맞지 않습니다.',
  'frontmatter.tab': '들여쓰기에 탭이 사용되었습니다. 공백으로 바꿔 주세요.',
  'frontmatter.duplicateKey': '같은 항목 이름이 두 번 적혀 있습니다.',
  'frontmatter.unterminated': '따옴표 또는 괄호가 닫히지 않았습니다.',
  'frontmatter.blockMapping': '이 줄이 「항목 이름: 값」 형태가 아닙니다.',
  'frontmatter.tooLarge': 'frontmatter가 너무 커서 읽을 수 없습니다.',
  'frontmatter.tooManyAnchors': 'YAML 앵커(&이름)가 너무 많습니다.',
  'frontmatter.tooManyAliases': 'YAML 참조(*이름)가 너무 많습니다.',
  'frontmatter.unknown': '여기에서 읽기가 중단되었습니다({raw}).',
};

/** ロケール→文言辞書。i18n.svelte.ts が現ロケールと fallback(ja) を引く。 */
export const messages: Record<Locale, Messages> = { en, ja, zh, ko };
