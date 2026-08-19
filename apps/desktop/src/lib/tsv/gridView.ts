/**
 * グリッドの「どこを見ていたか」。タブを行き来しても戻れるように、文書ごとに覚える。
 *
 * 覚えた位置は、そのまま使えるとは限らない。別のタブを見ている間に AI や他の
 * エディターが行を削っていることがあり、消えた行を選んだまま描くと、選択枠だけが
 * 表の外に出る。復元する側で必ず現在の大きさへ収める。
 */

export interface GridView {
  /** 選択範囲の起点。 */
  anchorRow: number;
  anchorCol: number;
  /** 選択範囲の伸長先＝アクティブセル。 */
  focusRow: number;
  focusCol: number;
  /** 縦スクロール量（px）。 */
  scrollTop: number;
}

function clamp(value: number, max: number): number {
  if (value < 0) return 0;
  return value > max ? max : value;
}

/**
 * 覚えた位置を今の表の大きさへ収める。収める先が無ければ（行か列が 0）復元しない。
 */
export function clampView(view: GridView | null, rowCount: number, colCount: number): GridView | null {
  if (view === null || rowCount <= 0 || colCount <= 0) return null;
  return {
    anchorRow: clamp(view.anchorRow, rowCount - 1),
    anchorCol: clamp(view.anchorCol, colCount - 1),
    focusRow: clamp(view.focusRow, rowCount - 1),
    focusCol: clamp(view.focusCol, colCount - 1),
    scrollTop: view.scrollTop < 0 ? 0 : view.scrollTop,
  };
}
