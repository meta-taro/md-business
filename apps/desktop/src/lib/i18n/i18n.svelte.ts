// ロケールの反応状態 + 副作用（localStorage 永続化 / navigator 検出）。
// 純ロジックは translate.ts / locales.ts に置き、ここはランと環境をつなぐ薄い層に留める。
import { type Locale } from './locales';
import { resolveInitialLocale, translate, type Dictionary, type TranslateParams } from './translate';
import { messages, type MessageKey } from './messages';

const LOCALE_STORAGE_KEY = 'mdb-locale';

// fallback は日本語固定（既定言語）。現ロケールに無いキーはこの辞書で埋める。
const FALLBACK: Locale = 'ja';

let current = $state<Locale>('ja');

function readStored(): string | null {
  try {
    return localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persist(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // localStorage 不可（プライベート等）の環境では永続化を諦める。表示は継続。
  }
}

function detectNavigatorLangs(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  if (Array.isArray(navigator.languages) && navigator.languages.length > 0) {
    return navigator.languages;
  }
  return navigator.language ? [navigator.language] : [];
}

function applyToDom(locale: Locale): void {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
  }
}

export const i18n = {
  /** 現在のロケール（テンプレートで参照するとラン依存で反応する）。 */
  get locale(): Locale {
    return current;
  },

  /** 起動時に localStorage / navigator からロケールを確定し <html lang> を同期する。 */
  init(): void {
    current = resolveInitialLocale(readStored(), detectNavigatorLangs(), FALLBACK);
    applyToDom(current);
  },

  /** ロケールを切り替え、DOM と localStorage に反映する。 */
  set(locale: Locale): void {
    current = locale;
    applyToDom(locale);
    persist(locale);
  },

  /**
   * キーから現ロケールの文言を引く（ラン依存＝ロケール変更で自動再描画）。
   * 未定義キーは fallback(ja) → キー文字列の順にフォールバックする。
   */
  t(key: MessageKey, params?: TranslateParams): string {
    // Messages はインターフェースゆえ暗黙の index signature を持たず Dictionary に
    // 構造的一致しない。値は string→string の写像なので境界でのみ安全にキャストする。
    return translate(
      messages[current] as unknown as Dictionary,
      messages[FALLBACK] as unknown as Dictionary,
      key,
      params,
    );
  },
};

/**
 * テンプレートから短く書くためのショートハンド。
 * `{i18n.t('action.save')}` でも良いが、`{t('action.save')}` の方が読みやすい。
 * アロー関数で束ねると `current` への依存が関数越しでも追跡される。
 */
export function t(key: MessageKey, params?: TranslateParams): string {
  return i18n.t(key, params);
}
