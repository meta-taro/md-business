/**
 * 編集 1 回にかかった時間を区間ごとに集めて要約する純ロジック。
 *
 * 検証シートは 1 セル確定するたびにファイル全文を組み直しており、どこで時間を
 * 使っているかが分からないと直す場所も決まらない。ここは数える側だけを持ち、
 * 計測そのもの（performance.now の呼び出し）はストアが担う。
 */

/**
 * 計測する区間。編集 1 回で順に走るものと、あとから走る保存。
 *
 * `parse` / `validate` / `layout` / `dirty` / `grid` は画面へ反映する途中で走るため、
 * `render` の中に含まれる（内訳であって、足し合わせる対象ではない）。
 *
 * `grid` は「表を **1 度** 組み直し終えるまで」。`render` との差は、そのあとに
 * 費やしている時間（反映の走り直し・表の外の作業）になる。
 */
export type SpanName =
  | 'serialize'
  | 'history'
  | 'parse'
  | 'validate'
  | 'layout'
  | 'dirty'
  | 'grid'
  | 'render'
  | 'save';

/** 区間の並び順。表示と報告テキストで同じ順にするため、ここで一度だけ決める。 */
export const SPAN_ORDER: readonly SpanName[] = [
  'serialize',
  'history',
  'parse',
  'validate',
  'layout',
  'dirty',
  'grid',
  'render',
  'save',
] as const;

/** 編集 1 回ぶんの計測結果。走らなかった区間は入らない。 */
export interface PerfSample {
  /** 記録した時刻（epoch ミリ秒）。 */
  at: number;
  /** 区間名 → ミリ秒。 */
  spans: Partial<Record<SpanName, number>>;
}

/**
 * 保持する記録の上限。長く使うほど増えるので古い側から捨てる。
 * 遡って傾向が見えれば足りるので 100 件。
 */
export const PERF_CAP = 100;

/**
 * 要約に使う直近件数。少なすぎると 1 回のぶれに振り回され、多すぎるとファイルが
 * 育つ前の値を引きずる。
 */
export const STATS_WINDOW = 20;

/**
 * 記録を 1 件足す。新しいものが先頭で、上限を超えたぶんは末尾（古い側）から落ちる。
 * 元の配列は書き換えない（rune の再描画を確実に起こすため）。
 */
export function appendSample(
  samples: readonly PerfSample[],
  sample: PerfSample,
  cap: number = PERF_CAP,
): PerfSample[] {
  return [sample, ...samples].slice(0, cap);
}

/** 1 区間の要約。 */
export interface SpanStats {
  name: SpanName;
  /** 最も新しい値。 */
  last: number;
  median: number;
  max: number;
  /** 要約に使った件数（窓の中に何件あったか）。 */
  count: number;
}

