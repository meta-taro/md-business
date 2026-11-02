/**
 * 図（`chart`）・データ（`data`）・構成図（`zumen`）の囲みを、描いた画像と表へ替える。
 *
 * 拾い方・描き方はデスクトップアプリ・VS Code 拡張と同じパッケージを使う。経路を分けると、
 * 同じ文書がアプリごとに違う絵になる。
 *
 * この閲覧画面は開いた 1 枚の中身しか受け取らないので、図とデータが指す隣のファイルは読めない。
 * 囲みを生のまま見せると「壊れている」のか「この画面では読めない」のか区別が付かないので、
 * 読めない理由をその位置に出す。構成図は中身が本文に書いてあるので、ここでも描ける。
 */
import {
  describeChartProblem,
  describeDataProblem,
  loadCharts,
  loadDataBlocks,
  loadZumenImages,
  replaceChartBlocks,
  replaceDataBlocks,
  replaceFencedBlocks,
} from '@md-business/fences';
import type { ChartLoadProblem, DataLoadProblem, ZumenTheme } from '@md-business/fences';

export type DrawZumen = (source: string, options: { theme: ZumenTheme }) => Promise<string>;

/** 描き手は重いので、構成図の囲みがあるときだけ読み込む。 */
export const drawZumen: DrawZumen = async (source, options) => {
  const { toSvg } = await import('@metataro/zumen');
  return toSvg(source, options);
};

// 相対パスの起点。実在のフォルダではなく、`../` で外へ出る指定を見分けるためだけに置く。
const DOC_PATH = 'document.md';

const NO_SIBLINGS = 'Chrome 拡張では隣のファイルを読めません（{raw}）。デスクトップアプリか VS Code 拡張で開くと描けます。';

function cannotRead(kind: string): boolean {
  return kind === 'read-failed' || kind === 'bad-path';
}

function describeChart(problem: ChartLoadProblem): string {
  if (!cannotRead(problem.kind)) return describeChartProblem(problem);
  return `図を描けません。${NO_SIBLINGS.replace('{raw}', problem.raw)}`;
}

function describeData(problem: DataLoadProblem): string {
  if (!cannotRead(problem.kind)) return describeDataProblem(problem);
  return `データを表にできません。${NO_SIBLINGS.replace('{raw}', problem.raw)}`;
}

const readNothing = (): Promise<string> => Promise.reject(new Error('no folder'));

export async function composeFences(text: string, draw: DrawZumen = drawZumen): Promise<string> {
  const charts = await loadCharts(text, { docPath: DOC_PATH, read: readNothing, describe: describeChart });
  const withCharts = charts.size === 0 ? text : replaceChartBlocks(text, charts);
  const data = await loadDataBlocks(withCharts, { docPath: DOC_PATH, read: readNothing, describe: describeData });
  const withData = data.size === 0 ? withCharts : replaceDataBlocks(withCharts, data);
  // 閲覧画面の紙は白いので、図も明るい配色で描く。
  const zumen = await loadZumenImages(withData, {
    theme: 'light',
    render: (source, theme) => draw(source, { theme }),
    describe: (message) => `構成図を描けません。${message}`,
  });
  return zumen.size === 0 ? withData : replaceFencedBlocks(withData, zumen);
}
