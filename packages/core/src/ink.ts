/**
 * 読む画面で書いた手書きの線（書き込み）を、正本の .md に残すための読み書き。
 *
 * 書き込みは文書の末尾の HTML コメント 1 つにまとめる。
 *
 * ```md
 * <!-- md-business:ink/v1
 * - id: "ink-1"
 *   anchor: {heading: "dai-2-shou", text: "適格請求書の記載事項は"}
 *   color: "#d33"
 *   width: 3
 *   paths: ["M 12 340 L 120 338"]
 * -->
 * ```
 *
 * - 別ファイルにしないのは、コピー・移動・共有で書き込みだけがはぐれないようにするため。
 * - HTML コメントは GitHub や他のビューアでは表示されず、md-business の描画も生の HTML を
 *   落とすので、プレビュー・PDF には出ない。
 * - 線はページではなく段落に結び付ける。ページの割れ方は窓の大きさで変わるため。
 *   段落は「直前の見出しの id + 段落の先頭の文字」で指し、本文を直しても引き直せる。
 * - 座標は段落の箱に対する 0〜1000 の整数。
 *
 * 本文には一切触れない。`splitInk(writeInk(body, strokes)).body === body` が常に成り立つ。
 */
import yaml from 'js-yaml';
import { findYamlLimitBreach } from './yamlGuard.js';

export const INK_MARKER = 'md-business:ink/v1';

/** 書き込みの塊の上限。線が溜まっても届かない大きさにし、壊れた・悪意のある塊で固まらないようにする。 */
export const MAX_INK_CHARS = 2_000_000;

/** 段落を指すのに使う先頭の文字数。短いと別の段落と取り違え、長いと少しの直しで外れる。 */
export const INK_ANCHOR_CHARS = 32;

export interface InkAnchor {
  /** 直前の見出しの id。文書の頭（見出しより前）の段落なら無し。 */
  heading?: string;
  /** 段落の先頭の文字（空白を詰めたもの）。 */
  text: string;
}

export interface InkStroke {
  id: string;
  anchor: InkAnchor;
  /** SVG の path（`M x y L x y …`）。座標は段落の箱に対する 0〜1000。 */
  paths: string[];
  color?: string;
  width?: number;
  /** 書いた人。 */
  by?: string;
  /** 書いた日時（ISO 8601）。 */
  at?: string;
  /** 文字の注記。AI が読めるのは線ではなくここなので、線とは別に持つ。 */
  note?: string;
}

export interface InkProblem {
  /** 何番目の線か（0 始まり）。塊全体の問題なら null。 */
  index: number | null;
  message: string;
}

export interface InkSplit {
  /** 書き込みの塊を除いた本文。 */
  body: string;
  strokes: InkStroke[];
  /** 読めなかった線。捨てずに知らせる（保存で黙って消さないため）。 */
  problems: InkProblem[];
}

const OPEN = `<!-- ${INK_MARKER}`;
const CLOSE = '-->';

interface InkBlock {
  /** 本文の終わり（塊の前の改行 1 つを除いた位置）。 */
  bodyEnd: number;
  inner: string;
}