/** 昇順に並んだ値から中央値を出す。偶数件は中央 2 つの平均。 */
function medianOf(sorted: readonly number[]): number {
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  if (n % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/**
 * 区間ごとに直近 `window` 件を要約する。
 *
 * 窓は区間ごとに数える。保存は編集より桁違いに少ない回数しか走らないため、
 * 記録全体で窓を切ると保存の値が他の区間に押し出されて見えなくなる。
 */
export function summarize(
  samples: readonly PerfSample[],
  window: number = STATS_WINDOW,
): SpanStats[] {
  const stats: SpanStats[] = [];
  for (const name of SPAN_ORDER) {
    const values: number[] = [];
    for (const sample of samples) {
      const ms = sample.spans[name];
      if (ms === undefined) continue;
      values.push(ms);
      if (values.length >= window) break;
    }
    if (values.length === 0) continue;
    const sorted = [...values].sort((a, b) => a - b);
    stats.push({
      name,
      last: values[0] ?? 0,
      median: medianOf(sorted),
      max: sorted[sorted.length - 1] ?? 0,
      count: values.length,
    });
  }
  return stats;
}

/**
 * 編集 1 回ぶんの計測を溜める入れ物。
 *
 * 同期処理が終わったあとにも測りたい区間がある（差分判定は描画の最中に読まれる）。
 * 同期の終わりで締めてしまうとその区間が記録から丸ごと消えるため、「同期の終わり」と
 * 「1 件として締める」を別の操作にしてある。
 */
export class SpanCollector {
  /** いま足し先になっている編集。編集の外では null。 */
  private active: Partial<Record<SpanName, number>> | null = null;
  /** 同期処理を終えたか。次の編集が始まると false へ戻る。 */
  private syncEnded = false;

  /** 編集 1 回の計測を始める。前の編集が締まっていなければ捨てて取り直す。 */
  start(): void {
    this.active = {};
    this.syncEnded = false;
  }

  /**
   * 測った時間を足す。編集の外では捨てる（呼び出し側が計測の有無を気にしなくて
   * 済むようにする）。同じ区間が 1 回の編集で複数回走ることがあるため加算する。
   */
  add(name: SpanName, ms: number): void {
    if (this.active === null) return;
    this.active[name] = (this.active[name] ?? 0) + ms;
  }

  /**
   * 同期処理の終わりを告げ、溜めてきた入れ物を返す。返した入れ物は締めるまで
   * 足し先のままなので、描画中に測った区間も同じ 1 件へ入る。
   * 始まっていなければ null。
   */
  endSync(): Partial<Record<SpanName, number>> | null {
    if (this.active === null) return null;
    this.syncEnded = true;
    return this.active;
  }

  /**
   * 1 件として締める。描画を待つ間に次の編集が始まっていた場合は何もしない
   * （締めると新しい編集の記録が丸ごと落ちるため）。
   */
  close(): void {
    if (!this.syncEnded) return;
    this.active = null;
    this.syncEnded = false;
  }

  /** 集めかけを捨てる。 */
  reset(): void {
    this.active = null;
    this.syncEnded = false;
  }
}

/** 開いている文書の規模。遅さはここに比例するので、数字と一緒に持ち出す。 */
export interface DocScale {
  /** 本文の文字数。 */
  chars: number;
  rows: number;
  columns: number;
  /** 実際に DOM へ出ている行数。行を間引いているかどうかがここに出る。 */
  domRows: number;
  /** 履歴が保持している文字数の合計。 */
  historyChars: number;
}

/**
 * 測ったときに画面へ出ていたもの。
 *
 * 同じ数字でも、エディターが隣に出ているかどうかで意味が変わる（出ていなければ
 * エディター側の作業は起きていない）。報告を読む側が取り違えないよう一緒に持ち出す。
 */
export interface ViewState {
  /** 検証グリッドを出しているか。出していなければプレビュー側。 */
  grid: boolean;
  /** エディター（左ペイン）が画面に出ているか。全画面では出ない。 */
  editor: boolean;
}

/** 画面の状態を報告テキスト用の一言にする。 */
export function describeView(view: ViewState): string {
  const main = view.grid ? '検証グリッド' : 'プレビュー';
  return view.editor ? `${main} + エディター` : `${main}のみ（エディターは画面に無い）`;
}

/** 報告テキストに添える、計測結果以外の情報。 */
export interface ReportContext {
  version: string;
  platform: string;
  /** 開いているファイル名。開いていなければ null。 */
  fileName: string | null;
  scale: DocScale;
  view: ViewState;
}

/** ミリ秒を小数第 1 位までの文字列にする。 */
function ms(value: number): string {
  return value.toFixed(1);
}

/**
 * 不具合報告へそのまま貼れる 1 枚のテキストにする。
 *
 * 数字だけを渡されても、どれだけの規模のファイルで測ったのかが分からないと
 * 読む側は判断できない。版・環境・規模を必ず同じ紙に載せる。
 */
export function formatReport(ctx: ReportContext, stats: readonly SpanStats[]): string {
  const { scale } = ctx;
  const lines: string[] = [
    '## md-business 診断',
    '',
    `- 版: ${ctx.version}`,
    `- 環境: ${ctx.platform}`,
    `- ファイル: ${ctx.fileName ?? '(開いていません)'}`,
    `- 画面: ${describeView(ctx.view)}`,
    `- 規模: ${scale.chars} 文字 / ${scale.rows} 行 / ${scale.columns} 列`,
    `- DOM の行数: ${scale.domRows}`,
    `- 履歴が保持している文字数: ${scale.historyChars}`,
    '',
  ];
  if (stats.length === 0) {
    lines.push('計測された編集がありません。');
    return lines.join('\n');
  }
  lines.push('| 区間 | 直近 | 中央値 | 最大 | 件数 |', '|---|---|---|---|---|');
  for (const s of stats) {
    lines.push(`| ${s.name} | ${ms(s.last)} | ${ms(s.median)} | ${ms(s.max)} | ${s.count} |`);
  }
  lines.push('', '単位はミリ秒。');
  return lines.join('\n');
}
