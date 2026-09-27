/**
 * 見出しの並べ替え・絞り込みメニューの中身を、列の型から決める（DOM 非依存の純ロジック）。
 *
 * 型ごとに比べ方と絞り方が違う。数の列を文字として並べると `10` が `9` より前に来るし、
 * 選択肢の列で文字を打たせると打ち間違いで 1 件も当たらない。
 */
import { CHECKBOX_FALSE, CHECKBOX_TRUE, type CellWidget } from './gridModel';
import type { SortDirection, SortSpec } from './gridSort';

/** 絞り込みの入れ方。 */
export type FilterMode = 'values' | 'text' | 'number' | 'date';

/** 列の並べ替え指定を組む。 */
export function sortSpecFor(col: number, dir: SortDirection, widget: CellWidget | undefined): SortSpec {
  switch (widget?.kind) {
    case 'number':
      return { col, dir, kind: 'number' };
    case 'date':
    case 'datetime':
      return { col, dir, kind: 'date' };
    case 'select':
    case 'radio':
      return { col, dir, kind: 'enum', options: widget.options ?? [] };
    case 'checkbox':
      return { col, dir, kind: 'enum', options: [CHECKBOX_TRUE, CHECKBOX_FALSE] };
    default:
      return { col, dir, kind: 'text' };
  }
}

/** 列の絞り込みの入れ方。 */
export function filterModeOf(widget: CellWidget | undefined): FilterMode {
  switch (widget?.kind) {
    case 'select':
    case 'radio':
    case 'checkbox':
      return 'values';
    case 'number':
      return 'number';
    case 'date':
    case 'datetime':
      return 'date';
    default:
      return 'text';
  }
}

/**
 * 一覧から選ぶ絞り込みに並べる値。選択肢の順に並べ、選択肢に無い値が表にあればその後ろ、
 * 空欄（`''`）を最後に置く。
 *
 * 選択肢に無い値も出すのは、打ち間違いや古い選択肢の行を探す用途があるから。出さないと
 * その行だけはどう選んでも絞り込めない。
 */
export function valueChoicesOf(widget: CellWidget | undefined, values: readonly string[]): string[] {
  const declared =
    widget?.kind === 'checkbox' ? [CHECKBOX_TRUE, CHECKBOX_FALSE] : [...(widget?.options ?? [])];
  const seen = new Set(declared);
  const extra: string[] = [];
  for (const value of values) {
    const text = value.trim();
    if (text === '' || seen.has(text)) continue;
    seen.add(text);
    extra.push(text);
  }
  return [...declared, ...extra, ''];
}
