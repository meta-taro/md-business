import { classifyLine } from './classify.js';
import { parseTypedHeader } from './header.js';
import { unescapeCell } from './escape.js';
import type { ParsedHeader } from './types.js';

/**
 * カスタム TSV テキスト全体を構造化した結果（Block TSV-4）。
 */
export interface TsvDocument {
  /** `#!` マジック行のフォーマット識別子（例 `md-business:test-spec-tsv/v1`）。無ければ空文字。 */
  formatId: string;
  /** `#` メタ行の `キー: 値`（コロンを含まない行は無視。同一キーは後勝ち）。 */
  meta: Record<string, string>;
  /** `#@` ディレクティブ行（`#@` を剥がし trim した生文字列。詳細パースは別ブロック）。 */
  directives: string[];
  /** 最初の `data` 行＝型付きヘッダを解釈した列定義。 */
  columns: ParsedHeader[];
  /** ヘッダ以降の `data` 行（tab 分割・各セル unescape 済み）。 */
  rows: string[][];
}

/**
 * 物理行を分割する。`\r\n` / `\n` の両方に対応（各行末の `\r` を除去）。
 *
 * セル内改行は `\n` エスケープで表現される前提なので、生の改行での分割が
 * 「1 レコード = 1 物理行」を壊さない（Issue 010 設計制約）。
 */
function splitPhysicalLines(text: string): string[] {
  if (text.length === 0) {
    return [];
  }
  return text.split('\n').map((line) => line.replace(/\r$/, ''));
}

/**
 * カスタム TSV テキストを `{ formatId, meta, directives, columns, rows }` へ組み上げる純関数。
 *
 * 各物理行を {@link classifyLine} で判別し、種類ごとに処理する:
 * - `magic`: `#!` を剥がして formatId に（最初の 1 本のみ採用）。
 * - `meta`: `#` を剥がし最初の `:` で `キー: 値` に分割（コロン無しは無視）。
 * - `directive`: `#@` を剥がして生文字列を収集。
 * - `data`: 最初の行を {@link parseTypedHeader} で列定義に、以降を tab 分割 + {@link unescapeCell}。
 * - `blank`: 読み飛ばす。
 */
export function parseTsv(text: string): TsvDocument {
  let formatId = '';
  const meta: Record<string, string> = {};
  const directives: string[] = [];
  let columns: ParsedHeader[] = [];
  const rows: string[][] = [];
  let headerSeen = false;

  for (const line of splitPhysicalLines(text)) {
    const kind = classifyLine(line);

    switch (kind) {
      case 'blank':
        break;

      case 'magic': {
        // 最初のマジック行だけを採用する。
        if (formatId === '') {
          formatId = line.slice(2).trim();
        }
        break;
      }

      case 'directive': {
        directives.push(line.slice(2).trim());
        break;
      }

      case 'meta': {
        const body = line.slice(1).trim();
        const colon = body.indexOf(':');
        if (colon !== -1) {
          const key = body.slice(0, colon).trim();
          const value = body.slice(colon + 1).trim();
          meta[key] = value;
        }
        break;
      }

      case 'data': {
        const cells = line.split('\t');
        if (!headerSeen) {
          columns = cells.map((cell) => parseTypedHeader(cell));
          headerSeen = true;
        } else {
          rows.push(cells.map((cell) => unescapeCell(cell)));
        }
        break;
      }
    }
  }

  return { formatId, meta, directives, columns, rows };
}
