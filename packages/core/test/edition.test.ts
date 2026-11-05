import { describe, it, expect } from 'vitest';
import { findInternalBlocks, stripInternalBlocks, findSubmissionLeaks } from '../src/index.js';

const DOC = [
  '# 概要',
  '',
  '公開してよい説明。',
  '',
  '::: 社内',
  '実装は app/Order.php L12 を参照。',
  ':::',
  '',
  '## 次の節',
].join('\n');

describe('findInternalBlocks', () => {
  it('finds a ::: 社内 block with its line range (0-based, inclusive)', () => {
    expect(findInternalBlocks(DOC)).toEqual([{ start: 4, end: 6, closed: true }]);
  });

  it('accepts ::: internal and surrounding spaces', () => {
    const src = ':::  internal  \nx\n:::  \n';
    expect(findInternalBlocks(src)).toEqual([{ start: 0, end: 2, closed: true }]);
  });

  it('ignores markers inside code fences', () => {
    const src = ['```md', '::: 社内', 'x', ':::', '```'].join('\n');
    expect(findInternalBlocks(src)).toEqual([]);
  });

  it('does not close on a ::: line inside a code fence within the block', () => {
    const src = ['::: 社内', '```md', ':::', '```', 'secret', ':::', 'public'].join('\n');
    expect(findInternalBlocks(src)).toEqual([{ start: 0, end: 5, closed: true }]);
  });

  it('runs an unclosed block to the end of the document', () => {
    const src = ['a', '::: 社内', 'b', 'c'].join('\n');
    expect(findInternalBlocks(src)).toEqual([{ start: 1, end: 3, closed: false }]);
  });

  it('does not treat other ::: labels as internal', () => {
    expect(findInternalBlocks('::: note\nx\n:::\n')).toEqual([]);
  });

  it('reads CRLF sources', () => {
    expect(findInternalBlocks(DOC.replace(/\n/g, '\r\n'))).toEqual([
      { start: 4, end: 6, closed: true },
    ]);
  });
});

describe('stripInternalBlocks', () => {
  it('removes the block including its markers', () => {
    const out = stripInternalBlocks(DOC);
    expect(out.text).not.toContain('社内');
    expect(out.text).not.toContain('Order.php');
    expect(out.text).toContain('公開してよい説明。');
    expect(out.text).toContain('## 次の節');
    expect(out.removed).toBe(1);
    expect(out.unclosed).toBe(false);
  });

  it('reports an unclosed block and strips to the end', () => {
    const out = stripInternalBlocks('a\n::: 社内\nsecret\n');
    expect(out.text).toBe('a\n');
    expect(out.unclosed).toBe(true);
  });

  it('returns the source unchanged when there is no block', () => {
    expect(stripInternalBlocks('a\nb').text).toBe('a\nb');
  });
});

describe('findSubmissionLeaks', () => {
  it('finds a source location outside internal blocks', () => {
    const leaks = findSubmissionLeaks('参照: src/order/Service.php L12 で計算する。');
    expect(leaks).toEqual([{ line: 0, kind: 'source-location', text: 'src/order/Service.php L12' }]);
  });

  it('finds file:line and file#L12 forms', () => {
    const kinds = findSubmissionLeaks('a.ts:40\nb.tsx#L7').map((l) => l.text);
    expect(kinds).toEqual(['a.ts:40', 'b.tsx#L7']);
  });

  it('finds commit hashes with both digits and letters', () => {
    const leaks = findSubmissionLeaks('修正は a8f7b79 と 3ca0261f9e で入った。');
    expect(leaks.map((l) => [l.kind, l.text])).toEqual([
      ['commit-hash', 'a8f7b79'],
      ['commit-hash', '3ca0261f9e'],
    ]);
  });

  it('does not flag numbers, dates, versions or short hex', () => {
    expect(
      findSubmissionLeaks('20261105 / 2026-11-05 / v0.34.0 / #2a4d7a / 1234567 / deadbeef'),
    ).toEqual([]);
  });

  it('skips lines inside internal blocks', () => {
    expect(findSubmissionLeaks(DOC)).toEqual([]);
  });

  it('reports line numbers of the original source', () => {
    const src = ['::: 社内', 'x.php L1', ':::', '', 'y.php L2'].join('\n');
    expect(findSubmissionLeaks(src)).toEqual([
      { line: 4, kind: 'source-location', text: 'y.php L2' },
    ]);
  });
});
