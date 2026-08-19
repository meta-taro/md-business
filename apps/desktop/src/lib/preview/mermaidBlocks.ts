/**
 * 作図（`mermaid` の囲み）を画像の記法へ替える。
 *
 * 画面では、出来上がったプレビューの中の囲みを直接描き替えている（renderMermaid）。
 * 画面は打鍵のたびに組み直すので、そちらは描けたものから順に差し替わるほうが速い。
 * ただし書き出し（HTML・画像・サイト）は組み上がった画面を通らないため、その経路では
 * 囲みのまま出てしまう。書き出しでは本文の段階で画像に替える。
 *
 * 描画そのものは受け取る。Mermaid 本体は大きく、また実際の画面がないと文字幅を測れない。
 */
import { collectFencedBlocks } from '../markdown/fencedBlocks';
import type { PreviewTheme } from './previewDocument';

export interface LoadMermaidOptions {
  theme: PreviewTheme;
  /** 図 1 つを SVG にする。無害化まで済んだものを返す。 */
  render: (source: string, theme: PreviewTheme) => Promise<string>;
}

/** `viewBox` の縦横。無ければ null。 */
function sizeOf(openingTag: string): { width: string; height: string } | null {
  const box = /viewBox\s*=\s*"([^"]+)"/.exec(openingTag);
  if (box === null) return null;
  const parts = box[1].trim().split(/[\s,]+/);
  if (parts.length !== 4) return null;
  return { width: parts[2], height: parts[3] };
}

/**
 * 大きさを実寸で書き入れる。
 *
 * Mermaid は `width="100%"` を付けて出すが、画像として貼ると外の幅が伝わらないので
 * 割合が決まらない。`viewBox` の値をそのまま実寸として入れておく（縦横比は保たれ、
 * 表示側の `max-width` で縮む）。
 */
export function withExplicitSize(svg: string): string {
  const opening = /^<svg\b[^>]*>/.exec(svg.trim());
  if (opening === null) return svg;
  const size = sizeOf(opening[0]);
  if (size === null) return svg;
  const attributes = opening[0]
    .replace(/\s(?:width|height)\s*=\s*"[^"]*"/g, '')
    .replace(/^<svg/, `<svg width="${size.width}" height="${size.height}"`);
  return svg.trim().replace(opening[0], attributes);
}

function toDataUri(svg: string): string {
  const bytes = new TextEncoder().encode(svg);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

/** 図の 1 行目を説明に使う。括弧が入ると記法が閉じてしまうので落とす。 */
function toAlt(body: string): string {
  const first = body.split('\n').find((line) => line.trim() !== '') ?? '';
  return first.replace(/[[\]()]/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function loadMermaidImages(
  source: string,
  options: LoadMermaidOptions,
): Promise<Map<string, string>> {
  const blocks = collectFencedBlocks(source, 'mermaid');
  const out = new Map<string, string>();
  if (blocks.length === 0) return out;

  const drawn = new Map<string, string>();
  for (const block of blocks) {
    if (block.body.trim() === '') continue;
    let svg = drawn.get(block.body);
    if (svg === undefined) {
      try {
        svg = withExplicitSize(await options.render(block.body, options.theme));
      } catch {
        // 書きかけの図で本文ごと消えないよう、描けなかったものは元の囲みを残す。
        continue;
      }
      drawn.set(block.body, svg);
    }
    out.set(block.raw, `![${toAlt(block.body)}](${toDataUri(svg)})`);
  }
  return out;
}
