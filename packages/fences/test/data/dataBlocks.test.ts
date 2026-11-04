import { describe, expect, it } from 'vitest';
import { collectDataBlocks, replaceDataBlocks } from '../../src/data/dataBlocks.js';

describe('dataBlocks', () => {
  it('collects only data fences and replaces them in place', () => {
    const source = ['# 見出し', '', '```data', 'source: a.tsv', '```', '', '```chart', 'type: bar', '```', ''].join('\n');
    const blocks = collectDataBlocks(source);
    expect(blocks).toHaveLength(1);
    const raw = blocks[0]!.raw;
    const out = replaceDataBlocks(source, new Map([[raw, '| a |\n| --- |']]));
    expect(out).toContain('| a |');
    expect(out).not.toContain('source: a.tsv');
    expect(out).toContain('```chart');
  });
});
