/**
 * 検証グリッドの列表示モード（Issue 010・右クリックメニューで
 * テキストを折り返す／突き抜ける／見切れるを選べるようにする）。
 * ------------------------------------------------------------------
 * 固定列幅（{@link ./gridLayout}）に収まらないセルテキストの見せ方を列ごとに切り替える:
 *   - clip     … セル境界で省略（… の ellipsis・スプレの既定）
 *   - wrap     … セル幅内で折り返し（行高が内容に応じて伸びる）
 *   - overflow … セル境界を突き抜けて隣へはみ出す（クリップしない・スプレの既定挙動）
 * 右クリックメニューの選択肢生成と列モード状態を DOM 非依存の純関数として切り出す。
 */
import type { ParsedHeader } from '@md-business/schema-test-spec-tsv';
import { widgetForColumn } from './gridModel';

/** 列テキストの表示モード。 */
export type ColOverflowMode = 'clip' | 'wrap' | 'overflow';

/** メニュー・反復用のモード並び（表示順）。 */
export const COL_OVERFLOW_MODES: readonly ColOverflowMode[] = ['clip', 'wrap', 'overflow'];

/** モードごとの日本語ラベル（右クリックメニュー表示）。 */
const MODE_LABELS: Record<ColOverflowMode, string> = {
  clip: '見切れる（省略）',
  wrap: '折り返す',
  overflow: '突き抜ける',
};

/** 1 列分の既定モードを型から決める（複数行列は折り返し、他は見切れ）。 */
export function defaultColMode(header: ParsedHeader): ColOverflowMode {
  return widgetForColumn(header).kind === 'multiline' ? 'wrap' : 'clip';
}

/** 列定義の並びを既定モードの並びへ写像する（初期状態）。 */
export function defaultColModes(columns: ParsedHeader[]): ColOverflowMode[] {
  return columns.map((header) => defaultColMode(header));
}

/**
 * 指定列のモードを更新した **新しい** 配列を返す（入力は不変）。範囲外の index は無視。
 */
export function setColMode(
  modes: ColOverflowMode[],
  index: number,
  mode: ColOverflowMode,
): ColOverflowMode[] {
  if (index < 0 || index >= modes.length) return modes;
  return modes.map((m, i) => (i === index ? mode : m));
}

/**
 * 列定義の変化に追従する。列数が変わった（別ファイルを開いた）ら既定モードで作り直し、
 * 同じ列数なら手動モードを保つ（同一参照）。列幅の reset と対称の考え方。
 */
export function reconcileColModes(
  modes: ColOverflowMode[],
  columns: ParsedHeader[],
): ColOverflowMode[] {
  if (modes.length === columns.length) return modes;
  return defaultColModes(columns);
}

/** 右クリックメニュー 1 項目。 */
export interface ColModeMenuItem {
  mode: ColOverflowMode;
  label: string;
  /** 現在の列モードと一致するか（チェック表示用）。 */
  checked: boolean;
}

/** 現在モードを踏まえた右クリックメニューの選択肢を返す。 */
export function colModeMenuItems(current: ColOverflowMode): ColModeMenuItem[] {
  return COL_OVERFLOW_MODES.map((mode) => ({
    mode,
    label: MODE_LABELS[mode],
    checked: mode === current,
  }));
}
