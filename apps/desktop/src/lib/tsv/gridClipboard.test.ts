import { describe, it, expect } from 'vitest';
import type { ParsedHeader, TsvDocument } from '@md-business/schema-test-spec-tsv';
import { parseClipboardMatrix, applyPaste, rowToTsv } from './gridClipboard';

/**
 * スプレッドシート同様の「Excel / Sheets から矩形貼り付け」を支える純ロジック
 * （検証 UX が最大のポイントという要件）。DOM 非依存で単体検査する。
 */

function col(name: string): ParsedHeader {
  return { name, type: 'text', required: false } as ParsedHeader;
}

function doc(cols: number, rows: string[][]): TsvDocument {
  return {
    formatId: 'md-business:test-spec-tsv/v1',
    meta: {},
    directives: [],
    columns: Array.from({ length: cols }, (_, i) => col(`列${i + 1}`)),
    rows,
  } as TsvDocument;
}

describe('parseClipboardMatrix', () => {
  it('タブ区切り・改行区切りを行列へ', () => {
    expect(parseClipboardMatrix('a\tb\tc\n1\t2\t3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('CRLF / CR も行区切りとして扱う', () => {
    expect(parseClipboardMatrix('a\tb\r\n1\t2\r3\t4')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('Excel 由来の末尾改行 1 個は落とす', () => {
    expect(parseClipboardMatrix('a\tb\n')).toEqual([['a', 'b']]);
  });

  it('空文字は空行列', () => {
    expect(parseClipboardMatrix('')).toEqual([]);
  });

  it('単一セルはそのまま 1x1', () => {
    expect(parseClipboardMatrix('合格')).toEqual([['合格']]);
  });
});

describe('applyPaste', () => {
  it('アンカーを起点に矩形を書き込む（不変・新ドキュメント）', () => {
    const before = doc(3, [
      ['', '', ''],
      ['', '', ''],
    ]);
    const after = applyPaste(before, { row: 0, col: 1 }, 'x\ty\na\tb');
    expect(after.rows).toEqual([
      ['', 'x', 'y'],
      ['', 'a', 'b'],
    ]);
    expect(before.rows[0]).toEqual(['', '', '']); // 元は不変
  });

  it('行が足りなければ空行を追加して伸ばす（行＝データは可変）', () => {
    const before = doc(2, [['先頭', '']]);
    const after = applyPaste(before, { row: 0, col: 0 }, '1\ta\n2\tb\n3\tc');
    expect(after.rows).toEqual([
      ['1', 'a'],
      ['2', 'b'],
      ['3', 'c'],
    ]);
  });

  it('列はスキーマ固定＝右へ溢れた分は切り捨てる', () => {
    const before = doc(2, [['', '']]);
    const after = applyPaste(before, { row: 0, col: 1 }, 'keep\tdrop\tdrop2');
    expect(after.rows).toEqual([['', 'keep']]);
  });

  it('短い既存行はアンカー列までパディングして書く', () => {
    const before = doc(3, [['a']]); // 末尾セル省略の短い行
    const after = applyPaste(before, { row: 0, col: 2 }, 'z');
    expect(after.rows).toEqual([['a', '', 'z']]);
  });

  it('空クリップボードは元ドキュメントをそのまま返す', () => {
    const before = doc(2, [['a', 'b']]);
    expect(applyPaste(before, { row: 0, col: 0 }, '')).toBe(before);
  });

  it('列が無い / アンカーが列範囲外なら変更しない', () => {
    const before = doc(2, [['a', 'b']]);
    expect(applyPaste(before, { row: 0, col: 2 }, 'x')).toBe(before);
  });
});

describe('rowToTsv', () => {
  it('行をタブ区切りへ直列化', () => {
    expect(rowToTsv(doc(3, [['a', 'b', 'c']]), 0)).toBe('a\tb\tc');
  });

  it('短い行は列数までパディング（末尾空セルも位置として残す）', () => {
    expect(rowToTsv(doc(3, [['a']]), 0)).toBe('a\t\t');
  });

  it('範囲外は空文字', () => {
    expect(rowToTsv(doc(2, [['a', 'b']]), 9)).toBe('');
  });

  it('applyPaste で往復できる（コピー→貼り付け）', () => {
    const src = doc(2, [['合格', '2026-07-23']]);
    const tsv = rowToTsv(src, 0);
    const dest = applyPaste(doc(2, [['', '']]), { row: 0, col: 0 }, tsv);
    expect(dest.rows[0]).toEqual(['合格', '2026-07-23']);
  });
});
