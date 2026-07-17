import type { ColumnType } from '@md-business/schema-test-spec';

/**
 * 列型語彙は姉妹パッケージ `@md-business/schema-test-spec` の {@link ColumnType} を
 * そのまま再利用する（`text | multiline_text | enum | date | number | checkbox | url`）。
 * ここで再定義せず import type で借りることで、語彙のドリフトを構造的に防ぐ（baseline §16）。
 */
export type { ColumnType };

/**
 * 基底 {@link ColumnType} だけでは表せない Desktop 入力ウィジェットの差異を表す UI ヒント。
 *
 * - `radio`: 選択肢を常時展開したラジオ UI（データ上は `enum` と等価）。
 * - `datetime`: 時刻付き日付ピッカー（データ上は `date` と等価）。
 */
export type ColumnUiHint = 'radio' | 'datetime';

/**
 * 型付きヘッダセル（例 `結果:enum(〇|▲|×)!`）を構造化したもの。
 * カスタム TSV の 1 行目（ヘッダ行）の各セルを {@link parseTypedHeader} で解釈した結果。
 */
export interface ParsedHeader {
  /** 列名（unescape 済み）。 */
  name: string;
  /** 既存語彙へ写像した列型。注記なしの既定は `text`。 */
  type: ColumnType;
  /** 末尾 `!` による必須マーカー。 */
  required: boolean;
  /**
   * `enum` / `radio` 記法の選択肢（`(A|B|C)` を `|` 分割・各値 unescape 済み）。
   * `type === 'enum'` のときのみ存在する。
   */
  enumValues?: string[];
  /** 基底型では表せない Desktop UI 差異（`radio` / `datetime`）。指定時のみ存在。 */
  ui?: ColumnUiHint;
}
