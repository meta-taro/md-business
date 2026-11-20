/**
 * 本モードで書き込む線の形と、その読み書き・消しゴムの当たり判定（DOM に触らない純関数）。
 *
 * 座標はページの組み幅（縮める前）を 1 とした値で持つ。ページは窓の大きさに合わせて
 * 縮めたり広げたりするが、組み幅は変わらないので、同じ値がいつも本文の同じ所を指す。
 */

export type InkTool = 'pen' | 'highlighter';

export interface InkStroke {
  tool: InkTool;
  color: string;
  /** 線の太さ（組み幅を 1 とした値）。 */
  width: number;
  /** x0, y0, x1, y1, … の並び。 */
  points: number[];
}

export interface InkData {
  v: 1;
  /** ページの鍵（原本の番号か通し番号）ごとの線。 */
  sheets: Record<string, InkStroke[]>;
}

const TOOLS: readonly InkTool[] = ['pen', 'highlighter'];
/** 色は自前の選択肢から選ぶだけなので、#rgb / #rrggbb 以外は受け付けない（SVG の属性へ入るため）。 */
const COLOR = /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i;
/** 保存する桁。組み幅 640px なら 0.06px 刻みで、目に見える差は出ない。 */
const DIGITS = 1e4;

export function emptyInk(): InkData {
  return { v: 1, sheets: {} };
}

/**
 * ページの鍵。原本の番号で持てば、前に別のページが足されても線は同じページに付いたまま。
 * 番号の無いページは通し番号（1 始まり）で持つ。
 */
export function sheetKey(label: string, index: number): string {
  const name = label.trim();
  return name === '' ? `#${index + 1}` : name;
}

/** 線に点を足す。前の点からほとんど動いていなければ足さず、同じ配列を返す。 */
export function addPoint(
  points: readonly number[],
  x: number,
  y: number,
  minDist: number
): number[] {
  const n = points.length;
  if (n >= 2 && Math.hypot(x - points[n - 2]!, y - points[n - 1]!) < minDist) {
    return points as number[];
  }
  return [...points, x, y];
}

/** 点 (px, py) から線分 (ax, ay)–(bx, by) までの距離。 */
function segmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function touches(stroke: InkStroke, x: number, y: number, radius: number): boolean {
  const p = stroke.points;
  const reach = radius + stroke.width / 2;
  if (p.length === 2) return Math.hypot(x - p[0]!, y - p[1]!) <= reach;
  for (let i = 0; i + 3 < p.length; i += 2) {
    if (segmentDistance(x, y, p[i]!, p[i + 1]!, p[i + 2]!, p[i + 3]!) <= reach) return true;
  }
  return false;
}

/** 消しゴムが触れた線を丸ごと消す。何も消えなければ同じ配列を返す。 */
export function eraseAt(
  strokes: readonly InkStroke[],
  x: number,
  y: number,
  radius: number
): InkStroke[] {
  const kept = strokes.filter((s) => !touches(s, x, y, radius));
  return kept.length === strokes.length ? (strokes as InkStroke[]) : kept;
}

const round = (n: number): number => Math.round(n * DIGITS) / DIGITS;

export function serializeInk(data: InkData): string {
  const sheets: Record<string, InkStroke[]> = {};
  for (const [key, strokes] of Object.entries(data.sheets)) {
    if (strokes.length === 0) continue;
    sheets[key] = strokes.map((s) => ({ ...s, width: round(s.width), points: s.points.map(round) }));
  }
  return JSON.stringify({ v: 1, sheets });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toStroke(value: unknown): InkStroke | null {
  if (!isRecord(value)) return null;
  const { tool, color, width, points } = value;
  if (!TOOLS.includes(tool as InkTool)) return null;
  if (typeof color !== 'string' || !COLOR.test(color)) return null;
  if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) return null;
  if (!Array.isArray(points) || points.length < 2 || points.length % 2 !== 0) return null;
  if (!points.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  return { tool: tool as InkTool, color, width, points: points as number[] };
}

/** 保存してあった線を読む。壊れていれば空、おかしな線はその線だけを捨てる。 */
export function parseInk(text: string): InkData {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return emptyInk();
  }
  if (!isRecord(raw) || raw.v !== 1 || !isRecord(raw.sheets)) return emptyInk();
  const data = emptyInk();
  for (const [key, list] of Object.entries(raw.sheets)) {
    if (!Array.isArray(list)) continue;
    const strokes = list.map(toStroke).filter((s): s is InkStroke => s !== null);
    if (strokes.length > 0) data.sheets[key] = strokes;
  }
  return data;
}
