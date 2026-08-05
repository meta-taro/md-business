import { describe, it, expect } from 'vitest';
import { loadGridDoc, saveGridDoc } from './gridDoc';
import { ROW_ID_COLUMN } from '@md-business/schema-test-spec-tsv';

/**
 * グリッドの読み込み／書き戻しの組み立て。
 *
 * ここで守りたいのは **順序**。読み込みは ID 列を抜いてから控え行を抜く（控えは行 ID で
 * 指すので、ID が出そろう前には引けない）。書き戻しは控えを戻してから ID 列を戻す。
 * どちらかを取り違えると、行が黙って消えたまま保存される。
 */

const A = 'raaaaaaaaaaaa';
const B = 'rbbbbbbbbbbbb';
const C = 'rcccccccccccc';

/** 控えを 1 行持つ検証シート（`ログイン（初版）` が控え）。 */
const withHidden = [
  '#! md-business:test-spec-tsv/v1',
  '# タイトル: 受発注 検証シート',
  `#@ rowid ${ROW_ID_COLUMN}`,
  `#@ hidden ${B}`,
  `項目\t結果\t${ROW_ID_COLUMN}`,
  `ログイン（改訂）\tOK\t${A}`,
  `ログイン（初版）\t\t${B}`,
  `ログアウト\t\t${C}`,
].join('\n');

describe('loadGridDoc', () => {
  it('ID 列と控え行をグリッドから外す', () => {
    const { doc } = loadGridDoc(withHidden);

    expect(doc.columns.map((column) => column.name)).toEqual(['項目', '結果']);
    expect(doc.rows).toEqual([
      ['ログイン（改訂）', 'OK'],
      ['ログアウト', ''],
    ]);
    expect(doc.rowIds).toEqual([A, C]);
  });

  it('抜いた控え行を戻し先つきで返す', () => {
    expect(loadGridDoc(withHidden).hidden).toEqual([
      { id: B, cells: ['ログイン（初版）', ''], afterId: A },
    ]);
  });

  it('控えのないシートは全行を出す', () => {
    const source = [
      '#! md-business:test-spec-tsv/v1',
      '項目',
      'ログイン',
      'ログアウト',
    ].join('\n');

    const { doc, hidden } = loadGridDoc(source);

    expect(doc.rows).toEqual([['ログイン'], ['ログアウト']]);
    expect(hidden).toEqual([]);
  });
});

describe('saveGridDoc', () => {
  it('開いて保存しただけなら元のまま', () => {
    const { doc, hidden } = loadGridDoc(withHidden);

    expect(saveGridDoc(doc, hidden, withHidden)).toBe(withHidden);
  });

  it('編集した行だけが変わり、控えは元の位置に残る', () => {
    const { doc, hidden } = loadGridDoc(withHidden);
    const edited = { ...doc, rows: [['ログイン（三版）', 'OK'], ...doc.rows.slice(1)] };

    expect(saveGridDoc(edited, hidden, withHidden).split('\n')).toEqual([
      '#! md-business:test-spec-tsv/v1',
      '# タイトル: 受発注 検証シート',
      `#@ rowid ${ROW_ID_COLUMN}`,
      `#@ hidden ${B}`,
      `項目\t結果\t${ROW_ID_COLUMN}`,
      `ログイン（三版）\tOK\t${A}`,
      `ログイン（初版）\t\t${B}`,
      `ログアウト\t\t${C}`,
    ]);
  });

  it('元テキストの末尾改行を引き継ぐ', () => {
    const source = `${withHidden}\n`;
    const { doc, hidden } = loadGridDoc(source);

    expect(saveGridDoc(doc, hidden, source)).toBe(source);
  });

  it('ID 列を持たないシートは保存時に ID 列が付く', () => {
    const source = ['#! md-business:test-spec-tsv/v1', '項目', 'ログイン'].join('\n');
    const { doc, hidden } = loadGridDoc(source);

    const saved = saveGridDoc(doc, hidden, source).split('\n');

    expect(saved[1]).toBe(`#@ rowid ${ROW_ID_COLUMN}`);
    expect(saved[2]).toBe(`項目\t${ROW_ID_COLUMN}`);
    expect(saved[3]).toMatch(/^ログイン\tr[0-9a-f]{12}$/);
  });
});
