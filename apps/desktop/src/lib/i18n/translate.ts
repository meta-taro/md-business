// 翻訳解決の純ロジック（DOM 非依存・vitest 単体テスト層）。
// 反応状態と localStorage / navigator への副作用は i18n.svelte.ts が担う。
import { isLocale, type Locale } from './locales';

/** 文言辞書の最小形。キー→文言の平坦な写像（messages.ts が具体形を与える）。 */
export type Dictionary = Record<string, string>;

/** t() に渡す差し込み値（{name} 等のプレースホルダ置換用）。 */
export type TranslateParams = Record<string, string | number>;

/**
 * 起動時の初期ロケールを決める。
 * 保存値（localStorage 由来）が有効なら最優先。無ければ navigator の言語候補を
 * 先頭から見て対応ロケールへ正規化（`ja-JP`→`ja`、`zh-Hans`→`zh` 等）。
 * どれも当たらなければ fallback（既定 'ja'）。
 *
 * @param stored localStorage から読んだ生値（未保存なら null）
 * @param navigatorLangs navigator.languages 相当（優先順の言語タグ列）
 * @param fallback 何も当たらないときの既定ロケール
 */
export function resolveInitialLocale(
  stored: string | null,
  navigatorLangs: readonly string[],
  fallback: Locale = 'ja',
): Locale {
  if (isLocale(stored)) return stored;
  for (const tag of navigatorLangs) {
    const primary = tag.toLowerCase().split('-')[0];
    if (isLocale(primary)) return primary;
  }
  return fallback;
}

/**
 * {name} 形式のプレースホルダを params の値で置換する。
 * 対応する値が無いプレースホルダは元の文字列のまま残す（消さない＝欠落に気づける）。
 */
export function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : String(value);
  });
}

/**
 * キーから文言を引き、プレースホルダを差し込む。
 * 現ロケール辞書に無いキーは fallback 辞書（既定言語）を見る。両方に無ければキー文字列
 * をそのまま返す（画面に生キーが出る＝翻訳漏れが可視化される）。
 */
export function translate(
  dict: Dictionary,
  fallbackDict: Dictionary,
  key: string,
  params?: TranslateParams,
): string {
  const template = dict[key] ?? fallbackDict[key] ?? key;
  return interpolate(template, params);
}
