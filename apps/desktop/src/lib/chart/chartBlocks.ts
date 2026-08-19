/**
 * 本文の中から図の指定（`chart` の囲み）を拾い、描いたものへ差し替える。
 *
 * 拾い方そのものは作図（mermaid）と共通なので `markdown/fencedBlocks` に置いてある。
 * ここはその「図の指定を指す」名前だけを持つ。
 */
import { collectFencedBlocks, replaceFencedBlocks } from '../markdown/fencedBlocks';
import type { FencedBlock } from '../markdown/fencedBlocks';

export type ChartBlock = FencedBlock;

export function collectChartBlocks(source: string): ChartBlock[] {
  return collectFencedBlocks(source, 'chart');
}

export function replaceChartBlocks(source: string, rendered: ReadonlyMap<string, string>): string {
  return replaceFencedBlocks(source, rendered);
}
