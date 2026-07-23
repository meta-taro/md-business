import { describe, it, expect } from 'vitest';
import { readNotes, writeNotes } from './gridHeaderDirectives';

/**
 * 検証グリッドの表ヘッダ拡張（Issue 010・田中さん 2026-07-23「表の上に補足」）。
 *
 * 補足行を `#@ note <text>` ディレクティブへ載せ、既存パーサ（`doc.directives` を
 * round-trip）へそのまま焼く。ここはその純ロジックだけを検査する。
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
