// 対応ロケールの定義（DOM 非依存の純データ層）。
// 反応状態・localStorage 永続化は i18n.svelte.ts が担い、文言辞書は messages.ts が持つ。

/** アプリが対応する UI 言語。英・日・中（簡体）・韓。 */
export type Locale = 'en' | 'ja' | 'zh' | 'ko';

/** セレクタ表示順（既定は日本語だが一覧は英→日→中→韓で固定）。 */
export const LOCALES: readonly Locale[] = ['en', 'ja', 'zh', 'ko'] as const;

/** 各ロケールの自言語表記（セレクタに出すラベル）。 */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  ja: '日本語',
  zh: '中文',
  ko: '한국어',
};

/** 保存値・引数が対応ロケールかを型ガードで判定する。 */
export function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'ja' || value === 'zh' || value === 'ko';
}