/** 末尾にある書き込みの塊を探す。末尾でなければ本文の一部（見本など）として扱う。 */
function findInkBlock(source: string): InkBlock | null {
  const start = source.lastIndexOf(OPEN);
  if (start < 0) return null;
  if (start > 0 && source[start - 1] !== '\n') return null;
  const afterOpen = start + OPEN.length;
  if (source[afterOpen] !== '\n' && source[afterOpen] !== '\r') return null;
  const close = source.indexOf(CLOSE, afterOpen);
  if (close < 0) return null;
  if (source.slice(close + CLOSE.length).trim() !== '') return null;
  let bodyEnd = start;
  if (bodyEnd > 0) bodyEnd -= source[start - 2] === '\r' ? 2 : 1;
  return { bodyEnd, inner: source.slice(afterOpen, close) };
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function readStroke(value: unknown): InkStroke | string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return 'not a mapping';
  }
  const v = value as Record<string, unknown>;
  if (!isString(v.id) || v.id === '') return '`id` must be a non-empty string';
  const anchor = v.anchor as Record<string, unknown> | undefined;
  if (typeof anchor !== 'object' || anchor === null || !isString(anchor.text)) {
    return '`anchor.text` must be a string';
  }
  if (anchor.heading !== undefined && !isString(anchor.heading)) {
    return '`anchor.heading` must be a string';
  }
  if (!Array.isArray(v.paths) || !v.paths.every(isString)) {
    return '`paths` must be a list of strings';
  }
  for (const key of ['color', 'by', 'at', 'note'] as const) {
    if (v[key] !== undefined && !isString(v[key])) return `\`${key}\` must be a string`;
  }
  if (v.width !== undefined && (typeof v.width !== 'number' || !Number.isFinite(v.width))) {
    return '`width` must be a number';
  }
  const stroke: InkStroke = {
    id: v.id,
    anchor: anchor.heading === undefined ? { text: anchor.text } : { heading: anchor.heading, text: anchor.text },
    paths: [...v.paths],
  };
  if (v.color !== undefined) stroke.color = v.color as string;
  if (v.width !== undefined) stroke.width = v.width as number;
  if (v.by !== undefined) stroke.by = v.by as string;
  if (v.at !== undefined) stroke.at = v.at as string;
  if (v.note !== undefined) stroke.note = v.note as string;
  return stroke;
}

/** 本文と書き込みに分ける。書き込みが無ければ本文はそのまま。 */
export function splitInk(source: string): InkSplit {
  const block = findInkBlock(source);
  if (!block) return { body: source, strokes: [], problems: [] };
  const body = source.slice(0, block.bodyEnd);

  const breach = findYamlLimitBreach(block.inner, MAX_INK_CHARS, 'Ink block');
  if (breach) return { body, strokes: [], problems: [{ index: null, message: breach.message }] };

  let parsed: unknown;
  try {
    parsed = yaml.load(block.inner, { schema: yaml.JSON_SCHEMA });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { body, strokes: [], problems: [{ index: null, message: `Ink block is not valid YAML: ${message}` }] };
  }
  if (parsed === undefined || parsed === null) return { body, strokes: [], problems: [] };
  if (!Array.isArray(parsed)) {
    return { body, strokes: [], problems: [{ index: null, message: 'Ink block must be a list' }] };
  }

  const strokes: InkStroke[] = [];
  const problems: InkProblem[] = [];
  const seen = new Set<string>();
  parsed.forEach((value, index) => {
    const result = readStroke(value);
    if (typeof result === 'string') {
      problems.push({ index, message: result });
    } else if (seen.has(result.id)) {
      problems.push({ index, message: `duplicate id \`${result.id}\`` });
    } else {
      seen.add(result.id);
      strokes.push(result);
    }
  });
  return { body, strokes, problems };
}

/**
 * 文字列を YAML の値として書く。JSON の文字列はそのまま YAML として読める。
 * `>` を `>` にするのは、注記に `-->` や `--!>` が入ってもコメントが途中で閉じないため。
 */
function quote(value: string): string {
  return JSON.stringify(value).replace(/>/g, '\\u003e');
}

function strokeLines(stroke: InkStroke): string[] {
  const anchor =
    stroke.anchor.heading === undefined
      ? `{text: ${quote(stroke.anchor.text)}}`
      : `{heading: ${quote(stroke.anchor.heading)}, text: ${quote(stroke.anchor.text)}}`;
  const lines = [`- id: ${quote(stroke.id)}`, `  anchor: ${anchor}`];
  if (stroke.by !== undefined) lines.push(`  by: ${quote(stroke.by)}`);
  if (stroke.at !== undefined) lines.push(`  at: ${quote(stroke.at)}`);
  if (stroke.color !== undefined) lines.push(`  color: ${quote(stroke.color)}`);
  if (stroke.width !== undefined) lines.push(`  width: ${stroke.width}`);
  if (stroke.note !== undefined) lines.push(`  note: ${quote(stroke.note)}`);
  lines.push(`  paths: [${stroke.paths.map(quote).join(', ')}]`);
  return lines;
}

