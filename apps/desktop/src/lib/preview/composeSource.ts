/**
 * 書き出す本文を仕上げる（画像を埋め、図を描き、表を差し込む）。
 *
 * プレビューは打鍵のたびに組み直すので、画像も図も「読めたものから順に反映する」形で
 * 持っている（`+page.svelte`）。書き出しは 1 回きりなので、そちらの状態を待たずに
 * ここで読み切る。
 *
 * 仕上げをここ 1 か所に置く理由は、書き出し口が 3 つ（HTML・画像・サイト）あるため。
 * 口ごとに手順を写すと、片方だけ足し忘れて「画面には出るのに書き出すと消える」が起きる
 * （実際、画像の書き出しでは本文の画像が入っていなかった）。
 *
 * 読み取りは外から受ける。Tauri を呼ばないので素のまま試験できる。
 */
import { inlineImages } from '../image/inlineImages';
import { loadInlineImages } from '../image/loadInlineImages';
import { replaceChartBlocks } from '../chart/chartBlocks';
import { loadCharts } from '../chart/loadCharts';
import type { ChartLoadProblem } from '../chart/loadCharts';
import { replaceDataBlocks } from '../dataBlock/dataBlocks';
import { loadDataBlocks } from '../dataBlock/loadData';
import type { DataLoadProblem } from '../dataBlock/loadData';
import { loadMermaidImages } from './mermaidBlocks';
import type { LoadMermaidOptions } from './mermaidBlocks';
import { replaceFencedBlocks } from '../markdown/fencedBlocks';

export interface ComposeSourceIo {
  /** 表など、文字として読む。 */
  readText: (relPath: string) => Promise<string>;
  /**
   * 画像を data URL で読む。渡さなければ本文の画像には触らない
   * （サイトの書き出しは画像をファイルとして運ぶので、埋め込むと二重になる）。
   */
  readImage?: (relPath: string) => Promise<string>;
}

export interface ComposeSourceOptions {
  /** 開いている文書（フォルダの起点からの相対）。 */
  docPath: string;
  io: ComposeSourceIo;
  /** 図を描けなかった理由を 1 文にする。 */
  describe: (problem: ChartLoadProblem) => string;
  /** 表にできなかった理由を 1 文にする。 */
  describeData: (problem: DataLoadProblem) => string;
  /** 生の HTML がそのまま通る組み立てか。表に中身をそのまま渡す囲みを添えるかが変わる。 */
  rawHtml?: boolean;
  /** 図の文字色。 */
  ink?: string;
  /** 作図（mermaid）の描画。渡さなければ囲みのまま残る。 */
  mermaid?: LoadMermaidOptions;
}

export async function composeExportSource(
  source: string,
  options: ComposeSourceOptions,
): Promise<string> {
  // 画像を先に埋める。図は data URL の画像になるので、順を逆にすると埋め直しの対象を
  // 増やすだけになる（scheme 付きは元から対象外なので結果は変わらない）。
  const readImage = options.io.readImage;
  let withImages = source;
  if (readImage !== undefined) {
    const { urls } = await loadInlineImages(source, options.docPath, readImage);
    withImages = inlineImages(source, urls);
  }

  const charts = await loadCharts(withImages, {
    docPath: options.docPath,
    read: options.io.readText,
    describe: options.describe,
    ink: options.ink,
  });
  const withCharts = replaceChartBlocks(withImages, charts);

  const data = await loadDataBlocks(withCharts, {
    docPath: options.docPath,
    read: options.io.readText,
    describe: options.describeData,
    rawHtml: options.rawHtml,
  });
  const withData = replaceDataBlocks(withCharts, data);

  if (options.mermaid === undefined) return withData;
  return replaceFencedBlocks(withData, await loadMermaidImages(withData, options.mermaid));
}
