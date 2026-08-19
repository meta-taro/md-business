// 図を描けなかった理由を、読み手の言語の 1 文にする。
//
// 図の読み取り側（`loadCharts`）は種類（kind）と、もとになった文字列・行番号だけを返す。
// 文言はアプリが持つ——という分担なので、その文言側がここ（`frontmatterMessage` と同じ置き方）。
import type { ChartLoadKind, ChartLoadProblem } from './loadCharts';
import type { MessageKey } from '../i18n/messages';
import type { Translate } from '../preview/frontmatterMessage';

/** 描けない理由 → 説明文のキー。種類が増えたら型検査でここが赤くなる。 */
export const CHART_MESSAGE_KEYS: Record<ChartLoadKind, MessageKey> = {
  empty: 'chart.empty',
  syntax: 'chart.syntax',
  'unknown-key': 'chart.unknownKey',
  'duplicate-key': 'chart.duplicateKey',
  missing: 'chart.missing',
  'bad-type': 'chart.badType',
  'no-column': 'chart.noColumn',
  'no-rows': 'chart.noRows',
  'no-numbers': 'chart.noNumbers',
  'bad-path': 'chart.badPath',
  'read-failed': 'chart.readFailed',
  'unreadable-cells': 'chart.unreadableCells',
};

export function chartMessage(problem: ChartLoadProblem, t: Translate): string {
  const detail = t(CHART_MESSAGE_KEYS[problem.kind], { raw: problem.raw });
  // 描けたうえでの断りは「描けません」で始めない。事実が違う。
  if (problem.kind === 'unreadable-cells') return detail;
  const located = problem.line === null ? detail : t('chart.atLine', { line: problem.line, detail });
  return t('chart.failed', { detail: located });
}