/**
 * 書き込みを文書の末尾に書く（前の塊は差し替える）。線が無ければ塊ごと外す。
 * 改行は本文に合わせる（CRLF の文書には CRLF で書く）。
 */
export function writeInk(source: string, strokes: readonly InkStroke[]): string {
  const { body } = splitInk(source);
  if (strokes.length === 0) return body;
  const eol = body.includes('\r\n') ? '\r\n' : '\n';
  const lines = [OPEN, ...strokes.flatMap(strokeLines), CLOSE];
  return body + eol + lines.join(eol) + eol;
}

function squeeze(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** 段落から結び付け先を作る。 */
export function makeInkAnchor(heading: string | undefined, paragraphText: string): InkAnchor {
  // 文字単位で切る（サロゲートペアの途中で切らない）。
  const text = Array.from(squeeze(paragraphText)).slice(0, INK_ANCHOR_CHARS).join('');
  return heading === undefined ? { text } : { heading, text };
}

/**
 * 結び付け先の段落を探す。見つからなければ -1（場所を失った書き込み）。
 *
 * 同じ見出しの下で先頭の文字が合う段落を優先し、無ければ文書全体で最初に合う段落。
 * 見出しを書き直しても、段落の文字が残っていれば付いてくる。
 */
export function resolveInkAnchor(
  anchor: InkAnchor,
  paragraphs: readonly { heading?: string; text: string }[],
): number {
  const want = squeeze(anchor.text);
  if (want === '') return -1;
  let fallback = -1;
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i]!;
    if (!squeeze(p.text).startsWith(want)) continue;
    if (anchor.heading !== undefined && p.heading === anchor.heading) return i;
    if (fallback < 0) fallback = i;
  }
  return fallback;
}

export type InkPoint = [number, number];

function distanceToSegment(p: InkPoint, a: InkPoint, b: InkPoint): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/**
 * 線の点列を間引く（Ramer–Douglas–Peucker）。tolerance より近い点は落とす。
 * ペンは 1 本で数百点を出すので、そのまま残すと .md の末尾が読めない長さになる。
 */
export function simplifyStroke(points: readonly InkPoint[], tolerance: number): InkPoint[] {
  if (points.length <= 2) return points.map((p) => [p[0], p[1]]);
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  // 再帰にしないのは、長い線で呼び出しが深くなりすぎないようにするため。
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let farthest = -1;
    let maxDistance = tolerance;
    for (let i = first + 1; i < last; i++) {
      const d = distanceToSegment(points[i]!, points[first]!, points[last]!);
      if (d > maxDistance) {
        maxDistance = d;
        farthest = i;
      }
    }
    if (farthest < 0) continue;
    keep[farthest] = true;
    stack.push([first, farthest], [farthest, last]);
  }
  return points.filter((_, i) => keep[i]).map((p) => [p[0], p[1]]);
}

function toCoord(value: number): number {
  return Math.max(0, Math.min(1000, Math.round(value)));
}

/** 点列を path にする。座標は 0〜1000 の整数に丸める。 */
export function pointsToPath(points: readonly InkPoint[]): string {
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toCoord(p[0])} ${toCoord(p[1])}`)
    .join(' ');
}

/** path を点列に戻す。`M` で始まり `L` が続く形だけを読む。それ以外は空。 */
export function pathToPoints(path: string): InkPoint[] {
  const tokens = path.trim().split(/\s+/);
  if (tokens.length < 3 || tokens.length % 3 !== 0) return [];
  const points: InkPoint[] = [];
  for (let i = 0; i < tokens.length; i += 3) {
    const command = tokens[i];
    if (command !== (i === 0 ? 'M' : 'L')) return [];
    const x = Number(tokens[i + 1]);
    const y = Number(tokens[i + 2]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
    points.push([x, y]);
  }
  return points;
}
