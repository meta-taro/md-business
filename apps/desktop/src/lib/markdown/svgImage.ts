/**
 * 描き上がった SVG を、本文へ貼れる画像の記法にするための小道具。
 *
 * 囲みから図を作る経路は作図（mermaid）と構成図（zumen）の 2 つあり、SVG を受け取って
 * から先は同じ扱いになる。**同じ規則を 2 か所に持つと、片方だけ直る。**
 */

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
 * 描き手は `width="100%"` を付けて出すことがあるが、画像として貼ると外の幅が伝わらないので
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

export function toDataUri(svg: string): string {
  const bytes = new TextEncoder().encode(svg);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

/** 図の 1 行目を説明に使う。括弧が入ると記法が閉じてしまうので落とす。 */
export function toImageAlt(body: string): string {
  const first = body.split('\n').find((line) => line.trim() !== '') ?? '';
  return first.replace(/[[\]()]/g, ' ').replace(/\s+/g, ' ').trim();
}
