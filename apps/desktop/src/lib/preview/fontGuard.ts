/**
 * 撮る前に、指定された字が手元にあるかを見る。
 *
 * 無い字は黙って別の字に置き換わる。画面で 1 枚見ているうちは気づけるが、一括で 100 枚
 * 出してから気づくと全部出し直しになる。**0 枚で止めたほうが直せる**ので、足りなければ断る。
 *
 * 判定そのものは `document.fonts.check` に任せる（手元にあるかは環境の話で、
 * ここでは決められない）。この層は「何を確かめるか」だけを持つ。
 */

/** 手元のどれかを指す名前。無いということが起きないので確かめない。 */
const GENERIC = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'math',
  'emoji',
  'fangsong',
  '-apple-system',
  'blinkmacsystemfont',
]);

/** 値そのものを指さない書き方。 */
const KEYWORD = new Set(['inherit', 'initial', 'unset', 'revert', 'revert-layer']);

const DECLARATION = /font-family\s*:\s*([^;}]+)/gi;

/** CSS から、確かめる値のある字の名前を出てきた順に返す。 */
export function fontFamilies(css: string): string[] {
  const found: string[] = [];
  for (const declaration of css.matchAll(DECLARATION)) {
    const value = declaration[1];
    if (value === undefined) continue;
    for (const part of value.split(',')) {
      const name = part.trim().replace(/^['"]|['"]$/g, '').trim();
      if (name === '') continue;
      // 変数の中身はここからは追えない。追えないものを「無い」とは言わない。
      if (name.includes('var(')) continue;
      const lower = name.toLowerCase();
      if (GENERIC.has(lower) || KEYWORD.has(lower)) continue;
      if (!found.includes(name)) found.push(name);
    }
  }
  return found;
}

const STYLE_BLOCK = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;

/**
 * 書き出す HTML から、`<style>` の中身だけを繋げて返す。
 *
 * 属性の `style="…"` を混ぜないのは、閉じ方が CSS と違うため。引用符で終わる書き方を
 * CSS の区切り（`;` `}`）で読むと、属性の続きまで字の名前として数える。
 */
export function styleBlocks(html: string): string {
  const parts: string[] = [];
  for (const found of html.matchAll(STYLE_BLOCK)) {
    const body = found[1];
    if (body !== undefined) parts.push(body);
  }
  return parts.join('\n');
}

/** 手元にあるかを確かめる。渡せる術が無ければ null。 */
export type FontCheck = ((family: string) => boolean) | null;

/** 手元に無い字だけを返す。確かめる術が無ければ何も言わない。 */
export function missingFonts(families: string[], check: FontCheck): string[] {
  if (check === null) return [];
  return families.filter((family) => !check(family));
}

/** ブラウザの判定を `FontCheck` の形にする。使えなければ null。 */
export function browserFontCheck(): FontCheck {
  const fonts = typeof document === 'undefined' ? undefined : document.fonts;
  if (fonts === undefined || typeof fonts.check !== 'function') return null;
  return (family: string): boolean => {
    try {
      // 引用符の中の引用符は判定式を壊す。落として渡す。
      return fonts.check(`16px "${family.replace(/"/g, '')}"`);
    } catch {
      return true;
    }
  };
}
