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
  // 上のメニュー行
  'menu.bar': string;
  'menu.file': string;
  'menu.export': string;
  'menu.view': string;
  // 主要アクション
  'action.save': string;
  'action.saving': string;
  'action.saveTitle': string;
  'action.pdf': string;
  'action.pdfExport': string;
  'action.pdfTitle': string;
  'action.html': string;
  'action.htmlTitle': string;
  'action.htmlDone': string;
  'action.image': string;
  'action.imageTitle': string;
  'action.imageDone': string;
  // 画像書き出しの選択欄
  'image.size': string;
  'image.scale': string;
  'image.format': string;
  'image.quality': string;
  'image.shoot': string;
  'image.preset.ogp': string;
  'image.preset.x-post': string;
  'image.preset.instagram-post': string;
  'image.preset.instagram-story': string;
  'image.preset.full-hd': string;
  'image.preset.web-banner': string;
  'image.format.png': string;
  'image.format.pngTransparent': string;
  'image.format.jpeg': string;
  // 一括生成（表の 1 行を 1 枚に差し込む）
  'batch.run': string;
  'batch.stop': string;
  'batch.progress': string;
  'batch.done': string;
  'batch.failed': string;
  'batch.notDeclared': string;
  'batch.badDeclaration': string;
  'batch.noRows': string;
  'batch.noColumn': string;
  'batch.emptyName': string;
  'batch.duplicateName': string;
  'batch.tooMany': string;
  'batch.badPath': string;
  'batch.readFailed': string;
  'batch.missingFont': string;
  'batch.stopped': string;
  'action.site': string;
  'action.siteTitle': string;
  'action.siteDone': string;
  'action.siteDoneSkipped': string;
  'action.siteNone': string;
  'action.browser': string;
  'action.browserTitle': string;
  'action.browserStopTitle': string;
  'action.browserServing': string;
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
  'search.inGrid': string;
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
  'scm.pickFile': string;
  'scm.commitHead': string;
  'scm.messagePlaceholder': string;
  'scm.working': string;
  'scm.commit': string;
  'scm.commitCount': string;
  'scm.stageHint': string;
  'scm.history': string;
  'scm.noHistory': string;
  'scm.commitTitle': string;
  'scm.init': string;
  'scm.initTitle': string;
  'scm.initialized': string;
  'scm.clone': string;
  'scm.cloneTitle': string;
  'scm.cloneUrlPlaceholder': string;
  'scm.cloned': string;
  'scm.openForge': string;
  'scm.openForgeTitle': string;
  'scm.switchTitle': string;
  'scm.switched': string;
  'scm.newBranch': string;
  'scm.newBranchTitle': string;
  'scm.newBranchPlaceholder': string;
  'scm.branchCreated': string;
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
  'tree.openAsk': string;
  'tree.openAskHint': string;
  'tree.openAskYes': string;
  'tree.openAskNo': string;
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
  'tree.menuCopyShareLink': string;
  'tree.menuOpenForge': string;
  'tree.renameHint': string;
  'tree.renameErrorEmpty': string;
  'tree.renameErrorSeparator': string;
  'tree.renameErrorInvalidChar': string;
  'tree.renameErrorExtension': string;
  'tree.menuNewTestSheet': string;
  'tree.menuFileInfo': string;
  // ファイル情報ダイアログ
  'fileInfo.title': string;
  'fileInfo.path': string;
  'fileInfo.size': string;
  'fileInfo.modified': string;
  'fileInfo.lines': string;
  'fileInfo.encoding': string;
  'fileInfo.lineEnding': string;
  'fileInfo.sha256': string;
  'fileInfo.git': string;
  'fileInfo.measuring': string;
  'fileInfo.unknown': string;
  'fileInfo.failed': string;
  'fileInfo.copy': string;
  'fileInfo.copied': string;
  'fileInfo.encUtf8': string;
  'fileInfo.encUtf8Bom': string;
  'fileInfo.encUtf16Le': string;
  'fileInfo.encUtf16Be': string;
  'fileInfo.encUnknown': string;
  'fileInfo.eolLf': string;
  'fileInfo.eolCrlf': string;
  'fileInfo.eolCr': string;
  'fileInfo.eolMixed': string;
  'fileInfo.eolNone': string;
  'fileInfo.gitNotRepo': string;
  'fileInfo.gitIgnored': string;
  'fileInfo.gitUntracked': string;
  'fileInfo.gitTracked': string;
  'fileInfo.gitModified': string;
  'fileInfo.gitAdded': string;
  'fileInfo.gitDeleted': string;
  'fileInfo.gitRenamed': string;
  'fileInfo.gitConflicted': string;
  // 検証シートの新規作成ダイアログ
  'newSheet.title': string;
  'newSheet.folder': string;
  'newSheet.folderRoot': string;
  'newSheet.preset': string;
  'newSheet.presetTestCase': string;
  'newSheet.presetTestCaseDesc': string;
  'newSheet.presetViewpoint': string;
  'newSheet.presetViewpointDesc': string;
  'newSheet.presetReview': string;
  'newSheet.presetReviewDesc': string;
  'newSheet.fileName': string;
  'newSheet.fileNamePlaceholder': string;
  'newSheet.fileNameHint': string;
  'newSheet.sheetTitle': string;
  'newSheet.sheetTitlePlaceholder': string;
  'newSheet.create': string;
  'newSheet.cancel': string;
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
  'timeline.open': string;
  'timeline.openTitle': string;
  'timeline.head': string;
  'timeline.files': string;
  'timeline.filesEmpty': string;
  'timeline.filesTruncated': string;
  'timeline.rescan': string;
  'timeline.prepare': string;
  'timeline.preparing': string;
  'timeline.candidateNote': string;
  'timeline.timeField': string;
  'timeline.guess': string;
  'timeline.chosen': string;
  'timeline.evidence.nameAndValue': string;
  'timeline.evidence.valueOnly': string;
  'timeline.evidence.nameOnly': string;
  'timeline.parsed': string;
  'timeline.noCandidate': string;
  'timeline.unreadable': string;
  'timeline.skipped': string;
  'timeline.joinKey': string;
  'timeline.joinNone': string;
  'timeline.joinExact': string;
  'timeline.joinNormalized': string;
  'timeline.shared': string;
  'timeline.build': string;
  'timeline.building': string;
  'timeline.colTime': string;
  'timeline.colSource': string;
  'timeline.colLine': string;
  'timeline.colRecord': string;
  'timeline.unknownTime': string;
  'timeline.empty': string;
  'timeline.truncated': string;
  'timeline.unknownCount': string;
  'timeline.maskedNote': string;
  'diag.tab': string;
  'diag.scale': string;
  'diag.chars': string;
  'diag.rows': string;
  'diag.columns': string;
  'diag.domRows': string;
  'diag.historyChars': string;
  'diag.span': string;
  'diag.last': string;
  'diag.median': string;
  'diag.max': string;
  'diag.count': string;
  'diag.empty': string;
  'diag.copy': string;
  'diag.copied': string;
  'diag.clear': string;
  'diag.note': string;
  'diag.span.serialize': string;
  'diag.span.parse': string;
  'diag.span.validate': string;
  'diag.span.layout': string;
  'diag.span.history': string;
  'diag.span.dirty': string;
  'diag.span.grid': string;
  'diag.span.render': string;
  'diag.span.save': string;
  // MCP タブ（組み込みサーバーの接続状態・操作ログ）
  'mcp.starting': string;
  'mcp.copyToken': string;
  'mcp.copied': string;
  'mcp.copyConfig': string;
  'mcp.copiedConfig': string;
  'mcp.writeConfig': string;
  'mcp.wroteConfig': string;
  'mcp.writeConfigFailed': string;
  'mcp.writeConfigNote': string;
  'mcp.howto': string;
  'mcp.howtoStep1': string;
  'mcp.howtoStep2': string;
  'mcp.howtoStep3': string;
  'mcp.howtoNote': string;
  'mcp.logsEmpty': string;
  'mcp.logsDisabled': string;
  'mcp.askAi': string;
  'mcp.askedAi': string;
  'mcp.askAiText': string;
  'mcp.askAiNote': string;
  'mcp.retry': string;
  'mcp.retryFailed': string;
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
  'help.scGridMark': string;
  'help.license': string;
  'help.repository': string;
  'help.openInBrowser': string;
  // レイアウト（レール幅ディバイダ）
  'layout.railDividerLabel': string;
  // 中央（エディター↔プレビュー分割・競合バナー・グリッド）
  'page.conflictChanged': string;
  'page.conflictReload': string;
  'page.conflictKeep': string;
  'page.tabsLabel': string;
  'page.tabClose': string;
  'page.tabUnsaved': string;
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
  'page.sheetPreviewBtn': string;
  'page.sheetPreviewTitle': string;
  'page.sheetGridBtn': string;
  'page.sheetGridTitle': string;
  'page.compareBtn': string;
  'page.compareTitle': string;
  'page.compareTarget': string;
  'page.compareNoHistory': string;
  'page.compareMissing': string;
  'page.compareUnreadable': string;
  'page.compareNoRowId': string;
  'page.compareResult': string;
  'page.compareSame': string;
  'page.compareRemovedTitle': string;
  'page.exportPick': string;
  'page.exportCopyBtn': string;
  'page.exportCopyTitle': string;
  'page.exportCopied': string;
  'page.exportFailed': string;
  'page.importReadBtn': string;
  'page.importReadTitle': string;
  'page.importApplyBtn': string;
  'page.importApplyTitle': string;
  'page.importChanges': string;
  'page.importNone': string;
  'page.importApplied': string;
  'page.importUnknown': string;
  'page.importDuplicate': string;
  'page.importMissing': string;
  'page.importLocked': string;
  'page.importSkipped': string;
  'page.importNoKey': string;
  'page.importFolded': string;
  'page.importNoKeyColumn': string;
  'page.importFailed': string;
  'page.expandBtn': string;
  'page.expandTitle': string;
  'page.expandAdded': string;
  'page.expandNone': string;
  'page.expandOrphans': string;
  'page.expandMissing': string;
  'page.expandUnread': string;
  'page.viewportPhoneTitle': string;
  'page.viewportPcTitle': string;
  'page.viewportPhoneBtn': string;
  'page.viewportPcBtn': string;
  'page.previewHead': string;
  'page.previewTitle': string;
  'page.frontmatterHint': string;
  'page.linkOutsideFolder': string;
  'page.linkHeadingMissing': string;
  'page.linkNotOpenable': string;
  // 参考データ（.json / .xml）の表示
  'page.dataHead': string;
  'data.readOnly': string;
  'data.refused': string;
  'data.atLine': string;
  'data.size': string;
  'data.syntax': string;
  'data.depth': string;
  'data.nodes': string;
  'data.doctype': string;
  'data.entity': string;
  'data.unsupported': string;
  // 画像の表示（書き出しの image.* とは別）
  'imageView.head': string;
  'imageView.readOnly': string;
  'imageView.fit': string;
  'imageView.actual': string;
  'imageView.fitTitle': string;
  'imageView.actualTitle': string;
  'imageView.inlineFailed': string;
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
  // 図（chart ブロック）
  'chart.failed': string;
  'chart.atLine': string;
  'chart.empty': string;
  'chart.syntax': string;
  'chart.unknownKey': string;
  'chart.duplicateKey': string;
  'chart.missing': string;
  'chart.badType': string;
  'chart.noColumn': string;
  'chart.noRows': string;
  'chart.noNumbers': string;
  'chart.badPath': string;
  'chart.readFailed': string;
  'chart.unreadableCells': string;
  // 更新のお知らせ（7 状態 + 変更履歴）
  'update.dialogLabel': string;
  'update.checkingTitle': string;
  'update.upToDateTitle': string;
  'update.upToDateDesc': string;
  'update.historyLabel': string;
  'update.more': string;
  'update.availableTitle': string;
  'update.notesLabel': string;
  'update.later': string;
  'update.installNow': string;
  'update.downloadingTitle': string;
  'update.installingTitle': string;
  'update.installingDesc': string;
  'update.readyTitle': string;
  'update.readyDesc': string;
  'update.relaunch': string;
  'update.errorTitle': string;
  // 検証シート編集グリッド（表本体・行操作バー・列の右クリックメニュー）
  'grid.regionLabel': string;
  'grid.emptyColumns': string;
  'grid.rowNumber': string;
  'grid.required': string;
  'grid.multiline': string;
  'grid.defaultGroupLabel': string;
  'grid.computedCell': string;
  'grid.jumpNoColumn': string;
  'grid.jumpNoRow': string;
  'grid.jumpMultiple': string;
  'grid.linkGaps': string;
  'grid.splitRows': string;
  'grid.splitGo': string;
  'grid.splitDismiss': string;
  'grid.linkGapsTitle': string;
  'grid.pasteDroppedComputed': string;
  'grid.rowLabel': string;
  'grid.modeEditing': string;
  'grid.modeSelecting': string;
  'grid.selectionSize': string;
  'grid.selectionSummary': string;
  'grid.noteEdit': string;
  'grid.noteDelete': string;
  'grid.notePlaceholder': string;
  'grid.noteFolded': string;
  'grid.noteFoldOpen': string;
  'grid.noteFoldClose': string;
  'grid.groupRename': string;
  'grid.groupDelete': string;
  'grid.colResizeLabel': string;
  'grid.colResizeTitle': string;
  'grid.rowResizeLabel': string;
  'grid.rowResizeTitle': string;
  'grid.addRow': string;
  'grid.addRowTitle': string;
  'grid.duplicateRow': string;
  'grid.duplicateRowTitle': string;
  'grid.copyRow': string;
  'grid.copyRowTitle': string;
  'grid.clearRow': string;
  'grid.clearRowTitle': string;
  'grid.fillDown': string;
  'grid.fillDownTitle': string;
  'grid.deleteRow': string;
  'grid.deleteRowTitle': string;
  'grid.hideRow': string;
  'grid.hideRowTitle': string;
  'grid.unhideRow': string;
  'grid.unhideRowTitle': string;
  'grid.addNote': string;
  'grid.addNoteTitle': string;
  'grid.addGroup': string;
  'grid.addGroupTitle': string;
  'grid.revealShow': string;
  'grid.revealShowTitle': string;
  'grid.revealHide': string;
  'grid.revealHideTitle': string;
  'grid.menuClose': string;
  'grid.colMenuText': string;
  'grid.colMenuAlign': string;
  'grid.rowMenuHead': string;
  'grid.blame': string;
  'grid.blameTitle': string;
  'grid.blameUncommitted': string;
  'grid.diffChanged': string;
  'grid.diffMarked': string;
  'grid.diffAddedRow': string;
  'grid.diffAddedColumn': string;
  'grid.colModeClip': string;
  'grid.colModeWrap': string;
  'grid.colModeOverflow': string;
  'grid.colAlignLeft': string;
  'grid.colAlignCenter': string;
  'grid.colAlignRight': string;
}

/** 翻訳キー型（t() の引数に使う）。 */
export type MessageKey = keyof Messages;

