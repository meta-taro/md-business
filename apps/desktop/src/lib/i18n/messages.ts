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
  'status.mcp': string;
  // 左レール（ファイルツリー / エクスプローラー）
  'tree.label': string;
  'tree.expandExplorer': string;
  'tree.collapseExplorer': string;
  'tree.explorer': string;
  'tree.openOtherFolder': string;
  'tree.open': string;
  'tree.filterPlaceholder': string;
  'tree.filterClearTitle': string;
  'tree.filterClear': string;
  'tree.emptyHint': string;
  'tree.loading': string;
  'tree.openFolder': string;
  'tree.filterNoMatch': string;
  'tree.noFiles': string;
  'tree.truncated': string;
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
  // ヘルプポップオーバー
  'help.title': string;
  'help.desktopEdition': string;
  'help.checkUpdate': string;
  'help.manual': string;
  'help.shortcuts': string;
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
  'status.mcp': 'MCP: disconnected',
  'tree.label': 'File tree',
  'tree.expandExplorer': 'Open explorer',
  'tree.collapseExplorer': 'Collapse explorer',
  'tree.explorer': 'Explorer',
  'tree.openOtherFolder': 'Open another folder',
  'tree.open': 'Open',
  'tree.filterPlaceholder': 'Filter by file name',
  'tree.filterClearTitle': 'Clear filter (Esc)',
  'tree.filterClear': 'Clear filter',
  'tree.emptyHint': 'Open a folder to\nsee the document tree',
  'tree.loading': 'Loading…',
  'tree.openFolder': 'Open folder',
  'tree.filterNoMatch': 'No files match\n"{query}"',
  'tree.noFiles': 'No .md / .tsv\nfiles found',
  'tree.truncated': 'Showing partial results (limit reached)',
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
  'help.title': 'Help & version info',
  'help.desktopEdition': 'Desktop edition',
  'help.checkUpdate': 'Check for updates',
  'help.manual': 'User guide',
  'help.shortcuts': 'Keyboard shortcuts',
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
  'status.mcp': 'MCP: 未接続',
  'tree.label': 'ファイルツリー',
  'tree.expandExplorer': 'エクスプローラーを開く',
  'tree.collapseExplorer': 'エクスプローラーを畳む',
  'tree.explorer': 'エクスプローラー',
  'tree.openOtherFolder': '別のフォルダを開く',
  'tree.open': '開く',
  'tree.filterPlaceholder': 'ファイル名で絞り込み',
  'tree.filterClearTitle': 'フィルタをクリア（Esc）',
  'tree.filterClear': 'フィルタをクリア',
  'tree.emptyHint': 'フォルダを開くと\n文書ツリーが表示されます',
  'tree.loading': '読み込み中…',
  'tree.openFolder': 'フォルダを開く',
  'tree.filterNoMatch': '「{query}」に\n一致するファイルがありません',
  'tree.noFiles': '.md / .tsv が\n見つかりませんでした',
  'tree.truncated': '一部のみ表示（上限に達したため打ち切りました）',
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
  'help.title': 'ヘルプ・バージョン情報',
  'help.desktopEdition': 'デスクトップ版',
  'help.checkUpdate': '更新を確認',
  'help.manual': '操作マニュアル',
  'help.shortcuts': 'キーボードショートカット',
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
  'status.mcp': 'MCP: 未连接',
  'tree.label': '文件树',
  'tree.expandExplorer': '打开资源管理器',
  'tree.collapseExplorer': '折叠资源管理器',
  'tree.explorer': '资源管理器',
  'tree.openOtherFolder': '打开其他文件夹',
  'tree.open': '打开',
  'tree.filterPlaceholder': '按文件名筛选',
  'tree.filterClearTitle': '清除筛选（Esc）',
  'tree.filterClear': '清除筛选',
  'tree.emptyHint': '打开文件夹后\n将显示文档树',
  'tree.loading': '加载中…',
  'tree.openFolder': '打开文件夹',
  'tree.filterNoMatch': '没有匹配\n“{query}”的文件',
  'tree.noFiles': '未找到\n.md / .tsv 文件',
  'tree.truncated': '仅显示部分（已达上限而截断）',
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
  'help.title': '帮助・版本信息',
  'help.desktopEdition': '桌面版',
  'help.checkUpdate': '检查更新',
  'help.manual': '操作手册',
  'help.shortcuts': '键盘快捷键',
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
  'status.mcp': 'MCP: 미연결',
  'tree.label': '파일 트리',
  'tree.expandExplorer': '탐색기 열기',
  'tree.collapseExplorer': '탐색기 접기',
  'tree.explorer': '탐색기',
  'tree.openOtherFolder': '다른 폴더 열기',
  'tree.open': '열기',
  'tree.filterPlaceholder': '파일 이름으로 필터',
  'tree.filterClearTitle': '필터 지우기 (Esc)',
  'tree.filterClear': '필터 지우기',
  'tree.emptyHint': '폴더를 열면\n문서 트리가 표시됩니다',
  'tree.loading': '불러오는 중…',
  'tree.openFolder': '폴더 열기',
  'tree.filterNoMatch': '"{query}"과(와)\n일치하는 파일이 없습니다',
  'tree.noFiles': '.md / .tsv 파일을\n찾을 수 없습니다',
  'tree.truncated': '일부만 표시 (상한에 도달하여 중단)',
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
  'help.title': '도움말・버전 정보',
  'help.desktopEdition': '데스크톱 버전',
  'help.checkUpdate': '업데이트 확인',
  'help.manual': '사용 설명서',
  'help.shortcuts': '키보드 단축키',
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
};

/** ロケール→文言辞書。i18n.svelte.ts が現ロケールと fallback(ja) を引く。 */
export const messages: Record<Locale, Messages> = { en, ja, zh, ko };
