/**
 * 図・データの囲みを描けなかった理由を、日本語の 1 文にする。
 *
 * 訳語を自前で持つアプリ（デスクトップ）はそちらを使う。訳語を持たない Chrome 拡張と
 * VS Code 拡張はこれを渡す。文言はデスクトップの日本語と同じにしてあり、どのアプリで
 * 開いても同じ断りが出る。
 */
import type { ChartLoadKind, ChartLoadProblem } from './chart/loadCharts.js';
import type { DataLoadKind, DataLoadProblem } from './data/loadData.js';

const CHART_DETAIL: Record<ChartLoadKind, string> = {
  empty: '指定が空です。type / source / x / y を書いてください。',
  syntax: '`名前: 値` の形になっていません（{raw}）。',
  'unknown-key': '知らない指定です（{raw}）。',
  'duplicate-key': '同じ指定が 2 度書かれています（{raw}）。',
  missing: '指定が足りません（{raw}）。',
  'bad-type': '扱えない種類です（{raw}）。line / bar / pie のどれかを書いてください。',
  'no-column': '表にその列がありません（{raw}）。',
  'no-rows': '表に行がありません。',
  'no-numbers': 'その列に数として読める値がありません（{raw}）。',
  'bad-path': '開いているフォルダの中にありません（{raw}）。',
  'read-failed': '表を読めません（{raw}）。',
  'unreadable-cells': '数として読めないセルが {raw} 個ありました。その分は図では空けてあります。',
};

const DATA_DETAIL: Record<DataLoadKind, string> = {
  empty: '囲みが空です。source に表の場所を書いてください。',
  syntax: 'この行が `名前: 値` の形になっていません（{raw}）。',
  'unknown-key': '知らない指定です（{raw}）。',
  'duplicate-key': '同じ指定が 2 度書かれています（{raw}）。',
  missing: '指定が足りません（{raw}）。',
  'bad-path': '開いているフォルダの中にありません（{raw}）。',
  'read-failed': '表を読めません（{raw}）。',
  'no-rows': '表に行がありません。',
};

function located(detail: string, line: number | null): string {
  return line === null ? detail : `${line} 行目: ${detail}`;
}

export function describeChartProblem(problem: ChartLoadProblem): string {
  const detail = CHART_DETAIL[problem.kind].replace('{raw}', problem.raw);
  // 描けたうえでの断りは「描けません」で始めない。事実が違う。
  if (problem.kind === 'unreadable-cells') return detail;
  return `図を描けません。${located(detail, problem.line)}`;
}

export function describeDataProblem(problem: DataLoadProblem): string {
  const detail = DATA_DETAIL[problem.kind].replace('{raw}', problem.raw);
  return `データを表にできません。${located(detail, problem.line)}`;
}
