import { describe, it, expect } from 'vitest';
import { readMarks, setMarks } from '../src/marks.js';

/**
 * 手で付けるセルの印（`#@ mark <行ID> <列名>,…`）。
 *
 * 直した箇所の赤字は前の版との突き合わせ（`diffSheets`）が出す。ここはその**逃げ道**で、
 * 突き合わせに落ちない例外（版が無い / 値は同じだが意味が変わった）だけを手で指す。
 *
 * 最重要契約:
 * - **行は ID で指す**。行番号で指すと 1 行挿した時点で別のセルが赤くなる。
 * - **知らない列名も落とさない**。列名を打ち間違えた印を黙って消すと、消えたことに
 *   気づけない（`#@ style` と同じで、書いたとおりを保つ）。
 * - **印が無くなれば宣言ごと消す**。触っていないファイルに空の宣言行を生やさない。
 */

const ID_A = 'r000000000001';
const ID_B = 'r000000000002';

describe('readMarks', () => {
  it('宣言が無ければ空', () => {
    expect(readMarks([])).toEqual(new Map());
  });

  it('行 ID と列名を読む', () => {
    expect(readMarks([`mark ${ID_A} 結果,備考`])).toEqual(new Map([[ID_A, ['結果', '備考']]]));
  });

  it('列名の前後の空白は落とし、名前の中の空白は残す', () => {
    expect(readMarks([`mark ${ID_A} 対応 状態 , 結果`])).toEqual(
      new Map([[ID_A, ['対応 状態', '結果']]]),
    );
  });

  it('同じ行が 2 本あれば足し合わせる（後勝ちにすると手で足した印が消える）', () => {
    expect(readMarks([`mark ${ID_A} 結果`, `mark ${ID_A} 備考,結果`])).toEqual(
      new Map([[ID_A, ['結果', '備考']]]),
    );
  });

  it('行が違えば別の印として記載順に持つ', () => {
    expect([...readMarks([`mark ${ID_B} 結果`, `mark ${ID_A} 備考`]).keys()]).toEqual([ID_B, ID_A]);
  });

  it('行 ID の形をしていない指定は捨てる', () => {
    expect(readMarks(['mark 3 結果'])).toEqual(new Map());
  });

  it('列名が無い宣言は捨てる', () => {
    expect(readMarks([`mark ${ID_A}`, `mark ${ID_A} , `])).toEqual(new Map());
  });

  it('ほかの宣言は見ない', () => {
    expect(readMarks(['rowid _id', `marks ${ID_A} 結果`])).toEqual(new Map());
  });
});

describe('setMarks', () => {
  it('印を 1 行にまとめて書く', () => {
    expect(setMarks(['rowid _id'], new Map([[ID_A, ['結果', '備考']]]))).toEqual([
      'rowid _id',
      `mark ${ID_A} 結果,備考`,
    ]);
  });

  it('行ごとに 1 本ずつ書く', () => {
    expect(
      setMarks([], new Map([[ID_A, ['結果']], [ID_B, ['備考']]])),
    ).toEqual([`mark ${ID_A} 結果`, `mark ${ID_B} 備考`]);
  });

  it('既にある mark 行は書き直す', () => {
    expect(setMarks([`mark ${ID_A} 結果`], new Map([[ID_B, ['備考']]]))).toEqual([
      `mark ${ID_B} 備考`,
    ]);
  });

  it('印が無ければ宣言行ごと落とす', () => {
    expect(setMarks(['rowid _id', `mark ${ID_A} 結果`], new Map())).toEqual(['rowid _id']);
  });

  it('列名が空になった行は書かない', () => {
    expect(setMarks([], new Map([[ID_A, []]]))).toEqual([]);
  });

  it('書いたものをそのまま読み返せる', () => {
    const marks = new Map([[ID_A, ['対応 状態', '結果']]]);
    expect(readMarks(setMarks([], marks))).toEqual(marks);
  });
});
