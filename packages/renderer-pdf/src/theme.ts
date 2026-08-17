/**
 * 文書のアクセント色（テーマ）。
 *
 * 見出し・罫線・強調に使う 1 色を `--mdb-color-accent` として文書の根に置く。
 * 決め方はここだけに書く。書式ごとに写しを持つと、片方だけ色が増えた・
 * 片方だけ書き方が緩い、という食い違いが起きても、出来た文書を並べるまで気づけない。
 */

/**
 * 名前で選べる同梱テーマ。
 *
 * 値は互いに見分けが付き、かつ印刷しても潰れない明度で選んである
 * （2px の罫線が紙で残る程度に暗くする）。ブランド色が要る場合は
 * `#rrggbb` で直に指定する。
 */
export const THEME_PRESETS: Record<string, string> = {
  blue: '#2a4d7a',
  red: '#b91c1c',
  yellow: '#b8860b',
  orange: '#c2410c',
  purple: '#6d28d9',
  black: '#1f1f1f',
  gray: '#4b5563',
};

/** 選べる名前の一覧。知らない名前を知らせるときに添える。 */
export const THEME_NAMES: string[] = Object.keys(THEME_PRESETS);

/**
 * 直に指定できる色の書き方。ここを通ったものだけが HTML の属性へ入る。
 * `"` や空白は形が合わないので、属性を抜け出す文字は最初から入らない。
 */
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** テーマ指定の読み取り結果。 */
export type ThemeResolution =
  /** 指定がない。既定の配色のまま描く。 */
  | { kind: 'unset' }
  /** 同梱の名前で選ばれた。 */
  | { kind: 'preset'; name: string; color: string }
  /** 16 進で直に指定された。 */
  | { kind: 'hex'; color: string }
  /** 指定はあるが読めない。既定の配色で描くが、知らせる相手がいる。 */
  | { kind: 'unknown'; input: string };

/**
 * テーマ指定を読む。
 *
 * 文字列でないものは「指定なし」として返す。型の誤りはスキーマ検証が
 * 別に知らせるので、ここで重ねて言うと同じことが 2 回出る。
 */
export function resolveTheme(theme: unknown): ThemeResolution {
  if (typeof theme !== 'string') return { kind: 'unset' };
  const trimmed = theme.trim();
  if (!trimmed) return { kind: 'unset' };

  const name = trimmed.toLowerCase();
  const preset = THEME_PRESETS[name];
  if (preset) return { kind: 'preset', name, color: preset };

  if (HEX_COLOR.test(trimmed)) return { kind: 'hex', color: trimmed };

  return { kind: 'unknown', input: trimmed };
}

/**
 * 文書の根に足す `style` 属性。解決できなかったときは何も足さず、
 * 既定の配色（CSS 側）をそのまま使う。
 */
export function themeStyleAttr(theme: unknown): string {
  const resolved = resolveTheme(theme);
  if (resolved.kind !== 'preset' && resolved.kind !== 'hex') return '';
  return ` style="--mdb-color-accent:${resolved.color}"`;
}
