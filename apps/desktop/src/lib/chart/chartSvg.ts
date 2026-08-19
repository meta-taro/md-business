/**
 * 図を SVG の文字列にする。
 *
 * プレビューは eval を禁じた枠の中で動くので、描画の道具を実行時に読み込む形は取れない
 * （`scripts/scan-bundle.mjs`）。ここで文字列として組み立てて渡す。同じ文字列が PDF にも
 * そのまま乗るため、画面と印刷で描画の経路が 2 つに割れない。
 *
 * 図は本文へ `data:` の画像として差し込む。本文の Markdown → HTML の経路は生の HTML を
 * 落とすため（`renderMarkdownToHtml` の `allowDangerousHtml: false`）、`<svg>` をそのまま
 * 本文へ置くと消える。画像なら既存の無害化の許可（`data:image/svg+xml;base64,`）に
 * そのまま乗り、画面・PDF・書き出しのどれも同じ絵を通る。
 *
 * 画像として読み込まれた SVG は外側の文字色を受け取れない。軸・目盛り・文字の色は
 * 呼ぶ側から渡す（`ink`）。プレビューは明るい地と暗い地の両方で開かれるので、
 * 決め打ちにするとどちらかで読めなくなる。
 *
 * 文字は必ずここで逃がす。無害化に任せると、無害化を通さない経路（PDF・書き出し）で
 * 生の `<` が混ざったときに図ごと壊れる。
 */
import type { ChartData } from './chartData';
import type { ChartType } from './chartSpec';

export interface ChartSvgOptions {
  type: ChartType;
  title?: string | null;
  /** 軸・目盛り・文字の色。地の色に合わせて呼ぶ側が決める。 */
  ink?: string;
}

/** 明るい地のときの文字色（標準プレビューの `--md-fg`）。 */
const DEFAULT_INK = '#1f2328';

/**
 * 今描いている図の文字色。`renderChartSvg` の入口で置き、描き終わるまで変わらない
 * （途中に待ちが無いので、描画どうしが混ざることはない）。
 */
let ink = DEFAULT_INK;

const W = 640;
const H = 320;
const PAD_LEFT = 56;
const PAD_RIGHT = 16;

/**
 * 系列の色。明るい地・暗い地・白い紙のどれでも読める中間の濃さで選んである。
 * 6 色を超える系列は色を巡回させる（それだけ並べたら、色ではもう見分けられない）。
 */
const PALETTE = ['#5b6ee1', '#2f9e78', '#d9822b', '#c14a4a', '#8a63c9', '#2c8fb5'];

function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 座標。桁を切らないと同じ図でも差分が出る。 */
function n(value: number): string {
  return value.toFixed(1);
}

/** 目盛りの刻み幅を、読みやすい数（1 / 2 / 2.5 / 5 の 10 倍）に丸める。 */
function niceStep(span: number): number {
  const exponent = Math.floor(Math.log10(span));
  const base = 10 ** exponent;
  const scaled = span / base;
  if (scaled <= 1) return base;
  if (scaled <= 2) return 2 * base;
  if (scaled <= 2.5) return 2.5 * base;
  if (scaled <= 5) return 5 * base;
  return 10 * base;
}

interface Scale {
  min: number;
  max: number;
  ticks: number[];
  decimals: number;
}

function buildScale(values: number[]): Scale {
  const dataMax = Math.max(...values);
  const dataMin = Math.min(...values);
  // 0 を含めないと、棒の長さも線の高さも「基準からどれだけ」を表さなくなる。
  const min = Math.min(0, dataMin);
  let max = Math.max(0, dataMax);
  // すべて同じ値でも割り算が壊れないようにする。
  if (max === min) max = min + 1;

  const step = niceStep((max - min) / 4);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = lo; value <= hi + step / 1000; value += step) ticks.push(value);
  const decimals = step < 1 ? Math.min(4, Math.ceil(-Math.log10(step))) : 0;
  return { min: lo, max: hi, ticks, decimals };
}

function formatTick(value: number, decimals: number): string {
  // 0 に負の符号を付けない。
  const fixed = value.toFixed(decimals);
  return fixed === `-${(0).toFixed(decimals)}` ? (0).toFixed(decimals) : fixed;
}