const en: Messages = {
  'app.docPlaceholder': 'Select a document',
  'app.unsaved': 'Unsaved',
  'app.unsavedLong': 'You have unsaved changes',
  'common.close': 'Close',
  'menu.bar': 'Menu bar',
  'menu.file': 'File',
  'menu.export': 'Export',
  'menu.view': 'View',
  'action.save': 'Save',
  'action.saving': 'Saving…',
  'action.saveTitle': 'Save (Ctrl+S / ⌘S)',
  'action.pdf': 'PDF',
  'action.pdfExport': 'Export PDF',
  'action.pdfTitle': 'Export PDF (Ctrl+P / ⌘P — print the preview as A4)',
  'action.html': 'HTML',
  'action.htmlTitle': 'Export HTML (one file, saved next to the document)',
  'action.htmlDone': 'Exported {path}',
  'action.image': 'Image',
  'action.imageTitle': 'Save this document as a PNG or JPEG image',
  'action.imageDone': 'Exported {path}',
  'image.size': 'Size',
  'image.scale': 'Scale',
  'image.format': 'Format',
  'image.quality': 'Quality',
  'image.shoot': 'Export',
  'image.preset.ogp': 'OGP / link preview',
  'image.preset.x-post': 'X post',
  'image.preset.instagram-post': 'Instagram post',
  'image.preset.instagram-story': 'Instagram story',
  'image.preset.full-hd': 'Full HD',
  'image.preset.web-banner': 'Web banner',
  'image.format.png': 'PNG',
  'image.format.pngTransparent': 'PNG (transparent)',
  'image.format.jpeg': 'JPEG',
  // 一括生成（表の 1 行を 1 枚に差し込む）
  'batch.run': 'Export one image per row',
  'batch.stop': 'Stop',
  'batch.progress': '{done} / {total}',
  'batch.done': 'Exported {count} images',
  'batch.failed': 'Cannot export in bulk: {detail}',
  'batch.notDeclared': 'This document has no batch: declaration',
  'batch.badDeclaration': 'batch: is missing {raw}',
  'batch.noRows': '{raw} has no data rows',
  'batch.noColumn': 'The table has no {raw} column',
  'batch.emptyName': 'Row {raw} produces an empty name',
  'batch.duplicateName': 'Two rows produce the same name: {raw}',
  'batch.tooMany': 'Too many rows ({raw})',
  'batch.badPath': 'Points outside the open folder: {raw}',
  'batch.readFailed': 'Cannot read the table: {raw}',
  'batch.missingFont': 'Fonts not installed here: {raw}',
  'batch.stopped': 'Stopped after {count} images',
  'action.site': 'Site',
  'action.siteTitle': 'Export the whole folder as a website (into dist/)',
  'action.siteDone': 'Exported {count} files to {dir}/',
  'action.siteDoneSkipped': 'Exported {count} files to {dir}/ ({skipped} left out)',
  'action.siteNone': 'No document could be turned into a page',
  'action.browser': 'Browser',
  'action.browserTitle': 'Open the folder in your browser (a local address on this machine)',
  'action.browserStopTitle': 'Stop serving to the browser',
  'action.browserServing': 'Serving at {url}',
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
  'search.inGrid': 'Sheet',
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
  'scm.pickFile': 'Include {path} in the commit',
  'scm.commitHead': 'Commit',
  'scm.messagePlaceholder': 'Describe the change (Ctrl/⌘+Enter to commit)',
  'scm.working': 'Working…',
  'scm.commit': 'Commit',
  'scm.commitCount': 'Commit {count}',
  'scm.stageHint': 'Commits the checked files only. Uncheck a file to leave it for later.',
  'scm.history': 'History',
  'scm.noHistory': 'No commits yet',
  'scm.commitTitle': '{hash} ・ {author}',
  'scm.init': 'Start tracking with Git',
  'scm.initTitle': 'Create a local repository in this folder. No remote is set up.',
  'scm.initialized': 'This folder is now tracked with Git',
  'scm.clone': 'Clone',
  'scm.cloneTitle':
    'Copy an existing repository into this empty folder. Sign-in is handled by the credentials your OS already keeps.',
  'scm.cloneUrlPlaceholder': 'Source (https:// or git@host:path)',
  'scm.cloned': 'Copied the repository into this folder',
  'scm.openForge': 'Open in browser',
  'scm.openForgeTitle': 'Open the URL your remote returned (such as the page for opening a pull request) in your browser',
  'scm.switchTitle': 'Switch branch',
  'scm.switched': 'Switched to {branch}',
  'scm.newBranch': 'Create',
  'scm.newBranchTitle': 'Create a branch from where you are now and switch to it',
  'scm.newBranchPlaceholder': 'Branch name',
  'scm.branchCreated': 'Created {branch} and switched to it',
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
  'tree.openAsk': 'Open the folder {folder}?',
  'tree.openAskHint': 'Another program asked to show {path}. It is outside every folder you have opened.',
  'tree.openAskYes': 'Open',
  'tree.openAskNo': 'Not now',
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
  'tree.menuCopyShareLink': 'Copy share link',
  'tree.menuOpenForge': 'Open on remote',
  'tree.renameHint': 'Enter to apply, Esc to cancel',
  'tree.renameErrorEmpty': 'Enter a name',
  'tree.renameErrorSeparator': 'A name cannot contain path separators',
  'tree.renameErrorInvalidChar': 'That name contains characters that cannot be used',
  'tree.renameErrorExtension': 'The extension must stay .md or .tsv',
  'tree.menuNewTestSheet': 'New test sheet',
  'tree.menuFileInfo': 'File info',
  'fileInfo.title': 'File info',
  'fileInfo.path': 'Path',
  'fileInfo.size': 'Size',
  'fileInfo.modified': 'Last modified',
  'fileInfo.lines': 'Lines',
  'fileInfo.encoding': 'Encoding',
  'fileInfo.lineEnding': 'Line endings',
  'fileInfo.sha256': 'SHA-256',
  'fileInfo.git': 'Git status',
  'fileInfo.measuring': 'Measuring…',
  'fileInfo.unknown': 'Cannot be determined',
  'fileInfo.failed': 'Could not be read',
  'fileInfo.copy': 'Copy',
  'fileInfo.copied': 'Copied',
  'fileInfo.encUtf8': 'UTF-8',
  'fileInfo.encUtf8Bom': 'UTF-8 (with BOM)',
  'fileInfo.encUtf16Le': 'UTF-16 LE',
  'fileInfo.encUtf16Be': 'UTF-16 BE',
  'fileInfo.encUnknown': 'Cannot be determined',
  'fileInfo.eolLf': 'LF (Unix)',
  'fileInfo.eolCrlf': 'CRLF (Windows)',
  'fileInfo.eolCr': 'CR (classic Mac)',
  'fileInfo.eolMixed': 'Mixed',
  'fileInfo.eolNone': 'No line breaks',
  'fileInfo.gitNotRepo': 'Not in a Git repository',
  'fileInfo.gitIgnored': 'Ignored (.gitignore)',
  'fileInfo.gitUntracked': 'Untracked',
  'fileInfo.gitTracked': 'No changes',
  'fileInfo.gitModified': 'Modified',
  'fileInfo.gitAdded': 'Added (not committed)',
  'fileInfo.gitDeleted': 'Deleted',
  'fileInfo.gitRenamed': 'Renamed',
  'fileInfo.gitConflicted': 'Conflicted',
  'newSheet.title': 'New test sheet',
  'newSheet.folder': 'Location',
  'newSheet.folderRoot': 'Top of the open folder',
  'newSheet.preset': 'Template',
  'newSheet.presetTestCase': 'Test cases',
  'newSheet.presetTestCaseDesc': 'Steps and expected results, one case per row.',
  'newSheet.presetViewpoint': 'Viewpoints',
  'newSheet.presetViewpointDesc': 'Points to check, grouped by category, to find what is missing.',
  'newSheet.presetReview': 'Review comments',
  'newSheet.presetReviewDesc': 'Comments, what each one points at, and how far it got.',
  'newSheet.fileName': 'File name',
  'newSheet.fileNamePlaceholder': '001-login',
  'newSheet.fileNameHint': 'Adds .tsv if you leave it out',
  'newSheet.sheetTitle': 'Title (optional)',
  'newSheet.sheetTitlePlaceholder': 'Order flow test sheet',
  'newSheet.create': 'Create',
  'newSheet.cancel': 'Cancel',
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
  'timeline.open': 'Timeline',
  'timeline.openTitle': 'Line up logs in time order',
  'timeline.head': 'Timeline',
  'timeline.files': 'Pick logs',
  'timeline.filesEmpty': 'No logs (.log / .jsonl / .ndjson) in this folder',
  'timeline.filesTruncated': 'Too many to list — showing part of them',
  'timeline.rescan': 'List again',
  'timeline.prepare': 'Look inside and suggest fields',
  'timeline.preparing': 'Reading',
  'timeline.candidateNote': 'These are suggestions. Look at the contents and decide whether they fit.',
  'timeline.timeField': 'Time field',
  'timeline.guess': 'guess',
  'timeline.chosen': 'chosen',
  'timeline.evidence.nameAndValue': 'name and value both look like a time',
  'timeline.evidence.valueOnly': 'value reads as a time',
  'timeline.evidence.nameOnly': 'name looks like a time, but the value does not read as one',
  'timeline.parsed': 'read {parsed} of {sampled}',
  'timeline.noCandidate': 'No suggestion — type a field name',
  'timeline.unreadable': 'Cannot read',
  'timeline.skipped': '{count} lines could not be read',
  'timeline.joinKey': 'Field to match on',
  'timeline.joinNone': 'none',
  'timeline.joinExact': 'same name',
  'timeline.joinNormalized': 'names differ, matched after normalising',
  'timeline.shared': '{count} values appear in more than one file',
  'timeline.build': 'Build the timeline',
  'timeline.building': 'Building',
  'timeline.colTime': 'Time',
  'timeline.colSource': 'From',
  'timeline.colLine': 'Line',
  'timeline.colRecord': 'Contents',
  'timeline.unknownTime': 'time unknown',
  'timeline.empty': 'Pick logs and press [Build the timeline]',
  'timeline.truncated': 'Stopped at the limit — there is more',
  'timeline.unknownCount': '{count} events with no readable time',
  'timeline.maskedNote': 'Masked values cannot be unmasked here.',
  'diag.tab': 'Diagnostics',
  'diag.scale': 'Size',
  'diag.chars': 'characters',
  'diag.rows': 'rows',
  'diag.columns': 'columns',
  'diag.domRows': 'Rows in the DOM',
  'diag.historyChars': 'Characters held by undo history',
  'diag.span': 'Step',
  'diag.last': 'Latest',
  'diag.median': 'Median',
  'diag.max': 'Max',
  'diag.count': 'Samples',
  'diag.empty': 'Edit a test sheet and the timings will appear here',
  'diag.copy': 'Copy the numbers',
  'diag.copied': 'Copied',
  'diag.clear': 'Discard records',
  'diag.note': 'Milliseconds. Updating the screen includes the change comparison.',
  'diag.span.serialize': 'Rebuilding the file text',
  'diag.span.parse': 'Re-reading the file text',
  'diag.span.validate': 'Type checking',
  'diag.span.layout': 'Laying out rows and columns',
  'diag.span.history': 'Adding to undo history',
  'diag.span.dirty': 'Change comparison',
  'diag.span.grid': 'Redrawing the table',
  'diag.span.render': 'Updating the screen',
  'diag.span.save': 'Save round trip',
  'mcp.starting': 'Starting…',
  'mcp.copyToken': 'Copy access token',
  'mcp.copied': 'Token copied',
  'mcp.copyConfig': 'Copy client settings',
  'mcp.copiedConfig': 'Settings copied',
  'mcp.writeConfig': 'Add settings to the open folder',
  'mcp.wroteConfig': 'Settings written',
  'mcp.writeConfigFailed': 'The settings could not be written',
  'mcp.writeConfigNote':
    'Writes .mcp.json into the open folder. It holds an access token, so in a Git repository it is added to .gitignore. Settings already in the file are kept.',
  'mcp.howto': 'How to connect an AI client',
  'mcp.howtoStep1': 'Press “Add settings to the open folder” above.',
  'mcp.howtoStep2':
    'Start your AI client in that folder (Claude Code and other clients that read .mcp.json pick it up on their own).',
  'mcp.howtoStep3':
    'For a client that does not read .mcp.json, press “Copy client settings” and paste them into its MCP settings.',
  'mcp.howtoNote':
    'The address and access token stay the same the next time you start the app, so settings you wrote or pasted keep working.',
  'mcp.logsEmpty': 'Actions from your AI client will appear here',
  'mcp.logsDisabled': 'The server is not running, so no actions are recorded',
  'mcp.askAi': 'Copy a request for your AI',
  'mcp.askedAi': 'Copied — paste it to your AI',
  'mcp.askAiText':
    'The md-business desktop app cannot start its MCP server because Node was not found.\n' +
    'Please install Node 20 or later on this machine.\n' +
    'The app looks in PATH and in the default locations of the official installer, fnm, nvm, Volta, scoop and Homebrew, so any of them is fine.\n' +
    'Tell me when it is done — I will press “Look again” in the app’s MCP tab.',
  'mcp.askAiNote':
    'Paste this to the AI you already have open. It can install Node for you.',
  'mcp.retry': 'Look again',
  'mcp.retryFailed': 'Node was still not found',
  'mcp.reason.sidecarMissing': 'MCP server files were not found',
  'mcp.reason.nodeMissing':
    'Node was not found. Install Node 20 or later, then restart this app to enable MCP',
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
  'help.scGridMark': 'Mark / unmark the selection',
  'help.license': 'License',
  'help.repository': 'Repository',
  'help.openInBrowser': 'Open in browser',
  'layout.railDividerLabel': 'Resize explorer (double-click to reset width)',
  'page.conflictChanged': 'This file was changed externally',
  'page.conflictReload': 'Reload (discard edits)',
  'page.conflictKeep': 'Keep edits',
  'page.tabsLabel': 'Open documents',
  'page.tabClose': 'Close',
  'page.tabUnsaved': 'Unsaved',
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
  'page.sheetPreviewBtn': '🖨 Print view',
  'page.sheetPreviewTitle': 'See how the sheet prints, and export it to PDF / HTML / image',
  'page.sheetGridBtn': '↩ Back to grid',
  'page.sheetGridTitle': 'Back to editing the table',
  'page.compareBtn': 'Compare with a past version',
  'page.compareTitle': 'Mark what changed against the version in the selected commit',
  'page.compareTarget': 'Compare against',
  'page.compareNoHistory': 'This file has no history yet',
  'page.compareMissing': 'That version does not contain this file',
  'page.compareUnreadable': 'That version is not a test sheet',
  'page.compareNoRowId': 'That version has no row IDs, so it cannot be compared',
  'page.compareResult': '{cells} changed · {rows} added · {removed} deleted',
  'page.compareSame': 'No change since that version',
  'page.compareRemovedTitle': 'Deleted rows',
  'page.exportPick': 'Export as',
  'page.exportCopyBtn': 'Copy',
  'page.exportCopyTitle': 'Copy the sheet in the chosen format, ready to paste into a spreadsheet (hidden rows stay out)',
  'page.exportCopied': 'Copied',
  'page.exportFailed': 'Could not copy',
  'page.importReadBtn': 'Import back',
  'page.importReadTitle': 'Read the returned sheet from the clipboard and count what can go back into this sheet (nothing is written yet)',
  'page.importApplyBtn': 'Write back ({count})',
  'page.importApplyTitle': 'Write the counted cells back into this sheet (undo restores them)',
  'page.importChanges': '{count} cells can go back',
  'page.importNone': 'Nothing to write back',
  'page.importApplied': 'Wrote back {count} cells',
  'page.importUnknown': 'Not in this sheet: {keys}',
  'page.importDuplicate': 'Appears twice: {keys}',
  'page.importMissing': 'Columns not in what was pasted: {columns}',
  'page.importLocked': 'Columns left alone: {columns}',
  'page.importSkipped': 'Rows with an empty key: {count}',
  'page.importNoKey': 'This format has no key= column, so it cannot come back',
  'page.importFolded': 'This format folds line breaks into spaces, so it cannot come back',
  'page.importNoKeyColumn': 'What was pasted has no key column',
  'page.importFailed': 'Could not read what was pasted',
  'page.expandBtn': 'Expand viewpoints',
  'page.expandTitle': 'Add viewpoints from the shared master that this sheet does not have yet (existing rows are left alone)',
  'page.expandAdded': 'Added {count} rows',
  'page.expandNone': 'Nothing to add',
  'page.expandOrphans': 'Not in the master: {keys}',
  'page.expandMissing': 'Columns missing from the master: {columns}',
  'page.expandUnread': 'Could not read the master: {path}',
  'page.viewportPhoneTitle': 'View at phone width',
  'page.viewportPcTitle': 'Back to desktop width',
  'page.viewportPhoneBtn': 'Phone width',
  'page.viewportPcBtn': 'Desktop width',
  'page.previewHead': 'Preview',
  'page.previewTitle': '{label} preview',
  'page.frontmatterHint': 'Check the frontmatter format (the top block enclosed by ---)',
  'page.linkOutsideFolder': 'This link points outside the opened folder ({path})',
  'page.linkHeadingMissing': 'Opened the file, but the heading "{heading}" was not found',
  'page.linkNotOpenable': 'This link cannot be opened ({href})',
  'page.dataHead': 'Reference data',
  'data.readOnly': 'Read-only',
  'data.refused': 'This file could not be opened. {detail}',
  'data.atLine': 'Line {line}: {detail}',
  'data.size': 'The file is too large.',
  'data.syntax': 'The format is broken.',
  'data.depth': 'It nests too deeply.',
  'data.nodes': 'It holds too many values.',
  'data.doctype':
    'Files with a document type declaration (DTD) are not opened, because reading one can pull in other files and expand a small file into a very large one.',
  'data.entity': 'Files that reference an externally defined entity are not opened.',
  'data.unsupported': 'This view opens .json and .xml files.',
  'imageView.head': 'Image',
  'imageView.readOnly': 'Read-only',
  'imageView.fit': 'Fit',
  'imageView.actual': 'Actual size',
  'imageView.fitTitle': 'Fit the whole image in the pane',
  'imageView.actualTitle': 'Show the image at its actual size',
  'imageView.inlineFailed': 'Cannot read the image: {ref} ({message})',
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
  'chart.failed': 'Could not draw the chart. {detail}',
  'chart.atLine': 'Line {line}: {detail}',
  'chart.empty': 'The block is empty. Write type, source, x and y.',
  'chart.syntax': 'this line is not written as `name: value` ({raw}).',
  'chart.unknownKey': 'unknown setting ({raw}).',
  'chart.duplicateKey': 'the same setting is written twice ({raw}).',
  'chart.missing': 'a setting is missing ({raw}).',
  'chart.badType': 'unsupported chart type ({raw}). Use line, bar or pie.',
  'chart.noColumn': 'the table has no such column ({raw}).',
  'chart.noRows': 'the table has no rows.',
  'chart.noNumbers': 'no value in this column reads as a number ({raw}).',
  'chart.badPath': 'this file is not inside the open folder ({raw}).',
  'chart.readFailed': 'could not read the table ({raw}).',
  'chart.unreadableCells': '{raw} cell(s) did not read as a number and were left blank in the chart.',
  'update.dialogLabel': 'Application update',
  'update.checkingTitle': 'Checking for updates…',
  'update.upToDateTitle': 'You are up to date',
  'update.upToDateDesc': 'You are running the latest version of md-business.',
  'update.historyLabel': "What's changed so far",
  'update.more': 'See more',
  'update.availableTitle': 'Version {version} is available',
  'update.notesLabel': "What's changed",
  'update.later': 'Later',
  'update.installNow': 'Update now',
  'update.downloadingTitle': 'Downloading… {percent}%',
  'update.installingTitle': 'Installing…',
  'update.installingDesc': 'Applying the update. This will take a moment.',
  'update.readyTitle': 'Ready to update',
  'update.readyDesc': 'Restart the app to apply v{version}.',
  'update.relaunch': 'Restart now',
  'update.errorTitle': 'Could not update',
  'grid.regionLabel': 'Test sheet editing grid',
  'grid.emptyColumns': 'No columns are defined (open a TSV that has a header row)',
  'grid.rowNumber': 'Row number',
  'grid.required': 'Required',
  'grid.multiline': 'Line breaks allowed (Alt / Ctrl / Shift + Enter)',
  'grid.defaultGroupLabel': 'Group',
  'grid.computedCell': 'Computed column (the value is filled in for you)',
  'grid.jumpNoColumn': 'There is no column named “{column}”',
  'grid.jumpNoRow': 'No row has {column} set to “{value}”',
  'grid.jumpMultiple': '{count} rows match. Moved to the first one',
  'grid.linkGaps': 'Linked sheets: {count} to check',
  'grid.splitRows':
    '{count} record(s) may be split across lines by a raw newline inside a cell (write a cell newline as \n).',
  'grid.splitGo': 'Go to it',
  'grid.splitDismiss': 'Dismiss',
  'grid.linkGapsTitle': 'Found in the sheets this one points at. Open them to fix.',
  'grid.pasteDroppedComputed': '{count} cells in computed columns were not pasted',
  'grid.rowLabel': 'Row {row}',
  'grid.modeEditing': 'Editing',
  'grid.modeSelecting': 'Selecting',
  'grid.selectionSize': '{rows}×{cols} selected',
  'grid.selectionSummary':
    '{count} values · sum {sum} · avg {average} · min {min} · max {max}',
  'grid.noteEdit': 'Click to edit this note',
  'grid.noteDelete': 'Delete this note',
  'grid.notePlaceholder': 'Type a note… (Enter to confirm, Esc to cancel)',
  'grid.noteFolded': '{count} notes',
  'grid.noteFoldOpen': 'Show the notes',
  'grid.noteFoldClose': 'Hide the notes',
  'grid.groupRename': 'Click to rename this group',
  'grid.groupDelete': 'Delete this group',
  'grid.colResizeLabel': 'Change the width of the {name} column',
  'grid.colResizeTitle': 'Drag to resize / double-click to fit the contents',
  'grid.rowResizeLabel': 'Change the height of row {row}',
  'grid.rowResizeTitle': 'Drag to resize / double-click to restore the default',
  'grid.addRow': '＋ Add a row at the end',
  'grid.addRowTitle': 'Add one empty row at the bottom of the sheet',
  'grid.duplicateRow': 'Duplicate below',
  'grid.duplicateRowTitle': 'Add a row with the same contents directly below the selected row',
  'grid.copyRow': 'Copy row',
  'grid.copyRowTitle': 'Copy the selected row to the clipboard',
  'grid.clearRow': 'Clear row',
  'grid.clearRowTitle': 'Erase only the contents of the selected row (the row stays)',
  'grid.fillDown': 'Fill down',
  'grid.fillDownTitle':
    'Copy the first row of the selection into the rows below (Ctrl+D). For a single cell, take the value directly above',
  'grid.deleteRow': 'Delete row',
  'grid.deleteRowTitle':
    'Remove the selected row from the sheet (cannot be undone; keep it aside if unsure)',
  'grid.hideRow': 'Keep row aside',
  'grid.hideRowTitle': 'Take the row out of the sheet while keeping it in the file',
  'grid.unhideRow': 'Bring row back',
  'grid.unhideRowTitle': 'Stop keeping it aside and make it a normal row again',
  'grid.addNote': '＋ Note row',
  'grid.addNoteTitle': 'Add one note line above the sheet',
  'grid.addGroup': '＋ Group',
  'grid.addGroupTitle': 'Create a group heading over the selected columns',
  'grid.revealShow': 'Show {count} rows kept aside',
  'grid.revealShowTitle': 'Show the rows kept aside so you can check what is in them',
  'grid.revealHide': 'Hide {count} rows kept aside',
  'grid.revealHideTitle': 'Take the rows kept aside back out of the sheet',
  'grid.menuClose': 'Close the menu',
  'grid.colMenuText': 'Text display for the {name} column',
  'grid.colMenuAlign': 'Alignment',
  'grid.rowMenuHead': 'Row {row}',
  'grid.blame': 'History',
  'grid.blameTitle': 'Show who last changed each row (from git)',
  'grid.blameUncommitted': 'Not committed yet',
  'grid.diffChanged': 'Changed since that version',
  'grid.diffMarked': 'Marked by hand',
  'grid.diffAddedRow': 'Row added since that version',
  'grid.diffAddedColumn': 'Column added since that version',
  'grid.colModeClip': 'Cut off (ellipsis)',
  'grid.colModeWrap': 'Wrap',
  'grid.colModeOverflow': 'Spill over',
  'grid.colAlignLeft': 'Left',
  'grid.colAlignCenter': 'Center',
  'grid.colAlignRight': 'Right',
};

