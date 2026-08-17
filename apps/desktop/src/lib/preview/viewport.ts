/**
 * プレビュー枠の表示幅。
 *
 * 狭い幅で読んだときにどう折り返るかは、幅を狭めて中身を組み直させないと分からない。
 * 縮小表示（transform: scale）では字が小さくなるだけで、折り返しは PC のままになる。
 * ここが返すのは枠に与える幅で、組み直しはブラウザ側がやる。
 */
export type ViewportName = 'pc' | 'phone';

/** スマートフォン表示の幅（CSS px）。よくある端末の見た目の幅に合わせる。 */
export const PHONE_WIDTH = 390;

/** 押すたびに入れ替える。 */
export function nextViewport(current: ViewportName): ViewportName {
  return current === 'pc' ? 'phone' : 'pc';
}

/**
 * 枠に与える CSS 幅。
 *
 * スマートフォン表示では、枠自体が `PHONE_WIDTH` より狭いこともある（分割線を寄せたとき）。
 * そのまま固定幅を渡すと横にはみ出して右端が切れるので、狭いほうに合わせる。
 */
export function frameWidth(name: ViewportName): string {
  return name === 'pc' ? '100%' : `min(${PHONE_WIDTH}px, 100%)`;
}

/**
 * 印刷（PDF 出力）の前に PC 表示へ戻す必要があるか。
 *
 * 印刷の版面は紙で決まるが、画面の幅が残ったまま出して版面が変わっていた場合、
 * 出来た PDF を開くまで気づけない。押した時点で戻して、目に見える状態で印刷する。
 */
export function needsResetForPrint(name: ViewportName): boolean {
  return name !== 'pc';
}
