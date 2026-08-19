/**
 * 画像を出すときの見せ方（純ロジック）。
 *
 * 画像そのものは読み取り側から届いた形をそのまま使う。ここで決めるのは、
 * 見出しに出す呼び名と、大きさの合わせ方だけ。
 */

/** 画像の合わせ方。`fit` = 枠に収める / `actual` = 原寸。 */
export type ImageFitMode = 'fit' | 'actual';

/** 合わせ方を切り替える。 */
export function nextFitMode(mode: ImageFitMode): ImageFitMode {
  return mode === 'fit' ? 'actual' : 'fit';
}

/**
 * MIME から見出しに出す短い呼び名を作る。知らない形は空。
 *
 * 当てずっぽうの呼び名（`image/` を落としただけ）を出すと、見た人はそれを
 * 種類の名前として読む。分からないときは何も出さない。
 */
export function imageKindLabel(mime: string): string {
  switch (mime) {
    case 'image/png':
      return 'PNG';
    case 'image/jpeg':
      return 'JPEG';
    case 'image/gif':
      return 'GIF';
    case 'image/webp':
      return 'WEBP';
    case 'image/svg+xml':
      return 'SVG';
    default:
      return '';
  }
}
