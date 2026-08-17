/**
 * 画像書き出しの注文づくり（純ロジック・IPC なし）。
 *
 * 撮るのは Rust 側（`export_image`）。ここにあるのは、画面で選んだもの
 * （型・倍率・形式）を Rust が読める注文に組み替える部分と、押す前に
 * 「実際に何ピクセルの何が出るか」を見せる部分だけ。
 *
 * 寸法の一覧を Rust と両方に持つのは重複だが、片方は画面に並べるための
 * 順序付きの一覧、もう片方は名前から寸法を引くための表で、要るものが違う。
 * 食い違えば `export_image` が断るので、黙ってずれた画像が出ることはない。
 */

/** 画面で選べる形式。透過は PNG のときだけ意味を持つので、選択肢として並べる。 */
export type ImageFormatChoice = 'png' | 'png-transparent' | 'jpeg';

/**
 * 型の名前。文言キー（`image.preset.<名前>`）と同じ綴りにしてあるので、
 * 増やしたときに訳を足し忘れるとコンパイルが通らない。
 */
export type ImagePresetName =
  | 'ogp'
  | 'x-post'
  | 'instagram-post'
  | 'instagram-story'
  | 'full-hd'
  | 'web-banner';

/** 貼る先ごとの寸法。CSS ピクセルで、倍率は別に掛かる。 */
export interface ImagePreset {
  name: ImagePresetName;
  width: number;
  height: number;
}

/** Rust の `ShotSpec` に対応する注文。この形のまま `export_image` へ渡す。 */
export type ShotSpec = {
  width: number;
  height: number;
  scale: number;
  format: { type: 'png'; transparent: boolean } | { type: 'jpeg'; quality: number };
};

/** 画面で組み立てている途中の注文。 */
export interface ImageOrder {
  preset: ImagePresetName;
  scale: number;
  format: ImageFormatChoice;
  /** JPEG のときだけ使う（1〜100）。形式を切り替えても値を捨てないので常に持つ。 */
  quality: number;
}

/** 並び順は使う頻度の高い順。画面のプルダウンにこの順で出る。 */
export const IMAGE_PRESETS: readonly ImagePreset[] = [
  { name: 'ogp', width: 1200, height: 630 },
  { name: 'x-post', width: 1200, height: 675 },
  { name: 'instagram-post', width: 1080, height: 1080 },
  { name: 'instagram-story', width: 1080, height: 1920 },
  { name: 'full-hd', width: 1920, height: 1080 },
  { name: 'web-banner', width: 728, height: 90 },
];

/**
 * 既定の注文。
 *
 * 倍率 2 を既定にするのは、SNS も OGP も高精細の画面で見られるため。等倍だと文字の縁が粗い。
 * これを CSS 側で解決しようとすると、テンプレートの寸法指定を全部倍で書くことになり、
 * 「1200×630 の版」と「2400×1260 の版」が別物として増える。撮る側で倍率を掛ければ
 * テンプレートは 1 つで済む。
 */
export const DEFAULT_ORDER: ImageOrder = {
  preset: 'ogp',
  scale: 2,
  format: 'png',
  quality: 85,
};

function sizeOf(name: ImagePresetName): ImagePreset {
  const preset = IMAGE_PRESETS.find((candidate) => candidate.name === name);
  if (preset === undefined) throw new Error(`知らない画像サイズです: ${name}`);
  return preset;
}

/** 画面で選んだものを、Rust が読める注文に組み替える。 */
export function buildShotSpec(order: ImageOrder): ShotSpec {
  const { width, height } = sizeOf(order.preset);
  return {
    width,
    height,
    scale: order.scale,
    format:
      order.format === 'jpeg'
        ? { type: 'jpeg', quality: order.quality }
        : { type: 'png', transparent: order.format === 'png-transparent' },
  };
}

/**
 * 押す前に見せる「実際に出るもの」。
 *
 * 型の名前（OGP）だけを見せると、倍率を掛けた後の寸法が分からない。貼る先には
 * ピクセル数の規定があることが多いので、掛けた後の数を出す。
 */
export function describeOutput(order: ImageOrder): string {
  const { width, height } = sizeOf(order.preset);
  const pixelWidth = Math.round(width * order.scale);
  const pixelHeight = Math.round(height * order.scale);
  const format =
    order.format === 'jpeg'
      ? `JPEG ${order.quality}`
      : order.format === 'png-transparent'
        ? 'PNG（透過）'
        : 'PNG';
  return `${pixelWidth} × ${pixelHeight} px · ${format}`;
}
