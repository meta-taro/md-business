/**
 * アプリの窓を撮った答えを読む。
 * -----------------------------------------------------------------------------
 * 撮るのはアプリ側なので、ここへ届くのは制御チャネルを通ってきた素の値になる。
 * **形が違うものを黙って通さない**のは、画像として成り立たない答えでも
 * 「撮れた」と返せてしまい、受け取った側が真っ白な画面を見たことになるため。
 */

/** 撮れたもの。 */
export interface WindowShot {
  /** PNG を base64 にしたもの。 */
  data: string;
  /** 画像そのものの大きさ。 */
  width: number;
  height: number;
  /** 撮ったときの窓の大きさ。画像との差が、縮めた分になる。 */
  windowWidth: number;
  windowHeight: number;
}

function size(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/** アプリの答えを読む。読めない形は null。 */
export function parseWindowShot(value: unknown): WindowShot | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const data = record['data'];
  if (typeof data !== 'string' || data === '') return null;
  const width = size(record['width']);
  const height = size(record['height']);
  const windowWidth = size(record['windowWidth']);
  const windowHeight = size(record['windowHeight']);
  if (width === null || height === null || windowWidth === null || windowHeight === null) {
    return null;
  }
  return { data, width, height, windowWidth, windowHeight };
}
