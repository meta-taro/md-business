import type { ParsedHeader, TsvDocument } from '@md-business/schema-test-spec-tsv';

/**
 * TSV グリッドの純モデル（Issue 010・Block TSV-7）。
 *
 * Desktop の編集グリッドが「列型 → 入力ウィジェット」を決める決定ロジックと、
 * セル編集を不変に反映する更新プリミティブを提供する。Svelte コンポーネントは
 * これを描画・binding するだけにし、ロジックはここで node 環境で単体検査する。
 */

/** セル入力ウィジェットの種別。列型（+ UI ヒント）から一意に決まる。 */
export type CellWidgetKind =
  | 'text'
  | 'multiline'
  | 'select'
  | 'radio'
  | 'date'
  | 'datetime'
  | 'number'
  | 'checkbox'
  | 'url';

/** 1 列分のウィジェット仕様。 */
export interface CellWidget {
  kind: CellWidgetKind;
  /** `select` / `radio` の選択肢（enum のみ）。他型では付与しない。 */
  options?: string[];
  /** 必須列か（UI の必須マーク・空セル警告に使う）。 */
  required: boolean;
}

/**
 * 列定義（{@link ParsedHeader}）を入力ウィジェット仕様へ写像する。
 *
 * - `text` → `text`（単一行）/ `multiline_text` → `multiline`（テキストエリア）
 * - `enum` → `select`（ドロップダウン）/ `ui:radio` の enum → `radio`
 * - `date` → `date`（日付ピッカー）/ `ui:datetime` の date → `datetime`
 * - `number` → `number` / `checkbox` → `checkbox` / `url` → `url`
 */
export function widgetForColumn(header: ParsedHeader): CellWidget {
  const required = header.required;

  switch (header.type) {
    case 'text':
      return { kind: 'text', required };
    case 'multiline_text':
      return { kind: 'multiline', required };
    case 'enum':
      return {
        kind: header.ui === 'radio' ? 'radio' : 'select',
        options: header.enumValues ?? [],
        required,
      };
    case 'date':
      return { kind: header.ui === 'datetime' ? 'datetime' : 'date', required };
    case 'number':
      return { kind: 'number', required };
    case 'checkbox':
      return { kind: 'checkbox', required };
    case 'url':
      return { kind: 'url', required };
  }
}

/** ヘッダ列定義の並びを、対応するウィジェット仕様の並びへ写像する。 */
export function gridWidgets(columns: ParsedHeader[]): CellWidget[] {
  return columns.map((header) => widgetForColumn(header));
}

/**
 * 指定セル（`row` 行 `col` 列・いずれも 0 始まり）を `value` へ更新した
 * **新しい** ドキュメントを返す（入力は不変）。
 *
 * 末尾セルが省略された行（`validateTsv` が許容する短い行）を編集する場合は、
 * `col` まで空文字でパディングしてから設定する。触れない行は同一参照のまま残す。
 */
export function setCell(doc: TsvDocument, row: number, col: number, value: string): TsvDocument {
  const rows = doc.rows.map((cells, rowIndex) => {
    if (rowIndex !== row) {
      return cells;
    }
    const next = cells.slice();
    while (next.length <= col) {
      next.push('');
    }
    next[col] = value;
    return next;
  });

  return { ...doc, rows };
}
