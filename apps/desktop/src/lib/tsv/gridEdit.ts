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

// 値を文字列で組み立てられないぶん、打鍵そのものを入力へ渡すウィジェット。
// 日付入力は「年/月/日」の欄を持ち、`2` のような途中の文字列を値として受け取れない
// （代入した時点で無効な日付として空になる）。
const HANDOFF: ReadonlySet<CellWidgetKind> = new Set<CellWidgetKind>(['date', 'datetime']);

/**
 * 打鍵で編集へ入るとき、その打鍵を止めずに入力へ渡すか判定する。
 *
 * 日付系のセルで「2026-08-11」と打つと、1 文字目の `2` は編集を始めるためだけに使われて
 * 消え、残りが年の欄へ入って「0026-08-11」になる。これを防ぐには打鍵を止めず、
 * 入力を先に作って焦点を移し、その文字を日付入力自身に受け取らせる必要がある。
 *
 * 空白は日付の欄に入る文字ではなく、止めないとページがスクロールするので対象外。
 */
export function handsOffKey(
  kind: CellWidgetKind | undefined,
  key: string,
  ctrl: boolean,
): boolean {
  if (ctrl || key.length !== 1 || key === ' ') return false;
  return kind !== undefined && HANDOFF.has(kind);
}

/**
 * セルの中に改行を持てる列か（見出しの目印と改行キーの受け口が同じ判定を使う）。
 *
 * TSV は 1 物理行 = 1 件なので、改行を持てるのは複数行として宣言された列だけ。
 * ほかの列に改行が入ると、次の行として読まれて表が崩れる。
 */
export function acceptsLineBreak(kind: CellWidgetKind | undefined): boolean {
  return kind === 'multiline';
}
