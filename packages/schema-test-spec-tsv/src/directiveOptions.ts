/**
 * ディレクティブ末尾の `key=値` の並びを読む。
 *
 * 空白で切らないのは、値に列名が並ぶため。列名には空白を含められる（`対応 状態`）ので、
 * **次のオプションの頭が来るまでを 1 つの値とする**。区切りを空白にすると、列名に空白を
 * 使った時点で黙って別の指定になる。
 */

/** オプションの頭（`(行頭|空白) + 小文字の語 + =`）。 */
const OPTION_HEAD = /(^|\s)([a-z]+)=/g;

/** 種別語を除いた本体を、オプションの手前と `key=値` に分けた結果。 */
export interface DirectiveOptions {
  /** 最初のオプションより前の字（様式の名前・参照先など）。無ければ空。 */
  head: string;
  /** `key=値`。同じ key が 2 回あれば後勝ち。 */
  options: Map<string, string>;
}

export function splitDirectiveOptions(body: string): DirectiveOptions {
  const text = body.trim();
  const heads: { key: string; at: number; valueAt: number }[] = [];

  OPTION_HEAD.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = OPTION_HEAD.exec(text)) !== null) {
    const key = match[2] as string;
    const at = match.index + (match[1] as string).length;
    heads.push({ key, at, valueAt: at + key.length + 1 });
  }

  const options = new Map<string, string>();
  heads.forEach((option, index) => {
    const end = heads[index + 1]?.at ?? text.length;
    options.set(option.key, text.slice(option.valueAt, end).trim());
  });

  return { head: text.slice(0, heads[0]?.at ?? text.length).trim(), options };
}