const ja: Messages = {
  'app.docPlaceholder': '文書を選択してください',
  'app.unsaved': '未保存',
  'app.unsavedLong': '未保存の変更があります',
  'common.close': '閉じる',
  'menu.bar': 'メニュー',
  'menu.file': 'ファイル',
  'menu.export': '書き出し',
  'menu.view': '表示',
  'action.save': '保存',
  'action.saving': '保存中…',
  'action.saveTitle': '保存（Ctrl+S / ⌘S）',
  'action.pdf': 'PDF',
  'action.pdfExport': 'PDF 出力',
  'action.pdfTitle': 'PDF 出力（Ctrl+P / ⌘P・プレビューを A4 で印刷／保存）',
  'action.html': 'HTML',
  'action.htmlTitle': 'HTML 出力（1 ファイル・文書と同じ場所へ書き出す）',
  'action.htmlDone': '{path} へ書き出しました',
  'action.image': '画像',
  'action.imageTitle': 'この文書を PNG / JPEG の画像として書き出します',
  'action.imageDone': '{path} へ書き出しました',
  'image.size': '寸法',
  'image.scale': '倍率',
  'image.format': '形式',
  'image.quality': '画質',
  'image.shoot': 'この設定で書き出す',
  'image.preset.ogp': 'OGP / リンク先の見出し画像',
  'image.preset.x-post': 'X の投稿',
  'image.preset.instagram-post': 'Instagram の投稿',
  'image.preset.instagram-story': 'Instagram のストーリー',
  'image.preset.full-hd': 'フル HD',
  'image.preset.web-banner': 'Web バナー',
  'image.format.png': 'PNG',
  'image.format.pngTransparent': 'PNG（透過）',
  'image.format.jpeg': 'JPEG',
  // 一括生成（表の 1 行を 1 枚に差し込む）
  'batch.run': '表の行ごとに一括で書き出す',
  'batch.stop': '中止',
  'batch.progress': '{done} / {total} 枚',
  'batch.done': '{count} 枚書き出しました',
  'batch.failed': '一括で書き出せません: {detail}',
  'batch.notDeclared': 'この文書に batch: の指定がありません',
  'batch.badDeclaration': 'batch: の {raw} が指定されていません',
  'batch.noRows': '{raw} に中身の行がありません',
  'batch.noColumn': '表に {raw} の列がありません',
  'batch.emptyName': '{raw} 行目の名前が空になります',
  'batch.duplicateName': '同じ名前が 2 つできます: {raw}',
  'batch.tooMany': '行が多すぎます（{raw}）',
  'batch.badPath': '開いているフォルダの外を指しています: {raw}',
  'batch.readFailed': '表を読めません: {raw}',
  'batch.missingFont': '手元にない字が指定されています: {raw}',
  'batch.stopped': '{count} 枚で中止しました',
  'action.site': 'サイト',
  'action.siteTitle': 'サイト出力（フォルダ内の文書をまとめて dist/ へ書き出す）',
  'action.siteDone': '{dir}/ へ {count} 件書き出しました',
  'action.siteDoneSkipped': '{dir}/ へ {count} 件書き出しました（{skipped} 件は出せませんでした）',
  'action.siteNone': 'ページに出来る文書がありませんでした',
  'action.browser': 'ブラウザ',
  'action.browserTitle': 'ブラウザで見る（この PC の中だけのアドレスで開く）',
  'action.browserStopTitle': 'ブラウザへの表示をやめる',
  'action.browserServing': '{url} で表示中',
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
  'search.inGrid': '検証シート',
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
  'scm.pickFile': '{path} をコミットに含める',
  'scm.commitHead': 'コミット',
  'scm.messagePlaceholder': '変更の概要を入力（Ctrl/⌘+Enter でコミット）',
  'scm.working': '処理中…',
  'scm.commit': 'コミット',
  'scm.commitCount': '{count} 件をコミット',
  'scm.stageHint': 'チェックしたファイルだけをコミットします。外したものは次回に回せます。',
  'scm.history': '履歴',
  'scm.noHistory': 'まだコミットがありません',
  'scm.commitTitle': '{hash} ・ {author}',
  'scm.init': 'Git で管理する',
  'scm.initTitle': 'このフォルダに履歴を作ります。送り先の設定はしません',
  'scm.initialized': 'このフォルダを Git で管理するようにしました',
  'scm.clone': '複製する',
  'scm.cloneTitle':
    '空のフォルダへ、既にあるリポジトリを複製します。認証は OS に預けてある資格情報が答えます',
  'scm.cloneUrlPlaceholder': '複製元（https:// / git@ホスト:パス）',
  'scm.cloned': 'このフォルダへリポジトリを複製しました',
  'scm.openForge': 'ブラウザで開く',
  'scm.openForgeTitle': '送り先が返した URL（PR を作る画面など）をブラウザで開きます',
  'scm.switchTitle': 'ブランチを切り替える',
  'scm.switched': '{branch} へ切り替えました',
  'scm.newBranch': '作る',
  'scm.newBranchTitle': 'いまいる場所から新しいブランチを作って切り替えます',
  'scm.newBranchPlaceholder': 'ブランチ名',
  'scm.branchCreated': '{branch} を作って切り替えました',
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
  'tree.openAsk': '{folder} を開きますか',
  'tree.openAskHint': 'ほかのプログラムから {path} を出すよう頼まれました。これまでに開いたどのフォルダの中にもありません。',
  'tree.openAskYes': '開く',
  'tree.openAskNo': '開かない',
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
  'tree.menuCopyShareLink': '共有リンクをコピー',
  'tree.menuOpenForge': 'リモートで開く',
  'tree.renameHint': 'Enter で確定・Esc で取り消し',
  'tree.renameErrorEmpty': '名前を入力してください',
  'tree.renameErrorSeparator': '名前に区切り文字は使えません',
  'tree.renameErrorInvalidChar': '名前に使えない文字が含まれています',
  'tree.renameErrorExtension': '拡張子は .md / .tsv のままにしてください',
  'tree.menuNewTestSheet': '検証シートを新規作成',
  'tree.menuFileInfo': 'ファイル情報',
  'fileInfo.title': 'ファイル情報',
  'fileInfo.path': 'パス',
  'fileInfo.size': '容量',
  'fileInfo.modified': '更新日時',
  'fileInfo.lines': '行数',
  'fileInfo.encoding': '文字コード',
  'fileInfo.lineEnding': '改行コード',
  'fileInfo.sha256': 'SHA-256',
  'fileInfo.git': 'Git 管理状態',
  'fileInfo.measuring': '測定中…',
  'fileInfo.unknown': '判定できません',
  'fileInfo.failed': '取得できませんでした',
  'fileInfo.copy': 'コピー',
  'fileInfo.copied': 'コピーしました',
  'fileInfo.encUtf8': 'UTF-8',
  'fileInfo.encUtf8Bom': 'UTF-8（BOM 付き）',
  'fileInfo.encUtf16Le': 'UTF-16 LE',
  'fileInfo.encUtf16Be': 'UTF-16 BE',
  'fileInfo.encUnknown': '判定できません',
  'fileInfo.eolLf': 'LF（Unix）',
  'fileInfo.eolCrlf': 'CRLF（Windows）',
  'fileInfo.eolCr': 'CR（旧 Mac）',
  'fileInfo.eolMixed': '混在',
  'fileInfo.eolNone': '改行なし',
  'fileInfo.gitNotRepo': 'Git 管理外',
  'fileInfo.gitIgnored': '除外設定（.gitignore）',
  'fileInfo.gitUntracked': '未追跡',
  'fileInfo.gitTracked': '変更なし',
  'fileInfo.gitModified': '変更あり',
  'fileInfo.gitAdded': '追加（未コミット）',
  'fileInfo.gitDeleted': '削除',
  'fileInfo.gitRenamed': '名前の変更',
  'fileInfo.gitConflicted': '衝突',
  'newSheet.title': '検証シートを新規作成',
  'newSheet.folder': '作成先',
  'newSheet.folderRoot': '開いているフォルダの直下',
  'newSheet.preset': 'ひな形',
  'newSheet.presetTestCase': '試験ケース',
  'newSheet.presetTestCaseDesc': '手順と期待結果を 1 件ずつ並べて、上から実施していく形。',
  'newSheet.presetViewpoint': '観点表',
  'newSheet.presetViewpointDesc': '確かめたい観点を分類ごとに挙げて、抜けを見つける形。',
  'newSheet.presetReview': '指摘一覧',
  'newSheet.presetReviewDesc': '受けた指摘と、その指し先、どこまで進んだかを並べる形。',
  'newSheet.fileName': 'ファイル名',
  'newSheet.fileNamePlaceholder': '001-login',
  'newSheet.fileNameHint': '省略すると .tsv を付けます',
  'newSheet.sheetTitle': 'タイトル（任意）',
  'newSheet.sheetTitlePlaceholder': '受発注ワークフロー 検証シート',
  'newSheet.create': '作成',
  'newSheet.cancel': '取り消し',
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
  'timeline.open': '時系列',
  'timeline.openTitle': 'ログを時刻順に並べて見る',
  'timeline.head': '時系列',
  'timeline.files': 'ログを選ぶ',
  'timeline.filesEmpty': 'このフォルダにログ（.log / .jsonl / .ndjson）はありません',
  'timeline.filesTruncated': '多すぎるため一部だけ出しています',
  'timeline.rescan': '一覧を取り直す',
  'timeline.prepare': '中身を見て候補を出す',
  'timeline.preparing': '読んでいます',
  'timeline.candidateNote': 'ここに出るのは候補です。合っているかは中身を見て決めてください。',
  'timeline.timeField': '時刻の項目',
  'timeline.guess': '推定',
  'timeline.chosen': '選択済み',
  'timeline.evidence.nameAndValue': '名前も値も時刻',
  'timeline.evidence.valueOnly': '値が時刻として読めた',
  'timeline.evidence.nameOnly': '名前は時刻らしいが、値は時刻として読めない',
  'timeline.parsed': '{sampled} 件中 {parsed} 件読めた',
  'timeline.noCandidate': '候補なし — 項目名を打ってください',
  'timeline.unreadable': '読めません',
  'timeline.skipped': '読めなかった行 {count}',
  'timeline.joinKey': '突き合わせる項目',
  'timeline.joinNone': '選ばない',
  'timeline.joinExact': '名前が一致',
  'timeline.joinNormalized': '名前が違うので書き方を揃えて寄せた',
  'timeline.shared': '2 つ以上のファイルに現れた値 {count} 種類',
  'timeline.build': '時系列を組む',
  'timeline.building': '組んでいます',
  'timeline.colTime': '時刻',
  'timeline.colSource': '出どころ',
  'timeline.colLine': '行',
  'timeline.colRecord': '中身',
  'timeline.unknownTime': '時刻不明',
  'timeline.empty': 'ログを選んで [時系列を組む] を押してください',
  'timeline.truncated': '上限で切りました。この先があります',
  'timeline.unknownCount': '時刻が読めなかった出来事 {count} 件',
  'timeline.maskedNote': '伏せ字はここでは外せません。',
  'diag.tab': '診断',
  'diag.scale': '規模',
  'diag.chars': '文字',
  'diag.rows': '行',
  'diag.columns': '列',
  'diag.domRows': '画面に出ている行',
  'diag.historyChars': '履歴が持つ文字数',
  'diag.span': '区間',
  'diag.last': '直近',
  'diag.median': '中央値',
  'diag.max': '最大',
  'diag.count': '件数',
  'diag.empty': '検証シートを編集すると、かかった時間がここに並びます',
  'diag.copy': '数字を写す',
  'diag.copied': '写しました',
  'diag.clear': '記録を捨てる',
  'diag.note': '単位はミリ秒。画面への反映には差分判定の時間も含まれます。',
  'diag.span.serialize': '本文の組み直し',
  'diag.span.parse': '本文の読み直し',
  'diag.span.validate': '型検査',
  'diag.span.layout': '行と列の割りつけ',
  'diag.span.history': '履歴への積み増し',
  'diag.span.dirty': '差分判定',
  'diag.span.grid': '表の組み直し',
  'diag.span.render': '画面への反映',
  'diag.span.save': '保存の往復',
  'mcp.starting': '起動中…',
  'mcp.copyToken': '接続トークンを写す',
  'mcp.copied': 'トークンを写しました',
  'mcp.copyConfig': '接続設定を写す',
  'mcp.copiedConfig': '接続設定を写しました',
  'mcp.writeConfig': '開いているフォルダへ設定を置く',
  'mcp.wroteConfig': '設定を置きました',
  'mcp.writeConfigFailed': '設定を置けませんでした',
  'mcp.writeConfigNote':
    '開いているフォルダに .mcp.json を書く。接続トークンが入るので、Git リポジトリなら .gitignore へ追記する。すでにある設定は残す。',
  'mcp.howto': 'AI クライアントとつなぐ手順',
  'mcp.howtoStep1': '上の「開いているフォルダへ設定を置く」を押す。',
  'mcp.howtoStep2':
    'そのフォルダで AI クライアントを開く（Claude Code など .mcp.json を読むものは自分で見つける）。',
  'mcp.howtoStep3':
    '.mcp.json を読まないクライアントは「接続設定を写す」で写し、そのクライアントの MCP 設定へ貼る。',
  'mcp.howtoNote':
    '接続先とトークンは次に起動しても変わらないので、置いた設定・貼った設定はそのまま使い続けられる。',
  'mcp.logsEmpty': 'AI からの操作がここに並びます',
  'mcp.logsDisabled': 'サーバーが動いていないため操作は記録されません',
  'mcp.askAi': 'AI に頼む文をコピー',
  'mcp.askedAi': 'コピーしました。AI に貼ってください',
  'mcp.askAiText':
    'md-business のデスクトップアプリが Node を見つけられず、MCP サーバーを起動できていません。\n' +
    'この PC に Node 20 以上を入れてください。\n' +
    'アプリは PATH のほか、公式インストーラ・fnm・nvm・Volta・scoop・Homebrew の既定の導入先を見に行くので、どれで入れても構いません。\n' +
    '入れ終わったら教えてください。アプリの MCP タブで「もう一度さがす」を押します。',
  'mcp.askAiNote': '開いている AI に貼るだけで、Node の導入まで任せられます。',
  'mcp.retry': 'もう一度さがす',
  'mcp.retryFailed': 'まだ Node が見つかりません',
  'mcp.reason.sidecarMissing': 'MCP サーバー本体が見つかりません',
  'mcp.reason.nodeMissing':
    'Node が見つかりません。Node 20 以上を入れてアプリを起動し直すと MCP 連携が使えます',
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
  'help.scGridMark': '選択範囲の印を付け外し',
  'help.license': 'ライセンス',
  'help.repository': 'リポジトリ',
  'help.openInBrowser': 'ブラウザで開く',
  'layout.railDividerLabel': 'エクスプローラーの幅を調整（ダブルクリックで初期幅に戻す）',
  'page.conflictChanged': '外部でこのファイルが変更されました',
  'page.conflictReload': '再読込（編集を破棄）',
  'page.conflictKeep': '編集を残す',
  'page.tabsLabel': '開いている文書',
  'page.tabClose': '閉じる',
  'page.tabUnsaved': '未保存',
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
  'page.sheetPreviewBtn': '🖨 下見',
  'page.sheetPreviewTitle': '紙に刷ったときの見た目を確かめる（PDF・HTML・画像はここから）',
  'page.sheetGridBtn': '↩ グリッドへ戻る',
  'page.sheetGridTitle': '表の編集に戻る',
  'page.compareBtn': '前の版と比べる',
  'page.compareTitle': '選んだコミットの版と突き合わせて、変わったところに印を付ける',
  'page.compareTarget': '比べる版',
  'page.compareNoHistory': 'このファイルの履歴がまだありません',
  'page.compareMissing': 'その版にこのファイルはありません',
  'page.compareUnreadable': 'その版の中身は検証シートではありません',
  'page.compareNoRowId': 'その版には行 ID がないので比べられません',
  'page.compareResult': '変わったセル {cells} · 増えた行 {rows} · 消えた行 {removed}',
  'page.compareSame': '前の版から変わっていません',
  'page.compareRemovedTitle': '消えた行',
  'page.exportPick': '提出様式',
  'page.exportCopyBtn': 'コピー',
  'page.exportCopyTitle': '選んだ様式で、表計算へ貼れる形にしてコピーする（控え行は出さない）',
  'page.exportCopied': 'コピーしました',
  'page.exportFailed': 'コピーできませんでした',
  'page.importReadBtn': '取り込む',
  'page.importReadTitle': '返ってきた提出物を貼り付けから読み、正本へ戻せるセルを数える（まだ書き換えない）',
  'page.importApplyBtn': '書き戻す（{count}）',
  'page.importApplyTitle': '数えたセルを正本へ書き戻す（取り消しで戻せる）',
  'page.importChanges': '戻せるセル {count}',
  'page.importNone': '戻すセルはありません',
  'page.importApplied': '{count} セルを書き戻しました',
  'page.importUnknown': '正本に無いキー: {keys}',
  'page.importDuplicate': '2 回出たキー: {keys}',
  'page.importMissing': '貼り付けに無い列: {columns}',
  'page.importLocked': '書き戻さない列: {columns}',
  'page.importSkipped': 'キーが空の行 {count}',
  'page.importNoKey': 'この様式には key= が無いので戻せません',
  'page.importFolded': 'この様式は改行を空白に畳むので戻せません',
  'page.importNoKeyColumn': '貼り付けにキー列がありません',
  'page.importFailed': '貼り付けを読めませんでした',
  'page.expandBtn': '観点を展開',
  'page.expandTitle': '共通観点マスタから、このシートにまだ無い観点を足す（既にある行はそのまま）',
  'page.expandAdded': '{count} 行足しました',
  'page.expandNone': '足す観点はありません',
  'page.expandOrphans': 'マスタに無いキー: {keys}',
  'page.expandMissing': 'マスタに無い列: {columns}',
  'page.expandUnread': 'マスタを読めません: {path}',
  'page.viewportPhoneTitle': 'スマートフォンの幅で見る',
  'page.viewportPcTitle': 'PC の幅に戻す',
  'page.viewportPhoneBtn': 'スマホ幅',
  'page.viewportPcBtn': 'PC 幅',
  'page.previewHead': 'プレビュー',
  'page.previewTitle': '{label}プレビュー',
  'page.frontmatterHint': 'frontmatter（--- で囲む先頭ブロック）の書式を確認してください',
  'page.linkOutsideFolder': 'この指し先は、開いているフォルダの外にあります（{path}）',
  'page.linkHeadingMissing': 'ファイルは開きましたが、見出し「{heading}」は見つかりませんでした',
  'page.linkNotOpenable': 'このリンクは開けません（{href}）',
  'page.dataHead': '参考データ',
  'data.readOnly': '読み取り専用',
  'data.refused': 'このファイルは開けませんでした。{detail}',
  'data.atLine': '{line} 行目: {detail}',
  'data.size': 'ファイルが大きすぎます。',
  'data.syntax': '書式が壊れています。',
  'data.depth': '入れ子が深すぎます。',
  'data.nodes': '項目が多すぎます。',
  'data.doctype':
    '文書型宣言（DTD）を含むファイルは開きません。読み込むと、ほかのファイルを引き込んだり、小さなファイルが巨大に展開されたりするためです。',
  'data.entity': '外部で定義された実体参照を含むファイルは開きません。',
  'data.unsupported': 'この画面で開けるのは .json と .xml です。',
  'imageView.head': '画像',
  'imageView.readOnly': '読み取り専用',
  'imageView.fit': '全体',
  'imageView.actual': '原寸',
  'imageView.fitTitle': '画面に合わせて全体を出す',
  'imageView.actualTitle': '原寸で出す',
  'imageView.inlineFailed': '画像を読めません: {ref}（{message}）',
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
  'chart.failed': '図を描けません。{detail}',
  'chart.atLine': '{line} 行目: {detail}',
  'chart.empty': '指定が空です。type / source / x / y を書いてください。',
  'chart.syntax': '`名前: 値` の形になっていません（{raw}）。',
  'chart.unknownKey': '知らない指定です（{raw}）。',
  'chart.duplicateKey': '同じ指定が 2 度書かれています（{raw}）。',
  'chart.missing': '指定が足りません（{raw}）。',
  'chart.badType': '扱えない種類です（{raw}）。line / bar / pie のどれかを書いてください。',
  'chart.noColumn': '表にその列がありません（{raw}）。',
  'chart.noRows': '表に行がありません。',
  'chart.noNumbers': 'その列に数として読める値がありません（{raw}）。',
  'chart.badPath': '開いているフォルダの中にありません（{raw}）。',
  'chart.readFailed': '表を読めません（{raw}）。',
  'chart.unreadableCells': '数として読めないセルが {raw} 個ありました。その分は図では空けてあります。',
  'update.dialogLabel': 'アプリの更新',
  'update.checkingTitle': '更新を確認しています…',
  'update.upToDateTitle': '最新の状態です',
  'update.upToDateDesc': 'お使いの md-business は最新バージョンです。',
  'update.historyLabel': 'これまでの更新内容',
  'update.more': 'もっと見る',
  'update.availableTitle': '新しいバージョン v{version} があります',
  'update.notesLabel': '更新内容',
  'update.later': '後で',
  'update.installNow': '今すぐ更新',
  'update.downloadingTitle': 'ダウンロード中… {percent}%',
  'update.installingTitle': 'インストール中…',
  'update.installingDesc': '更新を適用しています。しばらくお待ちください。',
  'update.readyTitle': '更新の準備ができました',
  'update.readyDesc': 'v{version} を適用するにはアプリを再起動してください。',
  'update.relaunch': '再起動して完了',
  'update.errorTitle': '更新できませんでした',
  'grid.regionLabel': '検証シート編集グリッド',
  'grid.emptyColumns': '列定義がありません（ヘッダ行のある TSV を開いてください）',
  'grid.rowNumber': '行番号',
  'grid.required': '必須',
  'grid.multiline': 'セルの中で改行できる列（Alt / Ctrl / Shift + Enter）',
  'grid.defaultGroupLabel': 'グループ',
  'grid.computedCell': '計算列（値は自動で決まる）',
  'grid.jumpNoColumn': '「{column}」という列がありません',
  'grid.jumpNoRow': '{column} が「{value}」の行はありません',
  'grid.jumpMultiple': '{count} 行あります。最初の行へ移動しました',
  'grid.linkGaps': '参照先に {count} 件',
  'grid.splitRows': 'セルの中で改行して {count} 件の行が割れている可能性があります（セル内改行は \n）。',
  'grid.splitGo': 'その行へ',
  'grid.splitDismiss': '閉じる',
  'grid.linkGapsTitle': 'このシートが指している側で見つかったものです。相手を開いて直します。',
  'grid.pasteDroppedComputed': '計算列の {count} セルは貼り付けていません',
  'grid.rowLabel': '{row} 行目',
  'grid.modeEditing': '編集中',
  'grid.modeSelecting': '選択中',
  'grid.selectionSize': '{rows}×{cols} 選択',
  'grid.selectionSummary':
    '数値 {count} · 合計 {sum} · 平均 {average} · 最小 {min} · 最大 {max}',
  'grid.noteEdit': 'クリックで補足を編集',
  'grid.noteDelete': 'この補足を削除',
  'grid.notePlaceholder': '補足を入力…（Enter で確定・Esc で取消）',
  'grid.noteFolded': '補足 {count} 件',
  'grid.noteFoldOpen': '補足を出す',
  'grid.noteFoldClose': '補足を畳む',
  'grid.groupRename': 'クリックで大分類を改名',
  'grid.groupDelete': 'この大分類を削除',
  'grid.colResizeLabel': '{name} 列の幅を変更',
  'grid.colResizeTitle': 'ドラッグで幅変更／ダブルクリックで自動幅',
  'grid.rowResizeLabel': '{row} 行目の高さを変更',
  'grid.rowResizeTitle': 'ドラッグで高さ変更／ダブルクリックで既定に戻す',
  'grid.addRow': '＋ 末尾に行を追加',
  'grid.addRowTitle': '表の一番下に空の行を 1 本足す',
  'grid.duplicateRow': '選択行の下に複製',
  'grid.duplicateRowTitle': '選択行と同じ内容の行を、そのすぐ下に足す',
  'grid.copyRow': '選択行をコピー',
  'grid.copyRowTitle': '選択行をクリップボードへ写す',
  'grid.clearRow': '選択行をクリア',
  'grid.clearRowTitle': '選択行の中身だけを消す（行は残る）',
  'grid.fillDown': '下へ埋める',
  'grid.fillDownTitle': '選択範囲の先頭行の値を下の行へ配る（Ctrl+D）。単一セルなら直上の値を引く',
  'grid.deleteRow': '選択行を削除',
  'grid.deleteRowTitle': '選択行を表から取り除く（戻せない。迷うなら控えに）',
  'grid.hideRow': '選択行を控えに',
  'grid.hideRowTitle': '行をファイルに残したまま表から外す',
  'grid.unhideRow': '控えから戻す',
  'grid.unhideRowTitle': '控えをやめて通常の行に戻す',
  'grid.addNote': '＋ 補足行',
  'grid.addNoteTitle': '表の上に置く補足の 1 行を足す',
  'grid.addGroup': '＋ グループ',
  'grid.addGroupTitle': '選択中の列に大分類（グループ見出し）を作成',
  'grid.revealShow': '控え {count} 行を表示',
  'grid.revealShowTitle': '控え行を表に出して中身を確かめる',
  'grid.revealHide': '控え {count} 行を隠す',
  'grid.revealHideTitle': '控え行を表から外す',
  'grid.menuClose': 'メニューを閉じる',
  'grid.colMenuText': '{name} 列のテキスト表示',
  'grid.colMenuAlign': '寄せ',
  'grid.rowMenuHead': '{row} 行目',
  'grid.blame': '履歴',
  'grid.blameTitle': '各行を最後に変えた人とコミットを出す（git より）',
  'grid.blameUncommitted': '未コミット',
  'grid.diffChanged': '前の版から変わりました',
  'grid.diffMarked': '手で印を付けました',
  'grid.diffAddedRow': '前の版にはなかった行',
  'grid.diffAddedColumn': '前の版にはなかった列',
  'grid.colModeClip': '見切れる（省略）',
  'grid.colModeWrap': '折り返す',
  'grid.colModeOverflow': '突き抜ける',
  'grid.colAlignLeft': '左寄せ',
  'grid.colAlignCenter': '中央寄せ',
  'grid.colAlignRight': '右寄せ',
};

