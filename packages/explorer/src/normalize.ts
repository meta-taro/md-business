const KATAKANA_START = 0x30a1;
const KATAKANA_END = 0x30f6;
const KANA_OFFSET = 0x60;

function katakanaToHiragana(text: string): string {
  return text.replace(/[ァ-ヶ]/g, (ch) => {
    const code = ch.charCodeAt(0);
    return code >= KATAKANA_START && code <= KATAKANA_END ? String.fromCharCode(code - KANA_OFFSET) : ch;
  });
}

/**
 * 検索の突き合わせ用に揃える。全角英数・半角カナ（NFKC）、大文字小文字、カタカナとひらがなの違いを消す。
 * 業務文書は同じ語が「サーバ」「さーば」「ｻｰﾊﾞ」で混在するため、どれで打っても当たるようにする。
 */
export function normalizeForSearch(text: string): string {
  return katakanaToHiragana(text.normalize('NFKC').toLowerCase());
}

/**
 * 揃えた文字列と、その各位置が元の文字列のどこから来たかを返す（抜粋の位置探し用）。
 * NFKC は長さを変える（全角英数・半角カナ・合字）ので、1 文字ずつ揃えて元の位置を覚えておく。
 */
export function normalizeWithOffsets(text: string): { text: string; offsets: number[] } {
  let out = '';
  const offsets: number[] = [];
  let at = 0;
  for (const ch of text) {
    const norm = normalizeForSearch(ch);
    out += norm;
    for (let i = 0; i < norm.length; i += 1) offsets.push(at);
    at += ch.length;
  }
  offsets.push(at);
  return { text: out, offsets };
}

export function splitQuery(query: string): string[] {
  return normalizeForSearch(query)
    .split(/\s+/)
    .filter((term) => term.length > 0);
}
