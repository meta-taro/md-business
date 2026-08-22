import { describe, it, expect } from 'vitest';
import { parseTsv, withRowIds, readAnnotations } from '@md-business/schema-test-spec-tsv';
import type { IdentifiedTsv } from '@md-business/schema-test-spec-tsv';
import {
  addAnnotation,
  annotationsAt,
  placeAnnotations,
  removeAnnotation,
  setAnnotationBody,
} from './gridAnnot';

/**
 * セルの注釈（`#@ annot`）のグリッド側。
 *
 * 宣言の読み書きはスキーマ側が持つ。ここが引き受けるのは **表の位置へ引き直すところ**で、
 * 紙に振る通し番号もここで決まる（ファイルには持たない）。
 *
 * 最重要契約:
 * - **番号は上から（行 → 列）**。ファイルの記載順ではない。
 * - **引けない注釈は並びに出さないが、消しもしない**（列名の打ち間違いを黙って捨てない）。
 * - 付け外しの宛先は **記載順の位置**。同じセルに 2 件あっても片方だけ消せる。
 */

const A = 'raaaaaaaaaaaa';
const B = 'rbbbbbbbbbbbb';

/** 2 行 2 列のシート。注釈の宣言は呼ぶ側が足す。 */
function sheet(...directives: string[]): IdentifiedTsv {
  const doc = parseTsv(
    ['#! md-business:test-spec-tsv/v1', '項目\t結果', 'ログイン\tOK', 'ログアウト\t'].join('\n'),
  );
  return { ...withRowIds({ ...doc, directives }), rowIds: [A, B] };
}

/** `#@ annot` 1 本ぶんの文字列（区切りはタブ）。 */
function annot(id: string, column: string, body: string): string {
  return ['annot', id, column, body].join('\t');
}

describe('placeAnnotations', () => {
  it('宣言が無ければ空', () => {
    expect(placeAnnotations(sheet())).toEqual([]);
  });

  it('行と列の位置へ引き直す', () => {
    expect(placeAnnotations(sheet(annot(B, '結果', 'まだ試していない')))).toEqual([
      { index: 0, number: 1, row: 1, col: 1, body: 'まだ試していない' },
    ]);
  });

  it('番号は記載順ではなく上から（行 → 列）振る', () => {
    const placed = placeAnnotations(
      sheet(annot(B, '項目', 'あと'), annot(A, '結果', 'さき'), annot(A, '項目', 'いちばん')),
    );

    expect(placed.map((a) => [a.number, a.body])).toEqual([
      [1, 'いちばん'],
      [2, 'さき'],
      [3, 'あと'],
    ]);
  });

  it('同じセルに 2 件あれば書いた順に続き番号を振る', () => {
    const placed = placeAnnotations(sheet(annot(A, '項目', '一つめ'), annot(A, '項目', '二つめ')));

    expect(placed.map((a) => [a.number, a.index, a.body])).toEqual([
      [1, 0, '一つめ'],
      [2, 1, '二つめ'],
    ]);
  });

  it('知らない列名・表に無い行は並びに出さない', () => {
    expect(placeAnnotations(sheet(annot(A, '存在しない列', '本文'), annot('rzzzzzzzzzzzz', '項目', '本文')))).toEqual(
      [],
    );
  });

  it('引けない注釈があっても、引ける注釈の宛先はずれない', () => {
    // 記載順の 0 番目が引けない。1 番目を消すつもりで 0 番目を消してはいけない。
    const placed = placeAnnotations(sheet(annot(A, '存在しない列', '引けない'), annot(A, '項目', '引ける')));

    expect(placed).toEqual([{ index: 1, number: 1, row: 0, col: 0, body: '引ける' }]);
  });
});

describe('annotationsAt', () => {
  it('そのセルの注釈だけを返す', () => {
    const placed = placeAnnotations(sheet(annot(A, '項目', 'こちら'), annot(A, '結果', 'あちら')));

    expect(annotationsAt(placed, 0, 0).map((a) => a.body)).toEqual(['こちら']);
  });

  it('注釈が無いセルは空', () => {
    expect(annotationsAt(placeAnnotations(sheet(annot(A, '項目', '本文'))), 1, 1)).toEqual([]);
  });
});

describe('addAnnotation', () => {
  it('セルへ 1 件足す', () => {
    expect(readAnnotations(addAnnotation(sheet(), 1, 1, '追記').directives)).toEqual([
      { id: B, column: '結果', body: '追記' },
    ]);
  });

  it('既にある注釈の後ろへ足す', () => {
    const doc = addAnnotation(sheet(annot(A, '項目', '先客')), 0, 0, '追記');

    expect(readAnnotations(doc.directives).map((a) => a.body)).toEqual(['先客', '追記']);
  });

  it('空の本文は足さない', () => {
    expect(addAnnotation(sheet(), 0, 0, '  ').directives).toEqual([]);
  });

  it('行 ID も列名も無い場所には足さない', () => {
    expect(addAnnotation(sheet(), 9, 0, '本文').directives).toEqual([]);
    expect(addAnnotation(sheet(), 0, 9, '本文').directives).toEqual([]);
  });

  it('行と列は触らない', () => {
    const before = sheet();
    const after = addAnnotation(before, 0, 0, '本文');

    expect(after.rows).toEqual(before.rows);
    expect(after.rowIds).toEqual(before.rowIds);
  });
});

describe('setAnnotationBody', () => {
  it('本文を書き換える', () => {
    const doc = setAnnotationBody(sheet(annot(A, '項目', '古い')), 0, '新しい');

    expect(readAnnotations(doc.directives).map((a) => a.body)).toEqual(['新しい']);
  });

  it('空にしたら消す（消し方が無いと去年の注釈が残り続ける）', () => {
    expect(setAnnotationBody(sheet(annot(A, '項目', '古い')), 0, '').directives).toEqual([]);
  });

  it('並びに無い位置は何も起こさない', () => {
    const before = sheet(annot(A, '項目', '本文'));

    expect(setAnnotationBody(before, 5, '新しい').directives).toEqual(before.directives);
  });
});

describe('removeAnnotation', () => {
  it('同じセルの 2 件のうち片方だけ消す', () => {
    const doc = removeAnnotation(sheet(annot(A, '項目', '一つめ'), annot(A, '項目', '二つめ')), 0);

    expect(readAnnotations(doc.directives).map((a) => a.body)).toEqual(['二つめ']);
  });

  it('引けない注釈は残したまま、ほかを消せる', () => {
    const doc = removeAnnotation(sheet(annot(A, '存在しない列', '引けない'), annot(A, '項目', '引ける')), 1);

    expect(readAnnotations(doc.directives).map((a) => a.body)).toEqual(['引けない']);
  });

  it('ほかの宣言は残す', () => {
    const doc = removeAnnotation(sheet('rowid _id', annot(A, '項目', '本文')), 0);

    expect(doc.directives).toEqual(['rowid _id']);
  });
});
