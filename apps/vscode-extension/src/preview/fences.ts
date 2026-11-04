/**
 * 図（`chart` の囲み）とデータ（`data` の囲み）を、描いた画像と表へ替えてから webview へ渡す。
 *
 * 拾い方・描き方はデスクトップアプリと同じパッケージを使う。経路を分けると、同じ文書が
 * アプリと VS Code で違う絵になる。表の読み取りは外から受ける（拡張ホストのファイル読み取り）。
 * webview は生の HTML を通さないので、表に中身を添える囲みは付けない。
 */
import {
  describeChartProblem,
  describeDataProblem,
  loadCharts,
  loadDataBlocks,
  replaceChartBlocks,
  replaceDataBlocks,
} from '@md-business/fences';

export interface ComposeFencesOptions {
  /** 開いている文書（フォルダの起点からの相対）。フォルダの外なら null。 */
  docPath: string | null;
  /** フォルダの起点からの相対パスを文字として読む。 */
  read: (path: string) => Promise<string>;
}

export async function composeFences(text: string, options: ComposeFencesOptions): Promise<string> {
  const charts = await loadCharts(text, {
    docPath: options.docPath,
    read: options.read,
    describe: describeChartProblem,
  });
  const withCharts = charts.size === 0 ? text : replaceChartBlocks(text, charts);
  const data = await loadDataBlocks(withCharts, {
    docPath: options.docPath,
    read: options.read,
    describe: describeDataProblem,
  });
  return data.size === 0 ? withCharts : replaceDataBlocks(withCharts, data);
}
