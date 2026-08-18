/**
 * 検証グリッドの「選択（nav）⇄ 編集（edit）」二モードのキー解決。
 * ------------------------------------------------------------------
 * まるでスプレッドシートの核。nav では ↑↓←→でセル選択枠が動き、Enter/F2/文字入力で
 * その場編集（edit）へ入る。edit ではキャレット編集で ↑↓←→は文字内、Esc で nav へ戻り、
 * Enter で確定して下へ。DOM 非依存の純関数として切り出し、node 環境の vitest で検査する。
 * セル間移動の座標計算自体は `gridNav.nextCell` を再利用する。
 */
import { nextCell, type CellPos, type GridDims, type NavIntent } from './gridNav';

export type GridMode = 'nav' | 'edit';

/**
 * キー入力に対してグリッドが取るべき動作。
 * - move: nav 中のセル選択移動（mode は nav のまま）
 * - edit: nav → edit（同セルの編集を開始）
 * - commit-move: edit 中に確定して別セルへ移動（mode → nav）
 * - break: edit 中にセル内へ改行を入れる（複数行の列のみ）
 * - cancel: edit → nav（同セルに留まる。端での Enter 確定もこれ）
 * - clear: nav 中に選択セルを空にする
 * - undo / redo: 表の履歴を 1 手戻す・進める
 * - pass: 何もしない（テキスト入力へ委ねる / グリッド外への Tab 等）
 */
export type GridAction =
  | { kind: 'move'; to: CellPos }
  | { kind: 'edit' }
  | { kind: 'commit-move'; to: CellPos }
  | { kind: 'break' }
  | { kind: 'cancel' }
  | { kind: 'clear' }
  | { kind: 'undo' }
  | { kind: 'redo' }
  | { kind: 'pass' };

export interface GridKeyContext {
  /** 現在のモード。 */
  mode: GridMode;
  /** 選択セルが複数行入力（textarea）か。Alt/Ctrl+Enter で改行を入れられるかを分ける。 */
  multiline: boolean;
}

/** 修飾なしの単一文字＝タイプして編集を始めるキー（Space・日本語 1 文字含む）。 */
function isPrintable(key: string, ctrl: boolean): boolean {
  return key.length === 1 && !ctrl;
}

function samePos(a: CellPos, b: CellPos): boolean {
  return a.row === b.row && a.col === b.col;
}

// 矢印・Home/End は端でも同セルへ丸めて move（preventDefault してスクロールを抑える）。
// Tab は端で pass にしてフォーカスをグリッド外へ抜けさせる（別扱い）。
const NAV_ARROW_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End']);

/** キー入力・現在セル・グリッド寸法・モードから、取るべき動作を決める純関数。 */
export function planGridKey(
  intent: NavIntent,
  pos: CellPos,
  dims: GridDims,
  ctx: GridKeyContext,
): GridAction {
  const ctrl = intent.ctrl ?? false;

  // undo / redo は編集中でも表の履歴へ回す。セル入力は値を親から与える制御入力なので、
  // 委ねた先のブラウザ既定の文字 undo は働かない（押しても何も起きないだけになる）。
  if (ctrl) {
    const lower = intent.key.toLowerCase();
    if (lower === 'z' && !(intent.shift ?? false)) return { kind: 'undo' };
    if (lower === 'y' || (lower === 'z' && (intent.shift ?? false))) return { kind: 'redo' };
  }

  if (ctx.mode === 'nav') {
    // Alt+↓ はコンボボックスを開く一般的な合図。移動より先に見る。
    if ((intent.alt ?? false) && intent.key === 'ArrowDown') return { kind: 'edit' };
    if (NAV_ARROW_KEYS.has(intent.key)) {
      const to = nextCell(pos, intent, dims);
      return to ? { kind: 'move', to } : { kind: 'pass' };
    }
    if (intent.key === 'Tab') {
      const to = nextCell(pos, intent, dims);
      return to && !samePos(to, pos) ? { kind: 'move', to } : { kind: 'pass' };
    }
    if (intent.key === 'Enter' || intent.key === 'F2') return { kind: 'edit' };
    if (intent.key === 'Delete' || intent.key === 'Backspace') return { kind: 'clear' };
    if (intent.key === 'Escape') return { kind: 'pass' };
    return isPrintable(intent.key, ctrl) ? { kind: 'edit' } : { kind: 'pass' };
  }

  // edit モード
  if (intent.key === 'Escape') return { kind: 'cancel' };

  if (intent.key === 'Enter') {
    // 表計算ソフトと同じ割り当て。Enter はどの列でも確定で、セル内改行は修飾キーを添える。
    // 添えるキーはソフトによって Alt / Ctrl / Shift と分かれるので、複数行の列では全部受ける
    // （Shift+Enter の「確定して上へ」は、その列でだけ諦める）。
    // 改行を持てない列（1 行 1 件が崩れる）では添えても確定として扱う。
    const withBreakKey = (intent.alt ?? false) || ctrl || (intent.shift ?? false);
    if (ctx.multiline && withBreakKey) return { kind: 'break' };
    const to = nextCell(pos, { key: 'Enter', shift: intent.shift }, dims);
    // 端では移動先が自セルに丸まる＝確定のみして nav へ戻す。
    if (!to || samePos(to, pos)) return { kind: 'cancel' };
    return { kind: 'commit-move', to };
  }

  if (intent.key === 'Tab') {
    const to = nextCell(pos, { key: 'Tab', shift: intent.shift }, dims);
    return to && !samePos(to, pos) ? { kind: 'commit-move', to } : { kind: 'pass' };
  }

  // 矢印・Home/End・印字はキャレット編集としてテキスト入力へ委ねる。
  return { kind: 'pass' };
}