const zh: Messages = {
  'app.docPlaceholder': '请选择文档',
  'app.unsaved': '未保存',
  'app.unsavedLong': '有未保存的更改',
  'common.close': '关闭',
  'menu.bar': '菜单栏',
  'menu.file': '文件',
  'menu.export': '导出',
  'menu.view': '显示',
  'action.save': '保存',
  'action.saving': '正在保存…',
  'action.saveTitle': '保存（Ctrl+S / ⌘S）',
  'action.pdf': 'PDF',
  'action.pdfExport': '导出 PDF',
  'action.pdfTitle': '导出 PDF（Ctrl+P / ⌘P・将预览按 A4 打印／保存）',
  'action.html': 'HTML',
  'action.htmlTitle': '导出 HTML（单个文件・保存到文档所在位置）',
  'action.htmlDone': '已导出到 {path}',
  'action.image': '图片',
  'action.imageTitle': '将此文档导出为 PNG / JPEG 图片',
  'action.imageDone': '已导出到 {path}',
  'image.size': '尺寸',
  'image.scale': '倍率',
  'image.format': '格式',
  'image.quality': '画质',
  'image.shoot': '按此设置导出',
  'image.preset.ogp': 'OGP / 链接预览图',
  'image.preset.x-post': 'X 帖子',
  'image.preset.instagram-post': 'Instagram 帖子',
  'image.preset.instagram-story': 'Instagram 快拍',
  'image.preset.full-hd': '全高清',
  'image.preset.web-banner': '网页横幅',
  'image.format.png': 'PNG',
  'image.format.pngTransparent': 'PNG（透明）',
  'image.format.jpeg': 'JPEG',
  // 一括生成（表の 1 行を 1 枚に差し込む）
  'batch.run': '按表格每行批量导出',
  'batch.stop': '中止',
  'batch.progress': '{done} / {total}',
  'batch.done': '已导出 {count} 张',
  'batch.failed': '无法批量导出：{detail}',
  'batch.notDeclared': '本文档没有 batch: 声明',
  'batch.badDeclaration': 'batch: 缺少 {raw}',
  'batch.noRows': '{raw} 中没有数据行',
  'batch.noColumn': '表格中没有 {raw} 列',
  'batch.emptyName': '第 {raw} 行的名称为空',
  'batch.duplicateName': '有两行生成相同的名称：{raw}',
  'batch.tooMany': '行数过多（{raw}）',
  'batch.badPath': '指向已打开文件夹之外：{raw}',
  'batch.readFailed': '无法读取表格：{raw}',
  'batch.missingFont': '本机没有指定的字体：{raw}',
  'batch.stopped': '导出 {count} 张后中止',
  'action.site': '网站',
  'action.siteTitle': '导出网站（将文件夹内的文档一并导出到 dist/）',
  'action.siteDone': '已导出 {count} 个文件到 {dir}/',
  'action.siteDoneSkipped': '已导出 {count} 个文件到 {dir}/（{skipped} 个未能导出）',
  'action.siteNone': '没有可生成页面的文档',
  'action.browser': '浏览器',
  'action.browserTitle': '在浏览器中查看（使用仅限本机的地址打开）',
  'action.browserStopTitle': '停止向浏览器提供页面',
  'action.browserServing': '正在 {url} 提供页面',
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
  'search.inGrid': '验证表',
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
  'scm.pickFile': '将 {path} 纳入本次提交',
  'scm.commitHead': '提交',
  'scm.messagePlaceholder': '输入更改摘要（Ctrl/⌘+Enter 提交）',
  'scm.working': '处理中…',
  'scm.commit': '提交',
  'scm.commitCount': '提交 {count} 项',
  'scm.stageHint': '仅提交已勾选的文件。取消勾选可留到下次提交。',
  'scm.history': '历史',
  'scm.noHistory': '尚无提交',
  'scm.commitTitle': '{hash} ・ {author}',
  'scm.init': '用 Git 管理',
  'scm.initTitle': '在此文件夹中创建本地仓库。不会设置远程地址',
  'scm.initialized': '已将此文件夹纳入 Git 管理',
  'scm.clone': '克隆',
  'scm.cloneTitle': '将已有仓库克隆到这个空文件夹。认证由操作系统保存的凭据完成',
  'scm.cloneUrlPlaceholder': '来源（https:// 或 git@主机:路径）',
  'scm.cloned': '已将仓库克隆到此文件夹',
  'scm.openForge': '在浏览器中打开',
  'scm.openForgeTitle': '在浏览器中打开远程返回的网址（例如新建合并请求的页面）',
  'scm.switchTitle': '切换分支',
  'scm.switched': '已切换到 {branch}',
  'scm.newBranch': '创建',
  'scm.newBranchTitle': '从当前位置创建新分支并切换过去',
  'scm.newBranchPlaceholder': '分支名',
  'scm.branchCreated': '已创建 {branch} 并切换过去',
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
  'tree.openAsk': '要打开文件夹 {folder} 吗？',
  'tree.openAskHint': '其他程序请求显示 {path}。它不在你打开过的任何文件夹中。',
  'tree.openAskYes': '打开',
  'tree.openAskNo': '暂不打开',
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
  'tree.menuCopyShareLink': '复制共享链接',
  'tree.menuOpenForge': '在远程仓库打开',
  'tree.renameHint': 'Enter 确认，Esc 取消',
  'tree.renameErrorEmpty': '请输入名称',
  'tree.renameErrorSeparator': '名称中不能包含路径分隔符',
  'tree.renameErrorInvalidChar': '名称中包含无法使用的字符',
  'tree.renameErrorExtension': '扩展名必须保持为 .md 或 .tsv',
  'tree.menuNewTestSheet': '新建验证表',
  'tree.menuFileInfo': '文件信息',
  'fileInfo.title': '文件信息',
  'fileInfo.path': '路径',
  'fileInfo.size': '大小',
  'fileInfo.modified': '修改时间',
  'fileInfo.lines': '行数',
  'fileInfo.encoding': '字符编码',
  'fileInfo.lineEnding': '换行符',
  'fileInfo.sha256': 'SHA-256',
  'fileInfo.git': 'Git 状态',
  'fileInfo.measuring': '正在计算…',
  'fileInfo.unknown': '无法判定',
  'fileInfo.failed': '无法读取',
  'fileInfo.copy': '复制',
  'fileInfo.copied': '已复制',
  'fileInfo.encUtf8': 'UTF-8',
  'fileInfo.encUtf8Bom': 'UTF-8（含 BOM）',
  'fileInfo.encUtf16Le': 'UTF-16 LE',
  'fileInfo.encUtf16Be': 'UTF-16 BE',
  'fileInfo.encUnknown': '无法判定',
  'fileInfo.eolLf': 'LF（Unix）',
  'fileInfo.eolCrlf': 'CRLF（Windows）',
  'fileInfo.eolCr': 'CR（旧版 Mac）',
  'fileInfo.eolMixed': '混合',
  'fileInfo.eolNone': '无换行',
  'fileInfo.gitNotRepo': '不在 Git 仓库中',
  'fileInfo.gitIgnored': '已忽略（.gitignore）',
  'fileInfo.gitUntracked': '未跟踪',
  'fileInfo.gitTracked': '无更改',
  'fileInfo.gitModified': '已修改',
  'fileInfo.gitAdded': '已添加（未提交）',
  'fileInfo.gitDeleted': '已删除',
  'fileInfo.gitRenamed': '已重命名',
  'fileInfo.gitConflicted': '有冲突',
  'newSheet.title': '新建验证表',
  'newSheet.folder': '创建位置',
  'newSheet.folderRoot': '当前文件夹根目录',
  'newSheet.preset': '模板',
  'newSheet.presetTestCase': '测试用例',
  'newSheet.presetTestCaseDesc': '每行一条，列出步骤与预期结果，自上而下执行。',
  'newSheet.presetViewpoint': '检查观点表',
  'newSheet.presetViewpointDesc': '按分类列出要确认的观点，用于发现遗漏。',
  'newSheet.presetReview': '意见一览',
  'newSheet.presetReviewDesc': '列出收到的意见、各自指向的位置，以及进展到哪一步。',
  'newSheet.fileName': '文件名',
  'newSheet.fileNamePlaceholder': '001-login',
  'newSheet.fileNameHint': '省略时会自动加上 .tsv',
  'newSheet.sheetTitle': '标题（可选）',
  'newSheet.sheetTitlePlaceholder': '订单流程 验证表',
  'newSheet.create': '创建',
  'newSheet.cancel': '取消',
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
  'timeline.open': '时间轴',
  'timeline.openTitle': '按时间顺序排列日志',
  'timeline.head': '时间轴',
  'timeline.files': '选择日志',
  'timeline.filesEmpty': '此文件夹中没有日志（.log / .jsonl / .ndjson）',
  'timeline.filesTruncated': '数量过多，仅显示一部分',
  'timeline.rescan': '重新列出',
  'timeline.prepare': '查看内容并给出候选',
  'timeline.preparing': '读取中',
  'timeline.candidateNote': '这里显示的是候选项。是否合适请查看内容后判断。',
  'timeline.timeField': '时间字段',
  'timeline.guess': '推测',
  'timeline.chosen': '已选择',
  'timeline.evidence.nameAndValue': '名称与值都像时间',
  'timeline.evidence.valueOnly': '值可作为时间读取',
  'timeline.evidence.nameOnly': '名称像时间，但值无法作为时间读取',
  'timeline.parsed': '{sampled} 条中读取了 {parsed} 条',
  'timeline.noCandidate': '没有候选 — 请输入字段名',
  'timeline.unreadable': '无法读取',
  'timeline.skipped': '无法读取的行 {count}',
  'timeline.joinKey': '用于对应的字段',
  'timeline.joinNone': '不选择',
  'timeline.joinExact': '名称一致',
  'timeline.joinNormalized': '名称不同，规范化后归并',
  'timeline.shared': '出现在两个以上文件中的值 {count} 种',
  'timeline.build': '生成时间轴',
  'timeline.building': '生成中',
  'timeline.colTime': '时间',
  'timeline.colSource': '来源',
  'timeline.colLine': '行',
  'timeline.colRecord': '内容',
  'timeline.unknownTime': '时间不明',
  'timeline.empty': '选择日志后按 [生成时间轴]',
  'timeline.truncated': '已达上限截断，后面还有',
  'timeline.unknownCount': '无法读取时间的事件 {count} 条',
  'timeline.maskedNote': '此处无法解除掩码。',
  'diag.tab': '诊断',
  'diag.scale': '规模',
  'diag.chars': '字符',
  'diag.rows': '行',
  'diag.columns': '列',
  'diag.domRows': '页面上的行数',
  'diag.historyChars': '历史记录占用的字符数',
  'diag.span': '区间',
  'diag.last': '最近',
  'diag.median': '中位数',
  'diag.max': '最大',
  'diag.count': '次数',
  'diag.empty': '编辑验证表后，耗时会显示在这里',
  'diag.copy': '复制数字',
  'diag.copied': '已复制',
  'diag.clear': '清除记录',
  'diag.note': '单位为毫秒。更新画面包含差异判断的时间。',
  'diag.span.serialize': '重新组合正文',
  'diag.span.parse': '重新读取正文',
  'diag.span.validate': '类型检查',
  'diag.span.layout': '行列布局计算',
  'diag.span.history': '写入历史记录',
  'diag.span.dirty': '差异判断',
  'diag.span.grid': '重新排布表格',
  'diag.span.render': '更新画面',
  'diag.span.save': '保存往返',
  'mcp.starting': '启动中…',
  'mcp.copyToken': '复制连接令牌',
  'mcp.copied': '已复制令牌',
  'mcp.copyConfig': '复制连接设置',
  'mcp.copiedConfig': '已复制连接设置',
  'mcp.writeConfig': '将设置写入打开的文件夹',
  'mcp.wroteConfig': '已写入设置',
  'mcp.writeConfigFailed': '无法写入设置',
  'mcp.writeConfigNote':
    '在打开的文件夹中写入 .mcp.json。其中包含连接令牌，因此在 Git 仓库中会追加到 .gitignore。已有的设置会保留。',
  'mcp.howto': '连接 AI 客户端的步骤',
  'mcp.howtoStep1': '点击上方的「将设置写入打开的文件夹」。',
  'mcp.howtoStep2':
    '在该文件夹中启动 AI 客户端（Claude Code 等会读取 .mcp.json 的客户端会自行找到）。',
  'mcp.howtoStep3': '不读取 .mcp.json 的客户端，请用「复制连接设置」复制后粘贴到其 MCP 设置中。',
  'mcp.howtoNote': '下次启动应用时地址和令牌不变，写入或粘贴过的设置可以继续使用。',
  'mcp.logsEmpty': 'AI 的操作将显示在这里',
  'mcp.logsDisabled': '服务器未运行，因此不会记录操作',
  'mcp.askAi': '复制给 AI 的请求',
  'mcp.askedAi': '已复制，请粘贴给 AI',
  'mcp.askAiText':
    'md-business 桌面应用未找到 Node，无法启动 MCP 服务器。\n' +
    '请在这台电脑上安装 Node 20 或更高版本。\n' +
    '应用会查找 PATH，以及官方安装程序、fnm、nvm、Volta、scoop、Homebrew 的默认安装位置，用哪一种都可以。\n' +
    '装好后请告诉我，我会在应用的 MCP 标签页点击「重新查找」。',
  'mcp.askAiNote': '粘贴给已经打开的 AI，它可以直接帮你安装 Node。',
  'mcp.retry': '重新查找',
  'mcp.retryFailed': '仍未找到 Node',
  'mcp.reason.sidecarMissing': '未找到 MCP 服务器本体',
  'mcp.reason.nodeMissing': '未找到 Node。安装 Node 20 或更高版本并重新启动本应用后即可使用 MCP',
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
  'help.scGridMark': '为所选区域添加/取消标记',
  'help.license': '许可证',
  'help.repository': '仓库',
  'help.openInBrowser': '在浏览器中打开',
  'layout.railDividerLabel': '调整资源管理器宽度（双击恢复初始宽度）',
  'page.conflictChanged': '此文件已被外部更改',
  'page.conflictReload': '重新加载（放弃编辑）',
  'page.conflictKeep': '保留编辑',
  'page.tabsLabel': '打开的文档',
  'page.tabClose': '关闭',
  'page.tabUnsaved': '未保存',
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
  'page.sheetPreviewBtn': '🖨 打印预览',
  'page.sheetPreviewTitle': '查看打印后的效果，并导出 PDF / HTML / 图片',
  'page.sheetGridBtn': '↩ 返回网格',
  'page.sheetGridTitle': '返回表格编辑',
  'page.compareBtn': '与旧版本比较',
  'page.compareTitle': '与所选提交中的版本比对，标出变动之处',
  'page.compareTarget': '比较对象',
  'page.compareNoHistory': '该文件尚无历史记录',
  'page.compareMissing': '该版本中没有此文件',
  'page.compareUnreadable': '该版本的内容不是验证表',
  'page.compareNoRowId': '该版本没有行 ID，无法比较',
  'page.compareResult': '变动单元格 {cells} · 新增行 {rows} · 删除行 {removed}',
  'page.compareSame': '与该版本相比没有变化',
  'page.compareRemovedTitle': '删除的行',
  'page.exportPick': '提交格式',
  'page.exportCopyBtn': '复制',
  'page.exportCopyTitle': '按所选格式复制为可粘贴到表格软件的形式（不含隐藏行）',
  'page.exportCopied': '已复制',
  'page.exportFailed': '无法复制',
  'page.importReadBtn': '回收填写',
  'page.importReadTitle': '从剪贴板读取返回的提交物，统计可以写回本表的单元格（此时尚未改动）',
  'page.importApplyBtn': '写回（{count}）',
  'page.importApplyTitle': '把统计出的单元格写回本表（可撤销）',
  'page.importChanges': '可写回的单元格 {count}',
  'page.importNone': '没有可写回的单元格',
  'page.importApplied': '已写回 {count} 个单元格',
  'page.importUnknown': '本表中没有的键: {keys}',
  'page.importDuplicate': '出现两次的键: {keys}',
  'page.importMissing': '粘贴内容中没有的列: {columns}',
  'page.importLocked': '不写回的列: {columns}',
  'page.importSkipped': '键为空的行 {count}',
  'page.importNoKey': '该格式没有 key=，无法写回',
  'page.importFolded': '该格式把换行折成空格，无法写回',
  'page.importNoKeyColumn': '粘贴内容中没有键列',
  'page.importFailed': '无法读取粘贴内容',
  'page.expandBtn': '展开检查观点',
  'page.expandTitle': '从共通观点主表补入本表尚未收录的观点（已有行保持不变）',
  'page.expandAdded': '已添加 {count} 行',
  'page.expandNone': '没有可添加的观点',
  'page.expandOrphans': '主表中已无此键: {keys}',
  'page.expandMissing': '主表中没有的列: {columns}',
  'page.expandUnread': '无法读取主表: {path}',
  'page.viewportPhoneTitle': '以手机宽度查看',
  'page.viewportPcTitle': '恢复电脑宽度',
  'page.viewportPhoneBtn': '手机宽度',
  'page.viewportPcBtn': '电脑宽度',
  'page.previewHead': '预览',
  'page.previewTitle': '{label}预览',
  'page.frontmatterHint': '请检查 frontmatter（由 --- 包围的开头块）的格式',
  'page.linkOutsideFolder': '此链接指向所打开文件夹之外（{path}）',
  'page.linkHeadingMissing': '已打开文件，但未找到标题「{heading}」',
  'page.linkNotOpenable': '无法打开此链接（{href}）',
  'page.dataHead': '参考数据',
  'data.readOnly': '只读',
  'data.refused': '无法打开该文件。{detail}',
  'data.atLine': '第 {line} 行：{detail}',
  'data.size': '文件过大。',
  'data.syntax': '格式已损坏。',
  'data.depth': '嵌套过深。',
  'data.nodes': '项目过多。',
  'data.doctype':
    '不打开含文档类型声明（DTD）的文件，因为读取它可能引入其他文件，并使小文件展开为极大的内容。',
  'data.entity': '不打开引用了外部定义实体的文件。',
  'data.unsupported': '此视图可打开 .json 与 .xml。',
  'imageView.head': '图片',
  'imageView.readOnly': '只读',
  'imageView.fit': '适应窗口',
  'imageView.actual': '原始尺寸',
  'imageView.fitTitle': '缩放到窗口内显示整幅图片',
  'imageView.actualTitle': '按原始尺寸显示',
  'imageView.inlineFailed': '无法读取图片: {ref}（{message}）',
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
  'chart.failed': '无法绘制图表。{detail}',
  'chart.atLine': '第 {line} 行: {detail}',
  'chart.empty': '内容为空。请写明 type / source / x / y。',
  'chart.syntax': '该行不是 `名称: 值` 的形式（{raw}）。',
  'chart.unknownKey': '无法识别的设置（{raw}）。',
  'chart.duplicateKey': '同一设置写了两次（{raw}）。',
  'chart.missing': '缺少设置（{raw}）。',
  'chart.badType': '不支持的图表种类（{raw}）。请使用 line / bar / pie。',
  'chart.noColumn': '表格中没有该列（{raw}）。',
  'chart.noRows': '表格中没有数据行。',
  'chart.noNumbers': '该列中没有可作为数字读取的值（{raw}）。',
  'chart.badPath': '该文件不在已打开的文件夹内（{raw}）。',
  'chart.readFailed': '无法读取表格（{raw}）。',
  'chart.unreadableCells': '有 {raw} 个单元格无法作为数字读取，图中相应位置留空。',
  'update.dialogLabel': '应用更新',
  'update.checkingTitle': '正在检查更新…',
  'update.upToDateTitle': '已是最新版本',
  'update.upToDateDesc': '您使用的 md-business 已是最新版本。',
  'update.historyLabel': '历次更新内容',
  'update.more': '查看更多',
  'update.availableTitle': '有新版本 v{version}',
  'update.notesLabel': '更新内容',
  'update.later': '稍后',
  'update.installNow': '立即更新',
  'update.downloadingTitle': '正在下载… {percent}%',
  'update.installingTitle': '正在安装…',
  'update.installingDesc': '正在应用更新，请稍候。',
  'update.readyTitle': '更新已准备就绪',
  'update.readyDesc': '重新启动应用即可应用 v{version}。',
  'update.relaunch': '重新启动',
  'update.errorTitle': '无法更新',
  'grid.regionLabel': '验证表编辑网格',
  'grid.emptyColumns': '没有列定义（请打开带表头行的 TSV）',
  'grid.rowNumber': '行号',
  'grid.required': '必填',
  'grid.multiline': '可在单元格内换行的列（Alt / Ctrl / Shift + Enter）',
  'grid.defaultGroupLabel': '分组',
  'grid.computedCell': '计算列（数值自动确定）',
  'grid.jumpNoColumn': '没有名为「{column}」的列',
  'grid.jumpNoRow': '没有 {column} 为「{value}」的行',
  'grid.jumpMultiple': '共有 {count} 行，已移动到第一行',
  'grid.linkGaps': '引用目标有 {count} 项',
  'grid.splitRows': '有 {count} 条记录可能因单元格内的换行而被拆成多行（单元格换行请写 \n）。',
  'grid.splitGo': '跳转到该行',
  'grid.splitDismiss': '关闭',
  'grid.linkGapsTitle': '这些出现在本表所指向的表中。请打开对方表修改。',
  'grid.pasteDroppedComputed': '计算列的 {count} 个单元格未粘贴',
  'grid.rowLabel': '第 {row} 行',
  'grid.modeEditing': '编辑中',
  'grid.modeSelecting': '选择中',
  'grid.selectionSize': '已选 {rows}×{cols}',
  'grid.selectionSummary':
    '数值 {count} · 合计 {sum} · 平均 {average} · 最小 {min} · 最大 {max}',
  'grid.noteEdit': '点击编辑备注',
  'grid.noteDelete': '删除此备注',
  'grid.notePlaceholder': '输入备注…（Enter 确定・Esc 取消）',
  'grid.noteFolded': '备注 {count} 条',
  'grid.noteFoldOpen': '展开备注',
  'grid.noteFoldClose': '收起备注',
  'grid.groupRename': '点击重命名分组',
  'grid.groupDelete': '删除此分组',
  'grid.colResizeLabel': '更改 {name} 列的宽度',
  'grid.colResizeTitle': '拖动更改宽度／双击自动宽度',
  'grid.rowResizeLabel': '更改第 {row} 行的高度',
  'grid.rowResizeTitle': '拖动更改高度／双击恢复默认',
  'grid.addRow': '＋ 在末尾添加行',
  'grid.addRowTitle': '在表格最下方添加 1 个空行',
  'grid.duplicateRow': '在选中行下方复制',
  'grid.duplicateRowTitle': '在选中行正下方添加内容相同的行',
  'grid.copyRow': '复制选中行',
  'grid.copyRowTitle': '将选中行复制到剪贴板',
  'grid.clearRow': '清空选中行',
  'grid.clearRowTitle': '仅清除选中行的内容（保留行）',
  'grid.fillDown': '向下填充',
  'grid.fillDownTitle': '把选区首行的值填到下方各行（Ctrl+D）。单个单元格则取正上方的值',
  'grid.deleteRow': '删除选中行',
  'grid.deleteRowTitle': '从表格中移除选中行（无法撤销。拿不准就先留存）',
  'grid.hideRow': '留存选中行',
  'grid.hideRowTitle': '将行保留在文件中，但从表格移出',
  'grid.unhideRow': '从留存恢复',
  'grid.unhideRowTitle': '取消留存，恢复为普通行',
  'grid.addNote': '＋ 备注行',
  'grid.addNoteTitle': '在表格上方添加 1 行备注',
  'grid.addGroup': '＋ 分组',
  'grid.addGroupTitle': '为选中的列创建分组标题',
  'grid.revealShow': '显示留存的 {count} 行',
  'grid.revealShowTitle': '把留存行显示出来确认内容',
  'grid.revealHide': '隐藏留存的 {count} 行',
  'grid.revealHideTitle': '把留存行从表格移出',
  'grid.menuClose': '关闭菜单',
  'grid.colMenuText': '{name} 列的文本显示',
  'grid.colMenuAlign': '对齐',
  'grid.rowMenuHead': '第 {row} 行',
  'grid.blame': '历史',
  'grid.blameTitle': '显示各行最后由谁修改（来自 git）',
  'grid.blameUncommitted': '尚未提交',
  'grid.diffChanged': '与该版本相比已变动',
  'grid.diffMarked': '手动标记',
  'grid.diffAddedRow': '该版本中没有的行',
  'grid.diffAddedColumn': '该版本中没有的列',
  'grid.colModeClip': '截断（省略号）',
  'grid.colModeWrap': '换行',
  'grid.colModeOverflow': '溢出显示',
  'grid.colAlignLeft': '左对齐',
  'grid.colAlignCenter': '居中',
  'grid.colAlignRight': '右对齐',
};

