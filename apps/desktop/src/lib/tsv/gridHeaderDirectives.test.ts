import { describe, it, expect } from 'vitest';
import {
  readNotes,
  writeNotes,
  readGroups,
  groupCells,
  writeGroups,
  applyNoteEdit,
  removeNoteAt,
} from './gridHeaderDirectives';

/**
 * 検証グリッドの表ヘッダ拡張（Issue 010・田中さん 2026-07-23「表の上に補足」
 * 「ヘッダを肉厚に（大分類→項目/手順/結果）」）。
 *
 * 補足行を `#@ note <text>`、肉厚グループを `#@ group <start>[-<end>] <label>` ディレクティブへ
 * 載せ、既存パーサ（`doc.directives` を round-trip）へそのまま焼く。ここは純ロジックのみ検査。
 */

describe('readNotes', () => {
  it('note 行を記載順に返す', () => {
    expect(readNotes(['note ※この表は受注検証用', 'note 2 行目の補足'])).toEqual([
      '※この表は受注検証用',
      '2 行目の補足',
    ]);
  });

  it('note 以外・空 note は無視する', () => {
    expect(
      readNotes(['style 結果 〇=#e6f4ea', 'colwidth 0=200', 'note', 'note 有効な補足']),
    ).toEqual(['有効な補足']);
  });

  it('note が無ければ空配列', () => {
    expect(readNotes([])).toEqual([]);
  });
});

describe('writeNotes', () => {
  it('補足行を末尾へ付け直す（note 以外は先頭に温存）', () => {
    const result = writeNotes(['colwidth 0=200', 'style X 1=#fff'], ['一行目', '二行目']);
    expect(result).toEqual(['colwidth 0=200', 'style X 1=#fff', 'note 一行目', 'note 二行目']);
  });

  it('既存の note 行は置き換える（重複しない）', () => {
    const result = writeNotes(['note 旧', 'colwidth 0=200'], ['新']);
    expect(result).toEqual(['colwidth 0=200', 'note 新']);
  });

  it('空文字の補足は書き出さない', () => {
    expect(writeNotes([], ['', '有効', ''])).toEqual(['note 有効']);
  });

  it('read(write(notes)) は補足を復元する（round-trip）', () => {
    const notes = ['※検証用', '担当: QA'];
    expect(readNotes(writeNotes(['style keep'], notes))).toEqual(notes);
  });
});

describe('readGroups', () => {
  it('range と単一列をパースする', () => {
    expect(readGroups(['group 0-2 大分類', 'group 3 結果'])).toEqual([
      { start: 0, end: 2, label: '大分類' },
      { start: 3, end: 3, label: '結果' },
    ]);
  });

  it('ラベル内の空白は保持し、group 以外は無視', () => {
    expect(readGroups(['note x', 'group 0-1 受注 情報'])).toEqual([
      { start: 0, end: 1, label: '受注 情報' },
    ]);
  });

  it('不正（ラベル無し・end<start・非数）は捨てる', () => {
    expect(readGroups(['group 0-2', 'group 3-1 逆順', 'group x 非数'])).toEqual([]);
  });
});

describe('groupCells', () => {
  it('隙間を空ラベルセルで埋めて全列を覆う', () => {
    expect(groupCells([{ start: 1, end: 2, label: 'A' }], 4)).toEqual([
      { label: '', start: 0, span: 1 },
      { label: 'A', start: 1, span: 2 },
      { label: '', start: 3, span: 1 },
    ]);
  });

  it('範囲外は列数でクランプする', () => {
    expect(groupCells([{ start: 0, end: 9, label: 'All' }], 3)).toEqual([
      { label: 'All', start: 0, span: 3 },
    ]);
  });

  it('重なりは先勝ちで後をスキップ', () => {
    expect(
      groupCells(
        [
          { start: 0, end: 1, label: 'X' },
          { start: 1, end: 2, label: 'Y' },
        ],
        3,
      ),
    ).toEqual([
      { label: 'X', start: 0, span: 2 },
      { label: '', start: 2, span: 1 },
    ]);
  });

  it('妥当なグループが無ければ空（グループ行を出さない）', () => {
    expect(groupCells([], 3)).toEqual([]);
    expect(groupCells([{ start: 5, end: 6, label: '範囲外' }], 3)).toEqual([]);
  });
});

describe('applyNoteEdit', () => {
  it('既存 index のテキストを差し替える', () => {
    expect(applyNoteEdit(['a', 'b'], 1, 'B')).toEqual(['a', 'B']);
  });

  it('末尾 index（= 長さ）は新規追加として末尾へ足す', () => {
    expect(applyNoteEdit(['a'], 1, 'b')).toEqual(['a', 'b']);
  });

  it('既存 index を空にすると削除（前後の空白のみも削除）', () => {
    expect(applyNoteEdit(['a', 'b'], 0, '   ')).toEqual(['b']);
  });

  it('新規 index に空を書いても何も足さない', () => {
    expect(applyNoteEdit(['a'], 1, '')).toEqual(['a']);
  });

  it('前後の空白は落として格納する', () => {
    expect(applyNoteEdit([], 0, '  こんにちは  ')).toEqual(['こんにちは']);
  });

  it('範囲外 index は変更せずコピーを返す', () => {
    const notes = ['a'];
    const result = applyNoteEdit(notes, 5, 'x');
    expect(result).toEqual(['a']);
    expect(result).not.toBe(notes);
  });
});

describe('removeNoteAt', () => {
  it('指定 index を取り除く', () => {
    expect(removeNoteAt(['a', 'b', 'c'], 1)).toEqual(['a', 'c']);
  });

  it('範囲外は変更せずコピーを返す', () => {
    const notes = ['a'];
    const result = removeNoteAt(notes, 3);
    expect(result).toEqual(['a']);
    expect(result).not.toBe(notes);
  });
});

describe('writeGroups', () => {
  it('read(write(groups)) は範囲とラベルを復元する（round-trip）', () => {
    const groups = [
      { start: 0, end: 2, label: '大分類' },
      { start: 3, end: 3, label: '結果' },
    ];
    expect(readGroups(writeGroups(['note keep'], groups))).toEqual(groups);
  });

  it('group 以外は先頭に温存し、単一列は範囲を付けない', () => {
    expect(writeGroups(['note x'], [{ start: 2, end: 2, label: '結果' }])).toEqual([
      'note x',
      'group 2 結果',
    ]);
  });
});
