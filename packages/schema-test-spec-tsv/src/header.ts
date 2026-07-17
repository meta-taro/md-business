import { unescapeCell } from './escape.js';
import type { ColumnType, ColumnUiHint, ParsedHeader } from './types.js';

/**
 * ヘッダ記法のキーワード → 基底 {@link ColumnType} と UI ヒントの対応表。
 *
 * `radio` / `datetime` は既存語彙に無いカスタム TSV 独自のキーワードで、それぞれ
 * `enum` / `date` へ写像しつつ UI ヒントを付与する（Issue 010）。
 */
const TYPE_KEYWORDS: Record<
  string,
  { type: ColumnType; ui?: ColumnUiHint }
> = {
  text: { type: 'text' },
  multiline: { type: 'multiline_text' },
  enum: { type: 'enum' },
  radio: { type: 'enum', ui: 'radio' },
  date: { type: 'date' },
  datetime: { type: 'date', ui: 'datetime' },
  number: { type: 'number' },
  checkbox: { type: 'checkbox' },
  url: { type: 'url' },
};

/**
 * 末尾の型注記 `:<keyword>[(<params>)]` を検出する正規表現。
 *
 * - `$` アンカーで「文末の型注記」だけを拾うため、列名に `:` が含まれても保持される
 *   （例 `補足:参考` は既知キーワードでないのでマッチせず、全体が名前になる）。
 * - `datetime` を `date` より前に置き、長い方を優先マッチさせる。
 * - パラメータ `([^)]*)` は enum / radio の選択肢用（他の型に括弧が付いた場合は下流で無効化）。
 */
const TYPE_SUFFIX =
  /:(text|multiline|enum|radio|datetime|date|number|checkbox|url)(?:\(([^)]*)\))?$/;

/**
 * 型付きヘッダセル `列名[:型(パラメータ)][!]` を構造化する純関数。
 *
 * 手順:
 * 1. 末尾 `!` を必須マーカーとして剥がす。
 * 2. 残りの文末が既知の型注記にマッチすれば、その型へ写像し名前を切り出す。
 *    - enum / radio 以外に括弧が付いていたら「不正な注記」とみなし、注記なし（type=text）に
 *      フォールバックして全体を名前として扱う。
 * 3. マッチしなければ全体を列名とし、type は既定の `text`。
 *
 * 名前・enum 選択肢はいずれも {@link unescapeCell} で unescape する（構造記号 `: ( ) | !` は
 * エスケープ対象外なので、人間可読部分だけが unescape される）。
 */
export function parseTypedHeader(cell: string): ParsedHeader {
  let rest = cell;
  let required = false;
  if (rest.endsWith('!')) {
    required = true;
    rest = rest.slice(0, -1);
  }

  const match = TYPE_SUFFIX.exec(rest);
  if (match) {
    const keyword = match[1] as string;
    const params = match[2]; // undefined when no parentheses
    const mapping = TYPE_KEYWORDS[keyword] as {
      type: ColumnType;
      ui?: ColumnUiHint;
    };
    const isEnumLike = mapping.type === 'enum';

    // 括弧は enum / radio でのみ有効。それ以外に括弧が付いていたら注記として認めず、
    // 全体を名前へフォールバックさせる。
    if (params === undefined || isEnumLike) {
      const name = unescapeCell(rest.slice(0, match.index));
      const result: ParsedHeader = { name, type: mapping.type, required };
      if (mapping.ui !== undefined) {
        result.ui = mapping.ui;
      }
      if (isEnumLike) {
        result.enumValues =
          params && params.length > 0
            ? params.split('|').map((v) => unescapeCell(v))
            : [];
      }
      return result;
    }
  }

  return { name: unescapeCell(rest), type: 'text', required };
}