const ko: Messages = {
  'app.docPlaceholder': '문서를 선택하세요',
  'app.unsaved': '저장 안 됨',
  'app.unsavedLong': '저장하지 않은 변경 사항이 있습니다',
  'common.close': '닫기',
  'menu.bar': '메뉴',
  'menu.file': '파일',
  'menu.export': '내보내기',
  'menu.view': '보기',
  'action.save': '저장',
  'action.saving': '저장 중…',
  'action.saveTitle': '저장 (Ctrl+S / ⌘S)',
  'action.pdf': 'PDF',
  'action.pdfExport': 'PDF 내보내기',
  'action.pdfTitle': 'PDF 내보내기 (Ctrl+P / ⌘P · 미리보기를 A4로 인쇄／저장)',
  'action.html': 'HTML',
  'action.htmlTitle': 'HTML 내보내기 (한 파일 · 문서와 같은 위치에 저장)',
  'action.htmlDone': '{path}(으)로 내보냈습니다',
  'action.image': '이미지',
  'action.imageTitle': '이 문서를 PNG / JPEG 이미지로 내보냅니다',
  'action.imageDone': '{path}(으)로 내보냈습니다',
  'image.size': '크기',
  'image.scale': '배율',
  'image.format': '형식',
  'image.quality': '화질',
  'image.shoot': '이 설정으로 내보내기',
  'image.preset.ogp': 'OGP / 링크 미리보기',
  'image.preset.x-post': 'X 게시물',
  'image.preset.instagram-post': 'Instagram 게시물',
  'image.preset.instagram-story': 'Instagram 스토리',
  'image.preset.full-hd': '풀 HD',
  'image.preset.web-banner': '웹 배너',
  'image.format.png': 'PNG',
  'image.format.pngTransparent': 'PNG(투명)',
  'image.format.jpeg': 'JPEG',
  // 一括生成（表の 1 行を 1 枚に差し込む）
  'batch.run': '표의 행마다 일괄 내보내기',
  'batch.stop': '중지',
  'batch.progress': '{done} / {total}',
  'batch.done': '{count}장을 내보냈습니다',
  'batch.failed': '일괄로 내보낼 수 없습니다: {detail}',
  'batch.notDeclared': '이 문서에 batch: 선언이 없습니다',
  'batch.badDeclaration': 'batch: 에 {raw} 가 없습니다',
  'batch.noRows': '{raw} 에 데이터 행이 없습니다',
  'batch.noColumn': '표에 {raw} 열이 없습니다',
  'batch.emptyName': '{raw}번째 행의 이름이 비어 있습니다',
  'batch.duplicateName': '같은 이름이 두 개 생깁니다: {raw}',
  'batch.tooMany': '행이 너무 많습니다（{raw}）',
  'batch.badPath': '열려 있는 폴더 바깥을 가리킵니다: {raw}',
  'batch.readFailed': '표를 읽을 수 없습니다: {raw}',
  'batch.missingFont': '이 컴퓨터에 없는 글꼴이 지정되어 있습니다: {raw}',
  'batch.stopped': '{count}장에서 중지했습니다',
  'action.site': '사이트',
  'action.siteTitle': '사이트 내보내기 (폴더 안의 문서를 한꺼번에 dist/ 로 내보냄)',
  'action.siteDone': '{dir}/ 에 {count}개를 내보냈습니다',
  'action.siteDoneSkipped': '{dir}/ 에 {count}개를 내보냈습니다 ({skipped}개는 내보내지 못했습니다)',
  'action.siteNone': '페이지로 만들 수 있는 문서가 없습니다',
  'action.browser': '브라우저',
  'action.browserTitle': '브라우저에서 보기 (이 PC 안에서만 열리는 주소)',
  'action.browserStopTitle': '브라우저 표시를 중지',
  'action.browserServing': '{url} 에서 표시 중',
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
  'search.inGrid': '검증 시트',
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
  'scm.pickFile': '{path}을(를) 커밋에 포함',
  'scm.commitHead': '커밋',
  'scm.messagePlaceholder': '변경 내용을 입력(Ctrl/⌘+Enter 로 커밋)',
  'scm.working': '처리 중…',
  'scm.commit': '커밋',
  'scm.commitCount': '{count}건 커밋',
  'scm.stageHint': '체크한 파일만 커밋합니다. 체크를 해제하면 다음으로 미룰 수 있습니다.',
  'scm.history': '기록',
  'scm.noHistory': '아직 커밋이 없습니다',
  'scm.commitTitle': '{hash} ・ {author}',
  'scm.init': 'Git으로 관리',
  'scm.initTitle': '이 폴더에 로컬 저장소를 만듭니다. 원격은 설정하지 않습니다',
  'scm.initialized': '이 폴더를 Git으로 관리하게 되었습니다',
  'scm.clone': '복제',
  'scm.cloneTitle': '비어 있는 이 폴더로 기존 저장소를 복제합니다. 인증은 OS에 맡긴 자격 증명이 처리합니다',
  'scm.cloneUrlPlaceholder': '복제할 곳 (https:// 또는 git@호스트:경로)',
  'scm.cloned': '이 폴더로 저장소를 복제했습니다',
  'scm.openForge': '브라우저에서 열기',
  'scm.openForgeTitle': '원격이 반환한 URL(풀 리퀘스트 생성 페이지 등)을 브라우저에서 엽니다',
  'scm.switchTitle': '브랜치 전환',
  'scm.switched': '{branch}(으)로 전환했습니다',
  'scm.newBranch': '만들기',
  'scm.newBranchTitle': '현재 위치에서 새 브랜치를 만들어 전환합니다',
  'scm.newBranchPlaceholder': '브랜치 이름',
  'scm.branchCreated': '{branch}을(를) 만들고 전환했습니다',
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
  'tree.openAsk': '{folder} 폴더를 열까요?',
  'tree.openAskHint': '다른 프로그램이 {path} 를 표시하도록 요청했습니다. 지금까지 연 어떤 폴더에도 없습니다.',
  'tree.openAskYes': '열기',
  'tree.openAskNo': '열지 않기',
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
  'tree.menuCopyShareLink': '공유 링크 복사',
  'tree.menuOpenForge': '원격 저장소에서 열기',
  'tree.renameHint': 'Enter로 확정, Esc로 취소',
  'tree.renameErrorEmpty': '이름을 입력하세요',
  'tree.renameErrorSeparator': '이름에 경로 구분자는 사용할 수 없습니다',
  'tree.renameErrorInvalidChar': '이름에 사용할 수 없는 문자가 있습니다',
  'tree.renameErrorExtension': '확장자는 .md 또는 .tsv 여야 합니다',
  'tree.menuNewTestSheet': '검증 시트 새로 만들기',
  'tree.menuFileInfo': '파일 정보',
  'fileInfo.title': '파일 정보',
  'fileInfo.path': '경로',
  'fileInfo.size': '크기',
  'fileInfo.modified': '수정 일시',
  'fileInfo.lines': '줄 수',
  'fileInfo.encoding': '문자 인코딩',
  'fileInfo.lineEnding': '줄바꿈 문자',
  'fileInfo.sha256': 'SHA-256',
  'fileInfo.git': 'Git 상태',
  'fileInfo.measuring': '측정 중…',
  'fileInfo.unknown': '판정할 수 없습니다',
  'fileInfo.failed': '읽을 수 없습니다',
  'fileInfo.copy': '복사',
  'fileInfo.copied': '복사했습니다',
  'fileInfo.encUtf8': 'UTF-8',
  'fileInfo.encUtf8Bom': 'UTF-8(BOM 있음)',
  'fileInfo.encUtf16Le': 'UTF-16 LE',
  'fileInfo.encUtf16Be': 'UTF-16 BE',
  'fileInfo.encUnknown': '판정할 수 없습니다',
  'fileInfo.eolLf': 'LF(Unix)',
  'fileInfo.eolCrlf': 'CRLF(Windows)',
  'fileInfo.eolCr': 'CR(구형 Mac)',
  'fileInfo.eolMixed': '혼재',
  'fileInfo.eolNone': '줄바꿈 없음',
  'fileInfo.gitNotRepo': 'Git 관리 대상 아님',
  'fileInfo.gitIgnored': '제외 설정(.gitignore)',
  'fileInfo.gitUntracked': '추적되지 않음',
  'fileInfo.gitTracked': '변경 없음',
  'fileInfo.gitModified': '변경됨',
  'fileInfo.gitAdded': '추가됨(커밋 전)',
  'fileInfo.gitDeleted': '삭제됨',
  'fileInfo.gitRenamed': '이름 변경됨',
  'fileInfo.gitConflicted': '충돌',
  'newSheet.title': '검증 시트 새로 만들기',
  'newSheet.folder': '만들 위치',
  'newSheet.folderRoot': '열려 있는 폴더 바로 아래',
  'newSheet.preset': '서식',
  'newSheet.presetTestCase': '시험 케이스',
  'newSheet.presetTestCaseDesc': '절차와 기대 결과를 한 건씩 나열해 위에서부터 진행하는 형식.',
  'newSheet.presetViewpoint': '관점표',
  'newSheet.presetViewpointDesc': '확인할 관점을 분류별로 적어 빠진 부분을 찾는 형식.',
  'newSheet.presetReview': '지적 목록',
  'newSheet.presetReviewDesc': '받은 지적과 그 대상, 어디까지 진행됐는지를 늘어놓는 형식.',
  'newSheet.fileName': '파일 이름',
  'newSheet.fileNamePlaceholder': '001-login',
  'newSheet.fileNameHint': '생략하면 .tsv를 붙입니다',
  'newSheet.sheetTitle': '제목(선택)',
  'newSheet.sheetTitlePlaceholder': '수발주 워크플로 검증 시트',
  'newSheet.create': '만들기',
  'newSheet.cancel': '취소',
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
  'timeline.open': '타임라인',
  'timeline.openTitle': '로그를 시각 순서로 늘어놓기',
  'timeline.head': '타임라인',
  'timeline.files': '로그 선택',
  'timeline.filesEmpty': '이 폴더에 로그(.log / .jsonl / .ndjson)가 없습니다',
  'timeline.filesTruncated': '너무 많아 일부만 표시합니다',
  'timeline.rescan': '목록 다시 가져오기',
  'timeline.prepare': '내용을 보고 후보 내기',
  'timeline.preparing': '읽는 중',
  'timeline.candidateNote': '여기에 나오는 것은 후보입니다. 맞는지는 내용을 보고 정해 주세요.',
  'timeline.timeField': '시각 항목',
  'timeline.guess': '추정',
  'timeline.chosen': '선택함',
  'timeline.evidence.nameAndValue': '이름도 값도 시각',
  'timeline.evidence.valueOnly': '값이 시각으로 읽힘',
  'timeline.evidence.nameOnly': '이름은 시각 같지만 값은 시각으로 읽히지 않음',
  'timeline.parsed': '{sampled}건 중 {parsed}건 읽음',
  'timeline.noCandidate': '후보 없음 — 항목 이름을 입력하세요',
  'timeline.unreadable': '읽을 수 없습니다',
  'timeline.skipped': '읽지 못한 줄 {count}',
  'timeline.joinKey': '맞춰 볼 항목',
  'timeline.joinNone': '고르지 않음',
  'timeline.joinExact': '이름이 같음',
  'timeline.joinNormalized': '이름이 달라 표기를 맞춰 묶음',
  'timeline.shared': '두 개 이상의 파일에 나온 값 {count}종',
  'timeline.build': '타임라인 만들기',
  'timeline.building': '만드는 중',
  'timeline.colTime': '시각',
  'timeline.colSource': '출처',
  'timeline.colLine': '줄',
  'timeline.colRecord': '내용',
  'timeline.unknownTime': '시각 불명',
  'timeline.empty': '로그를 고르고 [타임라인 만들기]를 누르세요',
  'timeline.truncated': '상한에서 끊었습니다. 더 있습니다',
  'timeline.unknownCount': '시각을 읽지 못한 사건 {count}건',
  'timeline.maskedNote': '여기서는 마스킹을 해제할 수 없습니다.',
  'diag.tab': '진단',
  'diag.scale': '규모',
  'diag.chars': '문자',
  'diag.rows': '행',
  'diag.columns': '열',
  'diag.domRows': '화면에 표시된 행',
  'diag.historyChars': '기록이 보유한 문자 수',
  'diag.span': '구간',
  'diag.last': '최근',
  'diag.median': '중앙값',
  'diag.max': '최대',
  'diag.count': '건수',
  'diag.empty': '검증 시트를 편집하면 걸린 시간이 여기에 표시됩니다',
  'diag.copy': '숫자 복사',
  'diag.copied': '복사했습니다',
  'diag.clear': '기록 지우기',
  'diag.note': '단위는 밀리초. 화면 반영에는 차이 판정 시간이 포함됩니다.',
  'diag.span.serialize': '본문 재구성',
  'diag.span.parse': '본문 다시 읽기',
  'diag.span.validate': '형식 검사',
  'diag.span.layout': '행과 열 배치',
  'diag.span.history': '기록에 쌓기',
  'diag.span.dirty': '차이 판정',
  'diag.span.grid': '표 다시 구성',
  'diag.span.render': '화면 반영',
  'diag.span.save': '저장 왕복',
  'mcp.starting': '시작 중…',
  'mcp.copyToken': '접속 토큰 복사',
  'mcp.copied': '토큰을 복사했습니다',
  'mcp.copyConfig': '연결 설정 복사',
  'mcp.copiedConfig': '연결 설정을 복사했습니다',
  'mcp.writeConfig': '열려 있는 폴더에 설정 넣기',
  'mcp.wroteConfig': '설정을 넣었습니다',
  'mcp.writeConfigFailed': '설정을 넣지 못했습니다',
  'mcp.writeConfigNote':
    '열려 있는 폴더에 .mcp.json 을 씁니다. 접속 토큰이 들어가므로 Git 저장소라면 .gitignore 에 추가합니다. 이미 있는 설정은 남깁니다.',
  'mcp.howto': 'AI 클라이언트 연결 방법',
  'mcp.howtoStep1': '위의 「열려 있는 폴더에 설정 넣기」를 누릅니다.',
  'mcp.howtoStep2':
    '그 폴더에서 AI 클라이언트를 엽니다(Claude Code 등 .mcp.json 을 읽는 클라이언트는 스스로 찾습니다).',
  'mcp.howtoStep3':
    '.mcp.json 을 읽지 않는 클라이언트는 「연결 설정 복사」로 복사해 해당 클라이언트의 MCP 설정에 붙여 넣습니다.',
  'mcp.howtoNote':
    '앱을 다시 시작해도 주소와 토큰이 그대로이므로 넣거나 붙여 넣은 설정을 계속 사용할 수 있습니다.',
  'mcp.logsEmpty': 'AI 의 작업이 여기에 표시됩니다',
  'mcp.logsDisabled': '서버가 실행 중이 아니므로 작업이 기록되지 않습니다',
  'mcp.askAi': 'AI에 보낼 요청 복사',
  'mcp.askedAi': '복사했습니다. AI에 붙여넣으세요',
  'mcp.askAiText':
    'md-business 데스크톱 앱이 Node를 찾지 못해 MCP 서버를 시작하지 못했습니다.\n' +
    '이 PC에 Node 20 이상을 설치해 주세요.\n' +
    '앱은 PATH와 함께 공식 설치 프로그램, fnm, nvm, Volta, scoop, Homebrew의 기본 설치 위치를 확인하므로 어느 것으로 설치해도 됩니다.\n' +
    '설치가 끝나면 알려 주세요. 앱의 MCP 탭에서 「다시 찾기」를 누르겠습니다.',
  'mcp.askAiNote': '이미 열려 있는 AI에 붙여넣기만 하면 Node 설치까지 맡길 수 있습니다.',
  'mcp.retry': '다시 찾기',
  'mcp.retryFailed': '아직 Node를 찾지 못했습니다',
  'mcp.reason.sidecarMissing': 'MCP 서버 본체를 찾을 수 없습니다',
  'mcp.reason.nodeMissing':
    'Node 를 찾을 수 없습니다. Node 20 이상을 설치한 뒤 앱을 다시 시작하면 MCP 를 사용할 수 있습니다',
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
  'help.scGridMark': '선택 범위 표시 켜기/끄기',
  'help.license': '라이선스',
  'help.repository': '저장소',
  'help.openInBrowser': '브라우저에서 열기',
  'layout.railDividerLabel': '탐색기 너비 조정 (더블클릭으로 기본 너비 복원)',
  'page.conflictChanged': '이 파일이 외부에서 변경되었습니다',
  'page.conflictReload': '다시 불러오기 (편집 삭제)',
  'page.conflictKeep': '편집 유지',
  'page.tabsLabel': '열려 있는 문서',
  'page.tabClose': '닫기',
  'page.tabUnsaved': '저장 안 됨',
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
  'page.sheetPreviewBtn': '🖨 인쇄 미리보기',
  'page.sheetPreviewTitle': '인쇄된 모습을 확인하고 PDF / HTML / 이미지로 내보내기',
  'page.sheetGridBtn': '↩ 그리드로 돌아가기',
  'page.sheetGridTitle': '표 편집으로 돌아가기',
  'page.compareBtn': '이전 버전과 비교',
  'page.compareTitle': '선택한 커밋의 버전과 대조해 변경된 곳을 표시',
  'page.compareTarget': '비교 대상',
  'page.compareNoHistory': '이 파일에는 아직 이력이 없습니다',
  'page.compareMissing': '그 버전에는 이 파일이 없습니다',
  'page.compareUnreadable': '그 버전의 내용은 검증 시트가 아닙니다',
  'page.compareNoRowId': '그 버전에는 행 ID가 없어 비교할 수 없습니다',
  'page.compareResult': '변경된 셀 {cells} · 추가된 행 {rows} · 삭제된 행 {removed}',
  'page.compareSame': '그 버전에서 바뀐 것이 없습니다',
  'page.compareRemovedTitle': '삭제된 행',
  'page.exportPick': '제출 양식',
  'page.exportCopyBtn': '복사',
  'page.exportCopyTitle': '선택한 양식으로 스프레드시트에 붙여 넣을 수 있는 형태로 복사 (숨긴 행은 제외)',
  'page.exportCopied': '복사했습니다',
  'page.exportFailed': '복사하지 못했습니다',
  'page.importReadBtn': '되돌려 넣기',
  'page.importReadTitle': '돌아온 제출물을 클립보드에서 읽어, 이 시트로 되돌릴 수 있는 셀을 센다(아직 바꾸지 않음)',
  'page.importApplyBtn': '되돌리기({count})',
  'page.importApplyTitle': '센 셀을 이 시트에 되돌려 쓴다(실행 취소로 복구 가능)',
  'page.importChanges': '되돌릴 수 있는 셀 {count}',
  'page.importNone': '되돌릴 셀이 없습니다',
  'page.importApplied': '{count}개 셀을 되돌렸습니다',
  'page.importUnknown': '이 시트에 없는 키: {keys}',
  'page.importDuplicate': '두 번 나온 키: {keys}',
  'page.importMissing': '붙여 넣은 내용에 없는 열: {columns}',
  'page.importLocked': '되돌리지 않는 열: {columns}',
  'page.importSkipped': '키가 빈 행 {count}',
  'page.importNoKey': '이 양식에는 key= 가 없어 되돌릴 수 없습니다',
  'page.importFolded': '이 양식은 줄바꿈을 공백으로 접으므로 되돌릴 수 없습니다',
  'page.importNoKeyColumn': '붙여 넣은 내용에 키 열이 없습니다',
  'page.importFailed': '붙여 넣은 내용을 읽지 못했습니다',
  'page.expandBtn': '관점 펼치기',
  'page.expandTitle': '공통 관점 마스터에서 이 시트에 아직 없는 관점을 추가한다(기존 행은 그대로)',
  'page.expandAdded': '{count}행 추가했습니다',
  'page.expandNone': '추가할 관점이 없습니다',
  'page.expandOrphans': '마스터에 없는 키: {keys}',
  'page.expandMissing': '마스터에 없는 열: {columns}',
  'page.expandUnread': '마스터를 읽을 수 없습니다: {path}',
  'page.viewportPhoneTitle': '스마트폰 폭으로 보기',
  'page.viewportPcTitle': 'PC 폭으로 되돌리기',
  'page.viewportPhoneBtn': '모바일 폭',
  'page.viewportPcBtn': 'PC 폭',
  'page.previewHead': '미리보기',
  'page.previewTitle': '{label} 미리보기',
  'page.frontmatterHint': 'frontmatter(--- 로 감싼 첫 블록) 형식을 확인하세요',
  'page.linkOutsideFolder': '이 링크는 열려 있는 폴더 밖을 가리킵니다({path})',
  'page.linkHeadingMissing': '파일은 열었지만 제목 "{heading}"을(를) 찾지 못했습니다',
  'page.linkNotOpenable': '이 링크는 열 수 없습니다({href})',
  'page.dataHead': '참고 데이터',
  'data.readOnly': '읽기 전용',
  'data.refused': '이 파일은 열 수 없었습니다. {detail}',
  'data.atLine': '{line}번째 줄: {detail}',
  'data.size': '파일이 너무 큽니다.',
  'data.syntax': '형식이 깨져 있습니다.',
  'data.depth': '중첩이 너무 깊습니다.',
  'data.nodes': '항목이 너무 많습니다.',
  'data.doctype':
    '문서 형식 선언(DTD)이 있는 파일은 열지 않습니다. 읽어들이면 다른 파일을 끌어오거나 작은 파일이 거대하게 부풀 수 있기 때문입니다.',
  'data.entity': '외부에서 정의된 엔터티 참조가 있는 파일은 열지 않습니다.',
  'data.unsupported': '이 화면에서 열 수 있는 것은 .json 과 .xml 입니다.',
  'imageView.head': '이미지',
  'imageView.readOnly': '읽기 전용',
  'imageView.fit': '전체',
  'imageView.actual': '원본 크기',
  'imageView.fitTitle': '화면에 맞춰 전체를 표시',
  'imageView.actualTitle': '원본 크기로 표시',
  'imageView.inlineFailed': '이미지를 읽을 수 없습니다: {ref}({message})',
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
  'chart.failed': '차트를 그릴 수 없습니다. {detail}',
  'chart.atLine': '{line}번째 줄: {detail}',
  'chart.empty': '내용이 비어 있습니다. type / source / x / y 를 적어 주세요.',
  'chart.syntax': '`이름: 값` 형식이 아닙니다({raw}).',
  'chart.unknownKey': '알 수 없는 설정입니다({raw}).',
  'chart.duplicateKey': '같은 설정이 두 번 적혀 있습니다({raw}).',
  'chart.missing': '설정이 부족합니다({raw}).',
  'chart.badType': '지원하지 않는 종류입니다({raw}). line / bar / pie 중에서 적어 주세요.',
  'chart.noColumn': '표에 해당 열이 없습니다({raw}).',
  'chart.noRows': '표에 행이 없습니다.',
  'chart.noNumbers': '그 열에 숫자로 읽을 수 있는 값이 없습니다({raw}).',
  'chart.badPath': '열려 있는 폴더 안에 없습니다({raw}).',
  'chart.readFailed': '표를 읽을 수 없습니다({raw}).',
  'chart.unreadableCells': '숫자로 읽지 못한 칸이 {raw}개 있어 차트에서는 비워 두었습니다.',
  'update.dialogLabel': '앱 업데이트',
  'update.checkingTitle': '업데이트를 확인하는 중…',
  'update.upToDateTitle': '최신 상태입니다',
  'update.upToDateDesc': '사용 중인 md-business는 최신 버전입니다.',
  'update.historyLabel': '지금까지의 업데이트 내용',
  'update.more': '더 보기',
  'update.availableTitle': '새 버전 v{version}이(가) 있습니다',
  'update.notesLabel': '업데이트 내용',
  'update.later': '나중에',
  'update.installNow': '지금 업데이트',
  'update.downloadingTitle': '다운로드 중… {percent}%',
  'update.installingTitle': '설치 중…',
  'update.installingDesc': '업데이트를 적용하고 있습니다. 잠시 기다려 주세요.',
  'update.readyTitle': '업데이트 준비가 끝났습니다',
  'update.readyDesc': 'v{version}을(를) 적용하려면 앱을 다시 시작하세요.',
  'update.relaunch': '다시 시작하기',
  'update.errorTitle': '업데이트하지 못했습니다',
  'grid.regionLabel': '검증 시트 편집 그리드',
  'grid.emptyColumns': '열 정의가 없습니다(헤더 행이 있는 TSV를 열어 주세요)',
  'grid.rowNumber': '행 번호',
  'grid.required': '필수',
  'grid.multiline': '셀 안에서 줄바꿈할 수 있는 열 (Alt / Ctrl / Shift + Enter)',
  'grid.defaultGroupLabel': '그룹',
  'grid.computedCell': '계산 열(값이 자동으로 정해집니다)',
  'grid.jumpNoColumn': '「{column}」이라는 열이 없습니다',
  'grid.jumpNoRow': '{column}이(가) 「{value}」인 행이 없습니다',
  'grid.jumpMultiple': '{count}개 행이 있습니다. 첫 행으로 이동했습니다',
  'grid.linkGaps': '참조 대상에 {count}건',
  'grid.splitRows': '셀 안의 줄바꿈으로 {count}건의 행이 나뉘었을 수 있습니다(셀 줄바꿈은 \n).',
  'grid.splitGo': '해당 행으로',
  'grid.splitDismiss': '닫기',
  'grid.linkGapsTitle': '이 시트가 가리키는 쪽에서 찾은 것입니다. 상대 시트를 열어 고칩니다.',
  'grid.pasteDroppedComputed': '계산 열의 {count}개 셀은 붙여넣지 않았습니다',
  'grid.rowLabel': '{row}번째 행',
  'grid.modeEditing': '편집 중',
  'grid.modeSelecting': '선택 중',
  'grid.selectionSize': '{rows}×{cols} 선택',
  'grid.selectionSummary':
    '숫자 {count} · 합계 {sum} · 평균 {average} · 최소 {min} · 최대 {max}',
  'grid.noteEdit': '클릭하여 메모 편집',
  'grid.noteDelete': '이 메모 삭제',
  'grid.notePlaceholder': '메모 입력…(Enter로 확정・Esc로 취소)',
  'grid.noteFolded': '메모 {count} 건',
  'grid.noteFoldOpen': '메모 펼치기',
  'grid.noteFoldClose': '메모 접기',
  'grid.groupRename': '클릭하여 그룹 이름 변경',
  'grid.groupDelete': '이 그룹 삭제',
  'grid.colResizeLabel': '{name} 열의 너비 변경',
  'grid.colResizeTitle': '드래그로 너비 변경／더블클릭으로 자동 너비',
  'grid.rowResizeLabel': '{row}번째 행의 높이 변경',
  'grid.rowResizeTitle': '드래그로 높이 변경／더블클릭으로 기본값 복원',
  'grid.addRow': '＋ 끝에 행 추가',
  'grid.addRowTitle': '표 맨 아래에 빈 행을 1개 추가',
  'grid.duplicateRow': '선택 행 아래에 복제',
  'grid.duplicateRowTitle': '선택 행과 같은 내용의 행을 바로 아래에 추가',
  'grid.copyRow': '선택 행 복사',
  'grid.copyRowTitle': '선택 행을 클립보드로 복사',
  'grid.clearRow': '선택 행 비우기',
  'grid.clearRowTitle': '선택 행의 내용만 지웁니다(행은 남습니다)',
  'grid.fillDown': '아래로 채우기',
  'grid.fillDownTitle':
    '선택 범위 첫 행의 값을 아래 행에 채웁니다(Ctrl+D). 단일 셀이면 바로 위의 값을 가져옵니다',
  'grid.deleteRow': '선택 행 삭제',
  'grid.deleteRowTitle': '선택 행을 표에서 제거합니다(되돌릴 수 없습니다. 망설여지면 보관으로)',
  'grid.hideRow': '선택 행을 보관',
  'grid.hideRowTitle': '행을 파일에 남긴 채 표에서 제외',
  'grid.unhideRow': '보관에서 되돌리기',
  'grid.unhideRowTitle': '보관을 해제하고 일반 행으로 되돌립니다',
  'grid.addNote': '＋ 메모 행',
  'grid.addNoteTitle': '표 위에 놓는 메모 1행을 추가',
  'grid.addGroup': '＋ 그룹',
  'grid.addGroupTitle': '선택한 열에 그룹 머리글을 작성',
  'grid.revealShow': '보관 {count}행 표시',
  'grid.revealShowTitle': '보관 행을 표에 표시해 내용을 확인',
  'grid.revealHide': '보관 {count}행 숨기기',
  'grid.revealHideTitle': '보관 행을 표에서 제외',
  'grid.menuClose': '메뉴 닫기',
  'grid.colMenuText': '{name} 열의 텍스트 표시',
  'grid.colMenuAlign': '정렬',
  'grid.rowMenuHead': '{row}번째 행',
  'grid.blame': '이력',
  'grid.blameTitle': '각 행을 마지막으로 변경한 사람을 표시(git 기준)',
  'grid.blameUncommitted': '아직 커밋 안 됨',
  'grid.diffChanged': '그 버전에서 변경되었습니다',
  'grid.diffMarked': '직접 표시했습니다',
  'grid.diffAddedRow': '그 버전에 없던 행',
  'grid.diffAddedColumn': '그 버전에 없던 열',
  'grid.colModeClip': '잘림(생략)',
  'grid.colModeWrap': '줄바꿈',
  'grid.colModeOverflow': '넘쳐 표시',
  'grid.colAlignLeft': '왼쪽 정렬',
  'grid.colAlignCenter': '가운데 정렬',
  'grid.colAlignRight': '오른쪽 정렬',
};

/** ロケール→文言辞書。i18n.svelte.ts が現ロケールと fallback(ja) を引く。 */
export const messages: Record<Locale, Messages> = { en, ja, zh, ko };
