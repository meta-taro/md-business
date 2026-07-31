/**
 * グリッド上の右クリックで WebView 既定のメニューを残すかどうかの判定（DOM 非依存）。
 *
 * 既定のメニューはブラウザの操作（戻る／最新の情報に更新／名前を付けて保存／印刷）を並べる。
 * 表計算の画面で右クリックして出てくるものとしては場違いで、「名前を付けて保存」に至っては
 * 画面の HTML を保存してしまう。列ヘッダのように独自メニューを持つ場所は各所で抑止して
 * いるが、行番号列・座標バー・補足行・余白には出しっぱなしになっていた。
 *
 * ただし文字入力中だけは例外で、切り取り／コピー／貼り付けの導線として意味がある。
 * 入力欄の上かどうかだけで分ける。
 */

/** 判定に使う右クリック対象の性質（実際の DOM ノードは受け取らない）。 */
export interface ContextMenuTarget {
  /** 要素のタグ名（大小は問わない）。 */
  tagName: string;
  /** contenteditable として編集中か。 */
  isContentEditable: boolean;
}

/** 文字入力として扱うタグ。 */
const TEXT_INPUT_TAGS = ['INPUT', 'TEXTAREA'];

/** 既定のメニューを残すなら true（＝抑止しない）。対象不明は抑止側に倒す。 */
export function keepsNativeContextMenu(target: ContextMenuTarget | null): boolean {
  if (target === null) return false;
  if (target.isContentEditable) return true;
  return TEXT_INPUT_TAGS.includes(target.tagName.toUpperCase());
}
