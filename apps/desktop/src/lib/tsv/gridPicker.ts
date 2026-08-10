/**
 * enum セルの候補リストを「いつ開くか」の決定ロジック。
 * ------------------------------------------------------------------
 * テキスト入力系のセルは、うっかりクリックで値を壊さないよう編集開始に一手間
 * （ダブルクリック / Enter / F2）を課している。enum は選択肢が有限で、開いても
 * 選ばずに閉じれば値は変わらないため、その一手間を課す理由がない。
 * 結果列を埋める作業では毎行ここを通るので、1 クリックで開くかどうかが速さに直結する。
 *
 * DOM に触れないので node 環境の vitest で全分岐を検査できる。
 */
import type { CellWidgetKind } from './gridModel';
import type { GridMode } from './gridMode';

/** クリック（＝ボタンを離した時点）の状況。DOM の PointerEvent とグリッドの状態から写す。 */
export interface CellClickIntent {
  /** 押されたボタン。0 が主ボタン。 */
  button: number;
  /** Shift 併用＝範囲の伸長。 */
  shift: boolean;
  /** Ctrl / Cmd 併用＝ショートカット。 */
  ctrl: boolean;
  /** 選択が単一セルに畳まれているか（ドラッグで範囲を掴んでいない）。 */
  collapsed: boolean;
  /** 離したセルがアクティブセルか。 */
  active: boolean;
  /** 編集可能な文書か。 */
  editable: boolean;
  /** 現在のモード。 */
  mode: GridMode;
}

/**
 * 編集へ入った直後に候補リストを開くべきウィジェットか。
 * `radio` は選択肢が常時見えているので開く対象にしない。
 */
export function opensPickerOnEdit(kind: CellWidgetKind | undefined): boolean {
  return kind === 'select';
}

/**
 * 立てられた「開く要求」を消費してよいか。
 *
 * 開くのは編集へ入った 1 回だけ。編集中かどうかで判断すると、値を選んだあとも
 * 編集中のままなので開き直してしまい、次の操作が候補リストに吸われる。
 * 要求は編集へ入るときに立て、開いたら降ろす（呼び出し側が降ろす）。
 */
export function takePickerRequest(kind: CellWidgetKind | undefined, requested: boolean): boolean {
  return requested && opensPickerOnEdit(kind);
}

/** シングルクリックで編集（＝候補リスト表示）へ入ってよいか。 */
export function opensOnSingleClick(
  kind: CellWidgetKind | undefined,
  intent: CellClickIntent,
): boolean {
  if (!intent.editable || intent.mode !== 'nav') return false;
  // 右クリックは列メニュー、修飾キー併用は範囲選択の操作。どちらも編集開始に使わない。
  if (intent.button !== 0 || intent.shift || intent.ctrl) return false;
  // ドラッグで範囲を掴んだ離しは選択が目的。掴んだ範囲を編集開始で畳ませない。
  if (!intent.collapsed || !intent.active) return false;
  return opensPickerOnEdit(kind);
}
