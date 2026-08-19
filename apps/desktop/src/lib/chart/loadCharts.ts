/**
 * 本文の図の指定を読み、描いたものへ差し替える形を作る。
 *
 * 差し替え先は **画像の記法**（`![…](data:image/svg+xml;base64,…)`）。本文の
 * Markdown → HTML の経路は生の HTML を落とすので（`renderMarkdownToHtml` の
 * `allowDangerousHtml: false`）、`<svg>` をそのまま本文へ置くと消える。画像なら
 * 既存の無害化がそのまま通し、画面・PDF・書き出しのどれも同じ絵になる。
 *
 * 描けなかったときは**黙って空にしない**。理由を図の位置に出し、書いた指定もそのまま残す
 * （何を書いたのかが本人にも分からなくなるため）。文言はここでは決めず、呼ぶ側の
 * 訳語に任せる（`describe`）。純粋なまま置いておきたいので、読み取りも外から渡す。
 */
import { resolveRelPath } from '../workspace/relPath';
import { collectChartBlocks } from './chartBlocks';
import { buildChartData, parseDataTable } from './chartData';
import type { ChartDataProblemKind } from './chartData';
import { parseChartSpec } from './chartSpec';
import type { ChartProblemKind } from './chartSpec';
import { renderChartSvg } from './chartSvg';

export type ChartLoadKind =
  | ChartProblemKind
  | ChartDataProblemKind
  /** 開いているフォルダの外を指している / 文書の置き場が分からない。 */
  | 'bad-path'
  /** 指した表を読めなかった。 */
  | 'read-failed'
  /** 描けたが、数として読めないセルがあった。 */
  | 'unreadable-cells';

export interface ChartLoadProblem {
  kind: ChartLoadKind;
  /** 問題のもとになった文字列（鍵の名前・列の名前・指した場所など）。 */
  raw: string;
  /** 指定の中の行番号。分からなければ null。 */
  line: number | null;
}

export interface LoadChartsOptions {
  /** 開いている文書（フォルダの起点からの相対）。分からなければ null。 */
  docPath: string | null;
  /** 表の読み取り。フォルダの起点からの相対パスを受ける。 */
  read: (path: string) => Promise<string>;
  /** 問題を 1 文にする。 */
  describe: (problem: ChartLoadProblem) => string;
  /** 軸・目盛り・文字の色。 */
  ink?: string;
}

/** 画像の説明に括弧が入ると記法が閉じてしまう。落として渡す。 */
function toAlt(value: string): string {
  return value.replace(/[[\]()]/g, ' ').replace(/\s+/g, ' ').trim();
}

function toDataUri(svg: string): string {
  const bytes = new TextEncoder().encode(svg);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

/** 理由は引用として出す。改行が入ると引用が切れるので 1 行に畳む。 */
function note(reason: string): string {
  return `> ${reason.replace(/\s*\n\s*/g, ' ')}`;
}

function failure(reason: string, raw: string): string {
  return `${note(reason)}\n\n${raw}`;
}

export async function loadCharts(
  source: string,
  options: LoadChartsOptions,
): Promise<Map<string, string>> {
  const blocks = collectChartBlocks(source);
  const out = new Map<string, string>();
  if (blocks.length === 0) return out;

  // 同じ表を指す図が並ぶことがある。読むのは 1 度でよい。
  const tables = new Map<string, Promise<string>>();
  const readOnce = (path: string): Promise<string> => {
    const found = tables.get(path);
    if (found !== undefined) return found;
    const started = options.read(path);
    tables.set(path, started);
    return started;
  };

  for (const block of blocks) {
    const parsed = parseChartSpec(block.body);
    if (!parsed.ok) {
      out.set(block.raw, failure(options.describe(parsed.problem), block.raw));
      continue;
    }

    const spec = parsed.spec;
    const path = resolveRelPath(options.docPath, spec.source);
    if (path === null) {
      out.set(
        block.raw,
        failure(options.describe({ kind: 'bad-path', raw: spec.source, line: null }), block.raw),
      );
      continue;
    }

    let text: string;
    try {
      text = await readOnce(path);
    } catch {
      out.set(
        block.raw,
        failure(options.describe({ kind: 'read-failed', raw: spec.source, line: null }), block.raw),
      );
      continue;
    }

    const built = buildChartData(parseDataTable(text), { x: spec.x, y: spec.y });
    if (!built.ok) {
      out.set(
        block.raw,
        failure(
          options.describe({ kind: built.problem.kind, raw: built.problem.raw, line: null }),
          block.raw,
        ),
      );
      continue;
    }

    const svg = renderChartSvg(built.data, {
      type: spec.type,
      title: spec.title,
      ink: options.ink,
    });
    const alt = toAlt(spec.title ?? built.data.series.map((series) => series.name).join(' '));
    const image = `![${alt}](${toDataUri(svg)})`;
    // 読めなかったセルは飛ばして描いてある。飛ばしたことを言わないと、
    // 欠けた図が「そういう数字」に見える。
    const skipped =
      built.data.unreadable === 0
        ? ''
        : `\n\n${note(
            options.describe({
              kind: 'unreadable-cells',
              raw: String(built.data.unreadable),
              line: null,
            }),
          )}`;
    out.set(block.raw, `${image}${skipped}`);
  }

  return out;
}
