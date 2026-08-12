/**
 * 行の右クリックメニューの決定ロジック（DOM 非依存）。
 *
 * 行操作バーはボタンが増え、窓を狭めると後ろから順に「…」へ畳まれる。よく使う 5 つを
 * 行の上の右クリックからも出す。バーは残す（初めて開いた人が操作を見つける場所として要る）。
 *
 * ここが持つのは 2 つだけ:
 *
 * - **どの行を対象にするか**。右クリックした行を丸ごと選び直す。行の操作はどれも 1 行にしか
 *   効かないので、範囲選択を保つと「3 行選んでいるのに 1 行だけ消える」ように見える。
 *   選択を対象へ寄せれば、どの行に効くかが押す前に見える
 * - **何を並べるか**。ラベルはバーと同じ文言を指す。同じ操作に別の名前が付くと、
 *   別の操作だと思われる
 */
import type { MessageKey } from '../i18n/messages';
import { rowRange, type CellRange } from './gridRange';

/** 右クリックメニューから起こせる操作。 */
export type RowMenuAction = 'duplicate' | 'copy' | 'clear' | 'toggleHidden' | 'delete';

/** メニュー 1 項目。 */
export interface RowMenuItem {
  action: RowMenuAction;
  /** ラベルの翻訳キー（行操作バーと共用）。 */
  labelKey: MessageKey;
  /** 戻せない操作に印を付ける（表示側で色を変える）。 */
  danger?: boolean;
}

/** 右クリックした行に対して適用する選択範囲（その行の全列）。 */
export function rowMenuSelection(row: number, colCount: number): CellRange {
  return rowRange(row, colCount);
}

/** メニューに並べる項目。`hidden` は対象行が控えに回っているか。 */
export function rowMenuItems(hidden: boolean): RowMenuItem[] {
  return [
    { action: 'duplicate', labelKey: 'grid.duplicateRow' },
    { action: 'copy', labelKey: 'grid.copyRow' },
    { action: 'clear', labelKey: 'grid.clearRow' },
    { action: 'toggleHidden', labelKey: hidden ? 'grid.unhideRow' : 'grid.hideRow' },
    { action: 'delete', labelKey: 'grid.deleteRow', danger: true },
  ];
}
