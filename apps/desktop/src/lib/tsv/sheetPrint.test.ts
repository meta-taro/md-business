import { describe, expect, it } from 'vitest';
import { loadGridDoc, saveGridDoc } from './gridDoc';
import { hideRow } from './gridHidden';
import { buildSheetPrintDoc } from './sheetPrint';

/** 検証シートの体裁を縮めた素材。行は必要なぶんだけ足して使う。 */
function sheet(lines: string[]): string {
  return ['#! md-business:test-spec-tsv/v1', ...lines].join('\n');
}

/** 既定の列並び（型付きヘッダ）。 */
const HEADER = 'No.:number!\t項目:multiline!\t結果:enum(OK|NG|保留|未実施)!\t備考:multiline';

/** 行 ID 列を持つ素材（控え行の宣言は行 ID を指すため、ID 列が無いと試せない）。 */
function withRowIdColumn(directives: string[] = []): string {
  return sheet([
    '#@ rowid 行 ID',
    ...directives,
    `行 ID	${HEADER}`,
    'r1	1	残す	未実施	',
    'r2	2	控え	未実施	',
  ]);
}

/** セル内改行のエスケープ（ファイル上は 2 文字）。 */
const NL = String.raw`\n`;

/** 行 ID 列を持つ素材。控えの宣言は行 ID を指すので、ID 列が無いと控えを試せない。 */
function identified(): string {
  return sheet([
    '#@ rowid 行ID',
    `行ID\t${HEADER}`,
    `\t1\t残す\t未実施\t`,
    `\t2\t控え\t未実施\t`,
  ]);
}

function build(lines: string[], fallbackTitle = 'sheet.tsv') {
  return buildSheetPrintDoc(loadGridDoc(sheet(lines)).doc, { fallbackTitle });
}

/**
 * 行 ID 列を持つ素材へ `#@ annot` を足して組み直す。
 * 宣言は採番された行 ID を指すので、一度開いてからでないと書けない。
 */
function annotate(specs: string[], rowIndex: number) {
  const loaded = loadGridDoc(identified());
  const id = loaded.doc.rowIds[rowIndex]!;

  return buildSheetPrintDoc(
    {
      ...loaded.doc,
      directives: [...loaded.doc.directives, ...specs.map((spec) => `annot\t${id}${spec}`)],
    },
    { fallbackTitle: 'x' },
  );
}

describe('buildSheetPrintDoc', () => {
  it('メタの題名を表題にし、メタ一覧からは外す', () => {
    const doc = build(['# タイトル: v0.24.0 検証シート', '# 版: 0.24.0', HEADER]);

    expect(doc.title).toBe('v0.24.0 検証シート');
    expect(doc.meta).toEqual([{ key: '版', value: '0.24.0' }]);
  });

  it('題名のメタが無ければ渡された題名を使う', () => {
    expect(build(['# 版: 0.24.0', HEADER], '015-desktop.tsv').title).toBe('015-desktop.tsv');
  });

  it('値が空のメタは出さない', () => {
    const doc = build(['# 版: 0.24.0', '# 備考: ', HEADER]);

    expect(doc.meta).toEqual([{ key: '版', value: '0.24.0' }]);
  });

  it('note を注記として記載順に取る', () => {
    const doc = build(['#@ note 一つ目', '#@ note 二つ目', HEADER]);

    expect(doc.notes).toEqual(['一つ目', '二つ目']);
  });

  it('列名と、列型から決まる既定の幅・寄せを取る', () => {
    const doc = build([HEADER]);

    expect(doc.columns.map((column) => column.name)).toEqual(['No.', '項目', '結果', '備考']);
    // number 列は右寄せが既定。
    expect(doc.columns[0]?.align).toBe('right');
    expect(doc.columns[0]?.width).toBeGreaterThan(0);
  });

  it('colwidth と align の宣言を反映する', () => {
    const doc = build(['#@ colwidth 0=64 1=320', '#@ align 2=center', HEADER]);

    expect(doc.columns[0]?.width).toBe(64);
    expect(doc.columns[1]?.width).toBe(320);
    expect(doc.columns[2]?.align).toBe('center');
  });

  it('style の色を行の地色にする', () => {
    const doc = build([
      '#@ style 結果 OK=#e7f6ec NG=#fcebec',
      HEADER,
      '1\t開く\tOK\t',
      '2\t閉じる\tNG\t',
      '3\t消す\t未実施\t',
    ]);

    expect(doc.rows.map((row) => row.tint)).toEqual(['#e7f6ec', '#fcebec', undefined]);
  });

  it('控えにした行は刷らない', () => {
    // 控えにする操作を通してから開き直す（宣言は採番された行 ID を指すため）。
    const source = identified();
    const loaded = loadGridDoc(source);
    const hidden = saveGridDoc(hideRow(loaded.doc, 1), loaded, source);
    const doc = buildSheetPrintDoc(loadGridDoc(hidden).doc, { fallbackTitle: 'x' });

    expect(doc.rows).toHaveLength(1);
    expect(doc.rows[0]?.cells[1]).toBe('残す');
  });

  it('行 ID の列は刷らない', () => {
    const doc = buildSheetPrintDoc(loadGridDoc(identified()).doc, { fallbackTitle: 'x' });

    expect(doc.columns.map((column) => column.name)).toEqual(['No.', '項目', '結果', '備考']);
    expect(doc.rows[0]?.cells[0]).toBe('1');
    expect(doc.rows[0]?.cells).toHaveLength(4);
  });

  it('計算列は算出値で刷る（グリッドを開いていなくても番号が出る）', () => {
    const doc = build(['#@ computed No. = rowNumber()', HEADER, '\t開く\t未実施\t', '\t閉じる\t未実施\t']);

    expect(doc.rows.map((row) => row.cells[0])).toEqual(['1', '2']);
  });

  it('セル内改行はそのまま渡す（畳むのは刷る側）', () => {
    const doc = build([HEADER, `1\t1. 開く${NL}2. 押す\t未実施\t`]);

    expect(doc.rows[0]?.cells[1]).toBe('1. 開く\n2. 押す');
  });

  it('注釈は上から番号を振って渡す（紙に振り直させない）', () => {
    const doc = annotate(['\t結果\t再現しないので保留', '\t項目\t言い直した'], 0);

    expect(doc.annotations).toEqual([
      { number: 1, row: 0, col: 1, body: '言い直した' },
      { number: 2, row: 0, col: 2, body: '再現しないので保留' },
    ]);
  });

  it('注釈が無ければ空', () => {
    const doc = buildSheetPrintDoc(loadGridDoc(identified()).doc, { fallbackTitle: 'x' });

    expect(doc.annotations).toEqual([]);
  });

  it('控えにした行の注釈は刷らない（行ごと紙に出ないため）', () => {
    const source = identified();
    const loaded = loadGridDoc(source);
    const id = loaded.doc.rowIds[1]!;
    const hidden = saveGridDoc(hideRow(loaded.doc, 1), loaded, source);
    const reopened = loadGridDoc(hidden);
    const doc = buildSheetPrintDoc(
      {
        ...reopened.doc,
        directives: [...reopened.doc.directives, `annot\t${id}\t項目\t控えの注釈`],
      },
      { fallbackTitle: 'x' },
    );

    expect(doc.annotations).toEqual([]);
  });
});
