/**
 * 本文の中からデータの指定（`data` の囲み）を拾い、読み取った表へ差し替える。
 *
 * 拾い方そのものは図（chart）や作図（mermaid）と共通なので `markdown/fencedBlocks` にある。
 * ここはその「データの指定を指す」名前だけを持つ。
 */
import { collectFencedBlocks, replaceFencedBlocks } from '../markdown/fencedBlocks';
import type { FencedBlock } from '../markdown/fencedBlocks';

export type DataBlock = FencedBlock;

export function collectDataBlocks(source: string): DataBlock[] {
  return collectFencedBlocks(source, 'data');
}

export function replaceDataBlocks(source: string, rendered: ReadonlyMap<string, string>): string {
  return replaceFencedBlocks(source, rendered);
}
