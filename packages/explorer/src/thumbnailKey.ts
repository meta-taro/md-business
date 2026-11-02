import type { FileKind } from './kind.js';

const encoder = new TextEncoder();

/**
 * 内容の指紋（cyrb53・53 bit）。改ざん検知ではなくキャッシュの当たり判定にだけ使う。
 * 文字列は UTF-8 のバイト列として扱い、同じ中身のバイト列と同じ値になるようにする
 * （アプリによって読み込み結果が文字列だったりバイト列だったりするため）。
 */
export function contentHash(content: string | Uint8Array): string {
  const bytes = typeof content === 'string' ? encoder.encode(content) : content;
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (const byte of bytes) {
    h1 = Math.imul(h1 ^ byte, 2654435761);
    h2 = Math.imul(h2 ^ byte, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const value = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return value.toString(16).padStart(14, '0');
}

export interface ThumbnailKeyInput {
  kind: FileKind;
  /** contentHash() の値 */
  hash: string;
  /** 描画に使った部品と版（例 `zumen@0.3.3`）。版上げで古い絵を出さないために鍵へ含める */
  renderer: string;
  theme: string;
}

/** キャッシュの鍵。長さが一定で、そのままファイル名に使える。 */
export function thumbnailKey(input: ThumbnailKeyInput): string {
  return contentHash(JSON.stringify([input.kind, input.renderer, input.theme, input.hash]));
}
