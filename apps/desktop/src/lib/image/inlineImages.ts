/**
 * 本文に置いた画像を、プレビューに出せる形へ直す。
 *
 * プレビューは中身を持たない枠（srcdoc の iframe）で、その中の相対パスはアプリ自身から
 * 数えられる。フォルダの中の写真を指しても届かないし、届く道を作ると、その道は画像以外にも
 * 開く。そこで、描く前に本文の参照を data URL へ置き換える（読めるのは開いているフォルダの
 * 中の画像だけで、この置き換えは通す先を広げない）。
 *
 * 拾うのは「その場に書いた参照」だけ。コードブロックと行内コードは記法そのものを見せる場所
 * なので触らない。外を指すもの（https: / data: / //…）は元から届いているか、届かせない。
 */
import { isImagePath } from '../workspace/imageFile';

/** 本文に書かれている画像の参照。 */
export interface ImageRef {
  /** 丸括弧の中身をそのまま。差し替えるときの目印に使う。 */
  raw: string;
  /** 山括弧を外し percent 符号を戻した参照。文書の位置から解決する前の形。 */
  ref: string;
}

/** コードブロックの囲い。 */
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** 行内コード。 */
const CODE_SPAN = /`[^`]*`/g;

/** 画像の記法。1=説明 2=参照 3=題名（前の空白ごと）。 */
const IMAGE = /!\[([^\]]*)\]\(\s*(<[^>\n]*>|[^()\s]+)(\s+"[^"]*")?\s*\)/g;

/** 名前に scheme が付いているか（`https:` `data:` など）。 */
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** パスの区切り。円記号で書かれることもある。 */
const SEPARATOR = /[\\/]/;

function decodeRef(raw: string): string {
  const inner = raw.startsWith('<') && raw.endsWith('>') ? raw.slice(1, -1) : raw;
  try {
    return decodeURIComponent(inner);
  } catch {
    // 復号できない並びは、書かれたままの名前として扱う。
    return inner;
  }
}

/** 開いているフォルダの中の画像を指しているか。 */
function isLocalImageRef(ref: string): boolean {
  if (ref === '') return false;
  if (ref.startsWith('/') || ref.startsWith('#') || ref.startsWith('?')) return false;
  if (SCHEME.test(ref)) return false;
  return isImagePath(ref);
}

/** 行内コードの外側だけに手を入れる。 */
function mapOutsideCodeSpans(line: string, fn: (text: string) => string): string {
  let out = '';
  let last = 0;
  CODE_SPAN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CODE_SPAN.exec(line)) !== null) {
    out += fn(line.slice(last, match.index)) + match[0];
    last = match.index + match[0].length;
  }
  return out + fn(line.slice(last));
}

/** コードブロック・行内コードの外側だけに手を入れる。 */
function mapOutsideCode(source: string, fn: (text: string) => string): string {
  let fence: string | null = null;
  return source
    .split('\n')
    .map((line) => {
      if (fence !== null) {
        if (line.trimStart().startsWith(fence)) fence = null;
        return line;
      }
      const opened = FENCE.exec(line);
      if (opened) {
        fence = opened[1].slice(0, 3);
        return line;
      }
      return mapOutsideCodeSpans(line, fn);
    })
    .join('\n');
}

/**
 * 本文が指している画像を数え上げる。同じ参照は 1 件にまとめる
 * （同じ画像を 2 回置いても、読むのは 1 回でよい）。
 */
export function collectImageRefs(source: string): ImageRef[] {
  const found = new Map<string, ImageRef>();
  mapOutsideCode(source, (text) => {
    for (const match of text.matchAll(IMAGE)) {
      const raw = match[2];
      const ref = decodeRef(raw);
      if (isLocalImageRef(ref) && !found.has(raw)) found.set(raw, { raw, ref });
    }
    return text;
  });
  return [...found.values()];
}

/**
 * 文書の位置から画像の参照を解決し、開いているフォルダから見たパスを返す。
 * フォルダの外へ出る参照は解決しない（読み取り側でも拒まれるが、そこまで持って行かない）。
 */
export function resolveImagePath(docPath: string, ref: string): string | null {
  const segments = docPath.split(SEPARATOR).slice(0, -1);
  for (const part of ref.split(SEPARATOR)) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    segments.push(part);
  }
  return segments.length === 0 ? null : segments.join('/');
}

/**
 * 読めた画像を本文へ埋め込む。読めなかったものは書かれたまま残す
 * （消すと、本文に何が書いてあったのかが分からなくなる）。
 */
export function inlineImages(source: string, dataUrls: ReadonlyMap<string, string>): string {
  if (dataUrls.size === 0) return source;
  return mapOutsideCode(source, (text) =>
    text.replace(IMAGE, (whole, alt: string, raw: string, title: string | undefined) => {
      const url = dataUrls.get(raw);
      return url === undefined ? whole : `![${alt}](${url}${title ?? ''})`;
    }),
  );
}
