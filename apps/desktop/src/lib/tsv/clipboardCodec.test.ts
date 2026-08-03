import { describe, it, expect } from 'vitest';
import { encodeClipboardCell, serializeClipboardMatrix, parseClipboardMatrix } from './clipboardCodec';

/**
 * クリップボードの符号化。
 * セルの中の改行・タブが、行区切り・列区切りと混ざらないことを検査する。
 * 混ざると、改行を含むセル 1 個が貼り付け先で 2 行に割れる。
 */

describe('encodeClipboardCell', () => {
  it('区切りにも引用符にもならない値はそのまま出す', () => {
    expect(encodeClipboardCell('前後見出し')).toBe('前後見出し');
    expect(encodeClipboardCell('')).toBe('');
  });

  it('改行を含む値は囲む', () => {
    expect(encodeClipboardCell('・前後見出し\n・協力会社名')).toBe('"・前後見出し\n・協力会社名"');
  });

  it('タブを含む値は囲む', () => {
    expect(encodeClipboardCell('前\t後')).toBe('"前\t後"');
  });

  it('引用符を含む値は囲み、中の引用符を二重にする', () => {
    expect(encodeClipboardCell('区分「4分割」の"前後"')).toBe('"区分「4分割」の""前後"""');
  });

  it('CR だけの改行も囲む', () => {
    expect(encodeClipboardCell('前\r後')).toBe('"前\r後"');
  });
});

describe('parseClipboardMatrix', () => {
  it('空文字は空の矩形', () => {
    expect(parseClipboardMatrix('')).toEqual([]);
  });

  it('ふつうの矩形をそのまま読む', () => {
    expect(parseClipboardMatrix('a1\tb1\na2\tb2')).toEqual([
      ['a1', 'b1'],
      ['a2', 'b2'],
    ]);
  });

  it('囲まれたセルの中の改行を行区切りにしない', () => {
    expect(parseClipboardMatrix('"・前後見出し\n・協力会社名"\t確認')).toEqual([
      ['・前後見出し\n・協力会社名', '確認'],
    ]);
  });

  it('囲まれたセルの中のタブを列区切りにしない', () => {
    expect(parseClipboardMatrix('"前\t後"\t確認')).toEqual([['前\t後', '確認']]);
  });

  it('二重の引用符を 1 個へ戻す', () => {
    expect(parseClipboardMatrix('"区分の""前後"""')).toEqual([['区分の"前後"']]);
  });

  it('セルの途中にある引用符は囲みとみなさない', () => {
    expect(parseClipboardMatrix('15"モニタ\t確認')).toEqual([['15"モニタ', '確認']]);
  });

  it('末尾の改行は空行を作らない', () => {
    expect(parseClipboardMatrix('a1\tb1\n')).toEqual([['a1', 'b1']]);
  });

  it('CRLF を行区切りとして読む', () => {
    expect(parseClipboardMatrix('a1\tb1\r\na2\tb2')).toEqual([
      ['a1', 'b1'],
      ['a2', 'b2'],
    ]);
  });

  it('囲まれたセルの中の CRLF はそのまま値に残す', () => {
    expect(parseClipboardMatrix('"前\r\n後"')).toEqual([['前\r\n後']]);
  });

  it('空セルの位置を保つ', () => {
    expect(parseClipboardMatrix('a\t\tc')).toEqual([['a', '', 'c']]);
  });
});

describe('往復', () => {
  it('改行を含むセルを含む矩形が、往復しても割れない', () => {
    const matrix = [
      ['24', '・前後見出し・区切り列およびフッタが前後統合\n・協力会社名・点検者が1つに統合表示されること'],
      ['25', '・AM/PMの前後見出し\n・協力会社名・点検者が統合表示されること'],
    ];
    expect(parseClipboardMatrix(serializeClipboardMatrix(matrix))).toEqual(matrix);
  });

  it('引用符・タブ・改行が同居しても往復する', () => {
    const matrix = [['前\t後', '区分の"前後"\n2 行目']];
    expect(parseClipboardMatrix(serializeClipboardMatrix(matrix))).toEqual(matrix);
  });

  it('特殊文字が無い矩形は囲みが付かない（Excel と同じ見た目を保つ）', () => {
    expect(
      serializeClipboardMatrix([
        ['a1', 'b1'],
        ['a2', 'b2'],
      ]),
    ).toBe('a1\tb1\na2\tb2');
  });
});
