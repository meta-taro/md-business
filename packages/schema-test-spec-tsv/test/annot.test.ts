import { describe, it, expect } from 'vitest';
import { readAnnotations, setAnnotations } from '../src/annot.js';

/**
 * セルの注釈（`#@ annot <行ID>\t<列名>\t<本文>`）。
 *
 * 「なぜこの値なのか」をセルの外へ出すための機能。印（`#@ mark`）とは寿命が違う
 * （印は次の版で消える／注釈は残る）ので別の宣言にしてある。共有するのはセルの指し方だけ。
 *
 * 最重要契約:
 * - **行は ID で指す**。行番号だと 1 行挿した時点で別のセルの注釈になる。
 * - **同じセルに 2 つ付いたら書いた順に並べる**。まとめない（別々に消せる必要がある）。
 * - **知らない列名も落とさない**。打ち間違えた注釈を読み込みで黙って消すと気づけない
 *   （`#@ mark` / `#@ style` と同じ）。
 * - **本文はエスケープして 1 行に畳む**。改行を生で書くと「1 レコード = 1 物理行」が壊れる。
 */

const ID_A = 'r000000000001';
const ID_B = 'r000000000002';

describe('readAnnotations', () => {
  it('宣言が無ければ空', () => {
    expect(readAnnotations([])).toEqual([]);
  });

  it('行 ID・列名・本文を読む', () => {
    expect(readAnnotations([`annot\t${ID_A}\t期待結果\t下書き保存が入ったので言い直した`])).toEqual([
      { id: ID_A, column: '期待結果', body: '下書き保存が入ったので言い直した' },
    ]);
  });

  it('本文のタブと改行はエスケープから戻す', () => {
    expect(readAnnotations([`annot\t${ID_A}\t備考\t一行目\\n二行目`])[0]?.body).toBe(
      '一行目\n二行目',
    );
  });

  it('列名に空白が入っていても本文と混ざらない', () => {
    // 区切りをタブにしてあるのはこのため（`#@ mark` が空白で切らないのと同じ理由）。
    expect(readAnnotations([`annot\t${ID_A}\t対応 状態\t保留の理由は 別紙`])[0]).toEqual({
      id: ID_A,
      column: '対応 状態',
      body: '保留の理由は 別紙',
    });
  });

  it('同じセルに 2 つあれば書いた順に並べる', () => {
    expect(
      readAnnotations([`annot\t${ID_A}\t結果\t一つめ`, `annot\t${ID_A}\t結果\t二つめ`]).map(
        (annotation) => annotation.body,
      ),
    ).toEqual(['一つめ', '二つめ']);
  });

  it('行が違っても書いた順のまま', () => {
    expect(
      readAnnotations([`annot\t${ID_B}\t結果\tあと`, `annot\t${ID_A}\t結果\tさき`]).map(
        (annotation) => annotation.id,
      ),
    ).toEqual([ID_B, ID_A]);
  });

  it('行 ID の形をしていない指定は捨てる', () => {
    expect(readAnnotations(['annot\t3\t結果\t本文'])).toEqual([]);
  });

  it('列名や本文が無い宣言は捨てる', () => {
    expect(
      readAnnotations([`annot\t${ID_A}`, `annot\t${ID_A}\t結果`, `annot\t${ID_A}\t\t本文`]),
    ).toEqual([]);
  });

  it('ほかの宣言は見ない', () => {
    expect(readAnnotations(['rowid _id', `annotation\t${ID_A}\t結果\t本文`])).toEqual([]);
  });
});

describe('setAnnotations', () => {
  it('注釈を 1 件 1 行で書く', () => {
    expect(
      setAnnotations(['rowid _id'], [
        { id: ID_A, column: '結果', body: '一つめ' },
        { id: ID_A, column: '結果', body: '二つめ' },
      ]),
    ).toEqual(['rowid _id', `annot\t${ID_A}\t結果\t一つめ`, `annot\t${ID_A}\t結果\t二つめ`]);
  });

  it('本文の改行はエスケープして畳む', () => {
    expect(setAnnotations([], [{ id: ID_A, column: '結果', body: '一行目\n二行目' }])).toEqual([
      `annot\t${ID_A}\t結果\t一行目\\n二行目`,
    ]);
  });

  it('既存の宣言は書き直す（重ならない）', () => {
    expect(
      setAnnotations(
        [`annot\t${ID_A}\t結果\t古い`],
        [{ id: ID_B, column: '備考', body: '新しい' }],
      ),
    ).toEqual([`annot\t${ID_B}\t備考\t新しい`]);
  });

  it('注釈が無くなれば宣言ごと消す', () => {
    expect(setAnnotations([`annot\t${ID_A}\t結果\t古い`, 'rowid _id'], [])).toEqual(['rowid _id']);
  });

  it('行 ID・列名・本文が欠けたものは書かない', () => {
    expect(
      setAnnotations([], [
        { id: '3', column: '結果', body: '本文' },
        { id: ID_A, column: '', body: '本文' },
        { id: ID_A, column: '結果', body: '  ' },
      ]),
    ).toEqual([]);
  });

  it('読んで書き戻すと元のまま', () => {
    const directives = [
      'rowid _id',
      `annot\t${ID_A}\t期待結果\t一行目\\n二行目`,
      `annot\t${ID_B}\t備考\tもう一件`,
    ];

    expect(setAnnotations(directives, readAnnotations(directives))).toEqual(directives);
  });
});
