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
  // 主要アクション
  'action.save': string;
  'action.saving': string;
  'action.saveTitle': string;
  'action.pdf': string;
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
}

/** 翻訳キー型（t() の引数に使う）。 */
export type MessageKey = keyof Messages;

const en: Messages = {
  'app.docPlaceholder': 'Select a document',
  'app.unsaved': 'Unsaved',
  'app.unsavedLong': 'You have unsaved changes',
  'action.save': 'Save',
  'action.saving': 'Saving…',
  'action.saveTitle': 'Save (Ctrl+S / ⌘S)',
  'action.pdf': 'PDF',
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
};

const ja: Messages = {
  'app.docPlaceholder': '文書を選択してください',
  'app.unsaved': '未保存',
  'app.unsavedLong': '未保存の変更があります',
  'action.save': '保存',
  'action.saving': '保存中…',
  'action.saveTitle': '保存（Ctrl+S / ⌘S）',
  'action.pdf': 'PDF',
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
};

const zh: Messages = {
  'app.docPlaceholder': '请选择文档',
  'app.unsaved': '未保存',
  'app.unsavedLong': '有未保存的更改',
  'action.save': '保存',
  'action.saving': '正在保存…',
  'action.saveTitle': '保存（Ctrl+S / ⌘S）',
  'action.pdf': 'PDF',
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
};

const ko: Messages = {
  'app.docPlaceholder': '문서를 선택하세요',
  'app.unsaved': '저장 안 됨',
  'app.unsavedLong': '저장하지 않은 변경 사항이 있습니다',
  'action.save': '저장',
  'action.saving': '저장 중…',
  'action.saveTitle': '저장 (Ctrl+S / ⌘S)',
  'action.pdf': 'PDF',
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
};

/** ロケール→文言辞書。i18n.svelte.ts が現ロケールと fallback(ja) を引く。 */
export const messages: Record<Locale, Messages> = { en, ja, zh, ko };