/** 横軸の文字は詰まると読めない。10 個あたりに間引く。 */
function labelStep(count: number): number {
  return Math.max(1, Math.ceil(count / 10));
}

interface TextOptions {
  anchor?: string;
  size?: number;
  className?: string;
  opacity?: number;
}

function text(x: number, y: number, value: string, options: TextOptions = {}): string {
  const anchor = options.anchor ?? 'middle';
  const size = options.size ?? 11;
  const className = options.className === undefined ? '' : ` class="${options.className}"`;
  const opacity = options.opacity === undefined ? '' : ` opacity="${options.opacity}"`;
  return `<text${className} x="${n(x)}" y="${n(y)}" text-anchor="${anchor}" font-size="${size}" fill="${ink}"${opacity}>${escapeText(value)}</text>`;
}

interface Frame {
  top: number;
  bottom: number;
  width: number;
  scale: Scale;
  parts: string[];
}

/** 値を縦位置へ。 */
function toY(value: number, frame: Pick<Frame, 'top' | 'bottom' | 'scale'>): number {
  const ratio = (value - frame.scale.min) / (frame.scale.max - frame.scale.min);
  return frame.bottom - ratio * (frame.bottom - frame.top);
}

/** 折れ線と棒で共通の枠（目盛り線・目盛りの数字）を敷く。 */
function buildFrame(data: ChartData, options: ChartSvgOptions, legend: boolean): Frame {
  const top = options.title ? 42 : 16;
  const bottom = H - (legend ? 52 : 32);
  const width = W - PAD_LEFT - PAD_RIGHT;
  const numbers = data.series.flatMap((series) =>
    series.values.filter((value): value is number => value !== null),
  );
  const scale = buildScale(numbers);
  const frame: Frame = { top, bottom, width, scale, parts: [] };

  for (const tick of scale.ticks) {
    const y = toY(tick, frame);
    frame.parts.push(
      `<line x1="${n(PAD_LEFT)}" y1="${n(y)}" x2="${n(W - PAD_RIGHT)}" y2="${n(y)}" stroke="${ink}" stroke-width="1" opacity="${tick === 0 ? 0.35 : 0.12}" />`,
    );
    frame.parts.push(
      text(PAD_LEFT - 8, y + 4, formatTick(tick, scale.decimals), { anchor: 'end', opacity: 0.7 }),
    );
  }

  return frame;
}

function xLabels(data: ChartData, frame: Frame, at: (index: number) => number): string[] {
  const step = labelStep(data.labels.length);
  const parts: string[] = [];
  for (let index = 0; index < data.labels.length; index += 1) {
    if (index % step !== 0) continue;
    parts.push(
      text(at(index), frame.bottom + 18, data.labels[index], {
        className: 'mdb-chart-x',
        opacity: 0.7,
      }),
    );
  }
  return parts;
}

function legendParts(names: string[]): string[] {
  const parts: string[] = [];
  // 中央に寄せて 1 行に並べる。文字幅は測れないので 1 文字ぶんを見込んで置く。
  const widths = names.map((name) => 22 + name.length * 12);
  const total = widths.reduce((sum, width) => sum + width, 0);
  let x = Math.max(PAD_LEFT, (W - total) / 2);
  const y = H - 16;
  for (let index = 0; index < names.length; index += 1) {
    parts.push(
      `<circle cx="${n(x + 5)}" cy="${n(y - 4)}" r="5" fill="${PALETTE[index % PALETTE.length]}" />`,
    );
    parts.push(text(x + 16, y, names[index], { anchor: 'start', opacity: 0.85 }));
    x += widths[index];
  }
  return parts;
}

