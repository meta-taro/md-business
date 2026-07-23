/**
 * 検証グリッドの nav→edit で「打鍵した文字を種にして値を置換編集するか」を決める純関数。
 * ------------------------------------------------------------------
 * スプレッドシート同様、テキスト入力系のセルは1文字打つとその文字で既存値を置換して
 * 編集を始める。select / date / checkbox 等は打鍵で値を差し替えないため、編集へは入るが
 * 値は保持する。DOM に触れないので node 環境の vitest で全分岐を検査できる。
 */
import type { CellWidgetKind } from './gridModel';

// 1打鍵で置換編集を始められる、テキスト入力系のウィジェット。
const SEEDABLE: ReadonlySet<CellWidgetKind> = new Set<CellWidgetKind>([
  'text',
  'url',
  'number',
  'multiline',
]);

/**
 * edit へ入る印字キーを、そのセルの入力へ種として渡すか判定する。
 * - テキスト入力系（text / url / number / multiline / 列型なし）: 打鍵文字を返す
 *   （呼び出し側はその文字で値を置換して編集を始める）
 * - select / date / datetime / checkbox / radio: null（値を保持したまま編集へ）
 * - 修飾キー付き・非印字キー（矢印 / Enter / F2 等、キー名が複数文字）: null
 */
export function seedFromKey(
  kind: CellWidgetKind | undefined,
  key: string,
  ctrl: boolean,
): string | null {
  if (ctrl || key.length !== 1) return null;
  if (kind === undefined || SEEDABLE.has(kind)) return key;
  return null;
}
