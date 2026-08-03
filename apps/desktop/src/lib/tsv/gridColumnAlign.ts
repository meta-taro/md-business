/**
 * 検証グリッドの列寄せ（右クリックメニューで左／中央／右を選べるようにする）。
 * ------------------------------------------------------------------
 * 1 列ぶんの指定が、その列の 3 箇所すべてに効く:
 *   - 型付きヘッダ（列名）
 *   - データセル（静的表示・入力ウィジェット）
 *   - 大分類（グループ見出し）… 所属列の指定に従う（{@link groupAlign}）
 * 大分類は複数列にまたがるため、所属列の寄せが割れているときだけ中央へ倒す。
 * 選択肢生成・寄せ状態・CSS 値への写像を DOM 非依存の純関数として切り出す。
 */
import type { ParsedHeader } from '@md-business/schema-test-spec-tsv';
import { widgetForColumn } from './gridModel';

/** 列テキストの寄せ。 */
export type ColAlign = 'left' | 'center' | 'right';

/** メニュー・反復用の寄せ並び（表示順）。 */
export const COL_ALIGNS: readonly ColAlign[] = ['left', 'center', 'right'];

/** 寄せごとの日本語ラベル（右クリックメニュー表示）。 */
const ALIGN_LABELS: Record<ColAlign, string> = {
  left: '左寄せ',
  center: '中央寄せ',
  right: '右寄せ',
};

/** 寄せごとの CSS 値（1 行表示は flex・折り返し表示は block なので両方を与える）。 */
const ALIGN_CSS: Record<ColAlign, { text: string; justify: string }> = {
  left: { text: 'left', justify: 'flex-start' },
  center: { text: 'center', justify: 'center' },
  right: { text: 'right', justify: 'flex-end' },
};

/** 1 列分の既定寄せを型から決める（数値列は右寄せ＝表計算の慣習、他は左寄せ）。 */
export function defaultColAlign(header: ParsedHeader): ColAlign {
  return widgetForColumn(header).kind === 'number' ? 'right' : 'left';
}

/** 列定義の並びを既定寄せの並びへ写像する（初期状態）。 */
export function defaultColAligns(columns: ParsedHeader[]): ColAlign[] {
  return columns.map((header) => defaultColAlign(header));
}

/** 指定列の寄せを更新した **新しい** 配列を返す（入力は不変）。範囲外の index は無視。 */
export function setColAlign(aligns: ColAlign[], index: number, align: ColAlign): ColAlign[] {
  if (index < 0 || index >= aligns.length) return aligns;
  return aligns.map((a, i) => (i === index ? align : a));
}

/** 右クリックメニュー 1 項目。 */
export interface ColAlignMenuItem {
  align: ColAlign;
  label: string;
  /** 現在の列の寄せと一致するか（チェック表示用）。 */
  checked: boolean;
}

/** 現在の寄せを踏まえた右クリックメニューの選択肢を返す。 */
export function colAlignMenuItems(current: ColAlign): ColAlignMenuItem[] {
  return COL_ALIGNS.map((align) => ({
    align,
    label: ALIGN_LABELS[align],
    checked: align === current,
  }));
}

/**
 * 大分類（複数列にまたがる見出し）の寄せ。所属列の指定が揃っていればそれに従い、
 * 割れていれば中央へ倒す（どの列に合わせても他とずれるため、見出しとして無難な側）。
 */
export function groupAlign(aligns: ColAlign[], start: number, span: number): ColAlign {
  const covered = aligns.slice(Math.max(0, start), start + span);
  const first = covered[0];
  if (first === undefined) return 'center';
  return covered.every((a) => a === first) ? first : 'center';
}

/** 寄せを inline style の宣言列へ（1 行表示＝flex と折り返し表示＝block の両方に効かせる）。 */
export function alignStyle(align: ColAlign): string {
  const css = ALIGN_CSS[align];
  return `text-align:${css.text};justify-content:${css.justify}`;
}
