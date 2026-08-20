import { describe, expect, it } from 'vitest';
import { buildBatch, MAX_BATCH_ITEMS, readBatchSpec } from './batchPlan';

const TABLE = '型番\t品名\t価格\nA-1\t春の新商品\t1200\nA-2\t夏の新商品\t980\n';

function doc(front: string, body = '# {{品名}}\n\n価格 {{価格}} 円\n'): string {
  return `---\n${front}\n---\n\n${body}`;
}

const DECLARED = doc('title: 告知\nbatch:\n  source: ./items.tsv\n  name: "{{型番}}"');

describe('一括の指定を読む', () => {
  it('差し込む表と出す名前を返す', () => {
    const read = readBatchSpec(DECLARED);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.spec.source).toBe('./items.tsv');
    expect(read.spec.name).toBe('{{型番}}');
  });

  it('指定が無ければ無いと返す', () => {
    const read = readBatchSpec(doc('title: 告知'));
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.problem.kind).toBe('not-declared');
  });

  it('frontmatter が無くても落ちない', () => {
    expect(readBatchSpec('# ただの本文').ok).toBe(false);
  });

  it('表の指定が欠けていれば理由を言う', () => {
    const read = readBatchSpec(doc('batch:\n  name: "{{型番}}"'));
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.problem.kind).toBe('bad-declaration');
    expect(read.problem.raw).toContain('source');
  });

  it('名前の指定が欠けていれば理由を言う', () => {
    const read = readBatchSpec(doc('batch:\n  source: ./items.tsv'));
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.problem.raw).toContain('name');
  });
});

describe('表を差し込んで枚数分に広げる', () => {
  const spec = { source: './items.tsv', name: '{{型番}}' };

  it('1 行が 1 枚になる', () => {
    const built = buildBatch(DECLARED, spec, TABLE);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.items).toHaveLength(2);
    expect(built.items[0]?.name).toBe('A-1');
    expect(built.items[0]?.source).toContain('# 春の新商品');
    expect(built.items[0]?.source).toContain('価格 1200 円');
    expect(built.items[1]?.source).toContain('# 夏の新商品');
  });

  it('差し込んだ跡を残さない', () => {
    const built = buildBatch(DECLARED, spec, TABLE);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.items[0]?.source).not.toContain('{{');
  });

  it('空欄はそのまま空で入る', () => {
    const built = buildBatch(DECLARED, spec, '型番\t品名\t価格\nA-1\t\t1200\n');
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.items[0]?.source).toContain('# \n');
  });

  it('表に無い列を差し込もうとしたら断る', () => {
    const built = buildBatch(doc('batch:\n  source: ./a.tsv\n  name: "{{型番}}"', '{{在庫}}'), spec, TABLE);
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.problem.kind).toBe('no-column');
    expect(built.problem.raw).toBe('在庫');
  });

  it('中身の行が無ければ断る', () => {
    const built = buildBatch(DECLARED, spec, '型番\t品名\t価格\n');
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.problem.kind).toBe('no-rows');
  });

  it('名前が空になる行があれば断る', () => {
    const built = buildBatch(DECLARED, spec, '型番\t品名\t価格\n\t春\t1200\n');
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.problem.kind).toBe('empty-name');
    // 何行目かが分からないと直せない。
    expect(built.problem.raw).toContain('1');
  });

  it('同じ名前が 2 つできるなら撮る前に断る', () => {
    const built = buildBatch(DECLARED, spec, '型番\t品名\t価格\nA-1\t春\t1\nA-1\t夏\t2\n');
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.problem.kind).toBe('duplicate-name');
    expect(built.problem.raw).toContain('A-1');
  });

  it('多すぎる行数は断る', () => {
    const rows = Array.from({ length: MAX_BATCH_ITEMS + 1 }, (_, i) => `A-${i}\t品\t1`).join('\n');
    const built = buildBatch(DECLARED, spec, `型番\t品名\t価格\n${rows}\n`);
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.problem.kind).toBe('too-many');
  });
});