function linePaths(data: ChartData, frame: Frame): string[] {
  const count = data.labels.length;
  const at = (index: number): number =>
    count <= 1 ? PAD_LEFT + frame.width / 2 : PAD_LEFT + (index / (count - 1)) * frame.width;
  const parts: string[] = [];

  data.series.forEach((series, order) => {
    let d = '';
    let pen = false;
    series.values.forEach((value, index) => {
      if (value === null) {
        // 空欄は「分からない」。線を引き継がずに切る。
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${n(at(index))} ${n(toY(value, frame))} `;
      pen = true;
    });
    parts.push(
      `<path d="${d.trim()}" fill="none" stroke="${PALETTE[order % PALETTE.length]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />`,
    );
  });

  parts.push(...xLabels(data, frame, at));
  return parts;
}

function barRects(data: ChartData, frame: Frame): string[] {
  const count = data.labels.length;
  const band = frame.width / Math.max(1, count);
  const slot = (band * 0.7) / data.series.length;
  const at = (index: number): number => PAD_LEFT + band * (index + 0.5);
  const zero = toY(0, frame);
  const parts: string[] = [];

  data.series.forEach((series, order) => {
    series.values.forEach((value, index) => {
      if (value === null) return;
      const y = toY(value, frame);
      const x = at(index) - (slot * data.series.length) / 2 + slot * order;
      parts.push(
        `<rect x="${n(x)}" y="${n(Math.min(y, zero))}" width="${n(Math.max(1, slot - 2))}" height="${n(Math.max(1, Math.abs(zero - y)))}" fill="${PALETTE[order % PALETTE.length]}" />`,
      );
    });
  });

  parts.push(...xLabels(data, frame, at));
  return parts;
}

function piePaths(data: ChartData, options: ChartSvgOptions): string[] {
  const values = data.series[0].values;
  // 内訳に「分からない」と負は置けない。飛ばして残りで 100% を作る。
  const slices = values
    .map((value, index) => ({ value: value ?? 0, label: data.labels[index] ?? '' }))
    .filter((slice) => slice.value > 0);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const cx = W / 2;
  const cy = (options.title ? 42 : 16) + 108;
  const r = 96;
  const parts: string[] = [];

  let angle = -Math.PI / 2;
  for (let order = 0; order < slices.length; order += 1) {
    const color = PALETTE[order % PALETTE.length];
    if (slices.length === 1) {
      // 1 つで一周するときは始点と終点が重なって弧が消える。半周ずつ描く。
      parts.push(
        `<path d="M${n(cx)} ${n(cy - r)} A${r} ${r} 0 1 1 ${n(cx)} ${n(cy + r)} A${r} ${r} 0 1 1 ${n(cx)} ${n(cy - r)} Z" fill="${color}" />`,
      );
      break;
    }
    const sweep = (slices[order].value / total) * Math.PI * 2;
    const x1 = cx + Math.cos(angle) * r;
    const y1 = cy + Math.sin(angle) * r;
    angle += sweep;
    const x2 = cx + Math.cos(angle) * r;
    const y2 = cy + Math.sin(angle) * r;
    parts.push(
      `<path d="M${n(cx)} ${n(cy)} L${n(x1)} ${n(y1)} A${r} ${r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${n(x2)} ${n(y2)} Z" fill="${color}" />`,
    );
  }

  parts.push(...legendParts(slices.map((slice) => slice.label)));
  return parts;
}

export function renderChartSvg(data: ChartData, options: ChartSvgOptions): string {
  ink = options.ink ?? DEFAULT_INK;
  const title = options.title ?? null;
  // 読み上げ用の名前。題名が無ければ、何を描いた図かを列の名前で言う。
  const label = title ?? data.series.map((series) => series.name).join('・');
  const parts: string[] = [];

  if (title !== null) {
    parts.push(text(W / 2, 26, title, { size: 14 }));
  }

  if (options.type === 'pie') {
    parts.push(...piePaths(data, options));
  } else {
    const legend = data.series.length > 1;
    const frame = buildFrame(data, options, legend);
    parts.push(...frame.parts);
    parts.push(...(options.type === 'bar' ? barRects(data, frame) : linePaths(data, frame)));
    if (legend) parts.push(...legendParts(data.series.map((series) => series.name)));
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${escapeText(label)}" font-family="-apple-system, 'Segoe UI', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', Meiryo, sans-serif">`,
    `<title>${escapeText(label)}</title>`,
    ...parts,
    '</svg>',
  ].join('');
}
