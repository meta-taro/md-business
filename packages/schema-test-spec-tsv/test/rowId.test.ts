import { describe, it, expect } from 'vitest';
import { generateRowId, isRowId, withRowIds, withoutRowIds, ROW_ID_COLUMN } from '../src/rowId.js';
import { parseTsv } from '../src/parse.js';
import { serializeTsv } from '../src/serialize.js';
import type { TsvDocument } from '../src/parse.js';

/**
 * 行の安定 ID。
 *
 * `No.` は行を 1 本挿すと以降が全部ずれるため、行を指す手段にならない。
 * 不変の ID をデータ行の末尾セルに持ち、表としては見せない。
 *
 * 最重要契約:
 * - **ID はデータ行に載る**。ディレクティブ側に行順で並べる形にすると、アプリの外
 *   （MCP / 手編集）で行が挿さったときに黙って対応が壊れる。
 * - **`withoutRowIds(withRowIds(doc))` は元へ戻る**。ID 付きファイルを開いて保存しても
 *   差分が出ない。
 * - **ID 列はグリッドから見えない**。`withRowIds` が doc から抜くので、以降の
 *   レイアウト・書式・検証はいまの列インデックスのまま無改修で動く。
 * - **ID は doc と同じ器に載る**。行を増減させる操作はグリッドの各所に散っており、
 *   ID を別の入れ物で持つと呼び出し側が追随しきれない。
 */

function makeDoc(overrides: Partial<TsvDocument>): TsvDocument {
  return { formatId: '', meta: {}, directives: [], columns: [], rows: [], ...overrides };
}

/** 採番を検査可能にする差し替え用。実装は乱数だが、テストでは並びを固定する。 */
function counter(): () => string {
  let n = 0;
  return () => `r${String(++n).padStart(12, '0')}`;
}

const 項目 = { name: '項目', type: 'text', required: false } as const;
const 結果 = { name: '結果', type: 'text', required: false } as const;
const idCol = { name: ROW_ID_COLUMN, type: 'text', required: false } as const;

describe('generateRowId', () => {
  it('先頭が英字の ID を作る', () => {
    // 数字だけの ID にすると `#@ rowheight <key>=<px>` の key が
    // 「行インデックス」か「ID」か構文で判別できなくなる。
    expect(generateRowId()).toMatch(/^r[0-9a-f]{12}$/);
  });

  it('呼ぶたび違う ID になる', () => {
    const ids = new Set(Array.from({ length: 200 }, () => generateRowId()));
    expect(ids.size).toBe(200);
  });
});

describe('isRowId', () => {
  it('採番した ID を ID と判定する', () => {
    expect(isRowId(generateRowId())).toBe(true);
  });

  it('数字だけのキーは ID ではない', () => {
    // `#@ rowheight <key>=<px>` の key は行インデックス（既存ファイル）と ID が混在する。
    // 構文だけで振り分けられることが、フォーマットのバージョンを上げずに済む根拠。
    expect(isRowId('0')).toBe(false);
    expect(isRowId('12')).toBe(false);
  });

  it('桁数違い・16 進以外は ID ではない', () => {
    expect(isRowId('rabc')).toBe(false);
    expect(isRowId('rAAAAAAAAAAAA')).toBe(false);
    expect(isRowId('raaaaaaaaaaaaa')).toBe(false);
    expect(isRowId('')).toBe(false);
  });
});

describe('withRowIds — 読み込み時に ID 列を抜く', () => {
  it('宣言された ID 列を doc から抜き、行順の ID を返す', () => {
    const doc = makeDoc({
      directives: [`rowid ${ROW_ID_COLUMN}`],
      columns: [項目, 結果, idCol],
      rows: [
        ['ログイン', 'OK', 'raaaaaaaaaaaa'],
        ['ログアウト', 'NG', 'rbbbbbbbbbbbb'],
      ],
    });

    const identified = withRowIds(doc, counter());

    expect(identified.idColumn).toBe(ROW_ID_COLUMN);
    expect(identified.rowIds).toEqual(['raaaaaaaaaaaa', 'rbbbbbbbbbbbb']);
    expect(identified.columns).toEqual([項目, 結果]);
    expect(identified.rows).toEqual([
      ['ログイン', 'OK'],
      ['ログアウト', 'NG'],
    ]);
  });

  it('ディレクティブが消えていても、末尾列名が既定名なら ID 列とみなす', () => {
    // 手編集で `#@ rowid` 行だけ落ちたときに、ID がただの文字列列へ化けるのを防ぐ。
    const doc = makeDoc({ columns: [項目, idCol], rows: [['ログイン', 'raaaaaaaaaaaa']] });

    expect(withRowIds(doc, counter()).rowIds).toEqual(['raaaaaaaaaaaa']);
  });

  it('ID 列が無ければ採番する（doc の列はそのまま）', () => {
    const doc = makeDoc({ columns: [項目, 結果], rows: [['ログイン', 'OK'], ['ログアウト', '']] });

    const identified = withRowIds(doc, counter());

    expect(identified.rowIds).toEqual(['r000000000001', 'r000000000002']);
    expect(identified.columns).toEqual([項目, 結果]);
    expect(identified.rows).toEqual([['ログイン', 'OK'], ['ログアウト', '']]);
  });

  it('形式に合わない ID は採番し直す', () => {
    // 手で足した行・別ツールが書いた値をそのまま ID として信用しない。
    const doc = makeDoc({
      directives: [`rowid ${ROW_ID_COLUMN}`],
      columns: [項目, idCol],
      rows: [['a', ''], ['b', '1'], ['c', 'raaaaaaaaaaaa']],
    });

    expect(withRowIds(doc, counter()).rowIds).toEqual([
      'r000000000001',
      'r000000000002',
      'raaaaaaaaaaaa',
    ]);
  });

  it('重複した ID は後の行を採番し直す', () => {
    // 行を複製したまま保存されたファイルが来る。ID が指す先が 2 つあると
    // ファイルをまたいだ参照（後続ブロック）が成立しない。
    const doc = makeDoc({
      directives: [`rowid ${ROW_ID_COLUMN}`],
      columns: [項目, idCol],
      rows: [['a', 'raaaaaaaaaaaa'], ['b', 'raaaaaaaaaaaa']],
    });

    const { rowIds } = withRowIds(doc, counter());

    expect(rowIds[0]).toBe('raaaaaaaaaaaa');
    expect(rowIds[1]).toBe('r000000000001');
  });

  it('ID セルが欠けた短い行にも採番する', () => {
    const doc = makeDoc({
      directives: [`rowid ${ROW_ID_COLUMN}`],
      columns: [項目, 結果, idCol],
      rows: [['ログイン']],
    });

    const identified = withRowIds(doc, counter());

    expect(identified.rowIds).toEqual(['r000000000001']);
    expect(identified.rows).toEqual([['ログイン']]);
  });

  it('宣言された列名が存在しなければ、その名前で採番する', () => {
    const doc = makeDoc({ directives: ['rowid 行ID'], columns: [項目], rows: [['a']] });

    const identified = withRowIds(doc, counter());

    expect(identified.idColumn).toBe('行ID');
    expect(identified.rowIds).toEqual(['r000000000001']);
  });
});

describe('withoutRowIds — 保存時に ID 列を戻す', () => {
  it('末尾列として戻し、宣言を先頭のディレクティブに置く', () => {
    const doc = makeDoc({
      directives: ['style 結果 OK=#e7f6ec'],
      columns: [項目, 結果],
      rows: [['ログイン', 'OK']],
    });

    const joined = withoutRowIds({
      ...doc,
      rowIds: ['raaaaaaaaaaaa'],
      idColumn: ROW_ID_COLUMN,
    });

    expect(joined.columns).toEqual([項目, 結果, idCol]);
    expect(joined.rows).toEqual([['ログイン', 'OK', 'raaaaaaaaaaaa']]);
    // レイアウト系は末尾へ付け直される（`writeLayoutDirectives`）ため、
    // 宣言は先頭に置いて保存のたびに並びが揺れないようにする。
    expect(joined.directives).toEqual([`rowid ${ROW_ID_COLUMN}`, 'style 結果 OK=#e7f6ec']);
  });

  it('短い行は ID 列の位置まで空セルで埋める', () => {
    // 埋めないと ID が別の列の位置に入り、読み戻しでずれる。
    const doc = makeDoc({ columns: [項目, 結果], rows: [['ログイン']] });

    const joined = withoutRowIds({ ...doc, rowIds: ['raaaaaaaaaaaa'], idColumn: ROW_ID_COLUMN });

    expect(joined.rows).toEqual([['ログイン', '', 'raaaaaaaaaaaa']]);
  });

  it('宣言を二重に書かない', () => {
    const doc = makeDoc({
      directives: ['rowid _id', 'style 結果 OK=#e7f6ec'],
      columns: [項目],
      rows: [['a']],
    });

    const joined = withoutRowIds({ ...doc, rowIds: ['raaaaaaaaaaaa'], idColumn: ROW_ID_COLUMN });

    expect(joined.directives).toEqual([`rowid ${ROW_ID_COLUMN}`, 'style 結果 OK=#e7f6ec']);
  });

  it('ID の持ち回り用フィールドを書き出す doc に残さない', () => {
    // 保存経路へ渡る doc に居残ると、シリアライザや MCP の出力へ紛れ込む。
    const doc = makeDoc({ columns: [項目], rows: [['a']] });

    const joined = withoutRowIds({ ...doc, rowIds: ['raaaaaaaaaaaa'], idColumn: ROW_ID_COLUMN });

    expect(joined).not.toHaveProperty('rowIds');
    expect(joined).not.toHaveProperty('idColumn');
  });
});

describe('round-trip', () => {
  it('ID 付きファイルは開いて保存しても変わらない', () => {
    const text = [
      '#! md-business:test-spec-tsv/v1',
      '# タイトル: 受発注 検証シート',
      `#@ rowid ${ROW_ID_COLUMN}`,
      '#@ style 結果 OK=#e7f6ec',
      `項目\t結果\t${ROW_ID_COLUMN}`,
      'ログイン\tOK\traaaaaaaaaaaa',
      'ログアウト\t\trbbbbbbbbbbbb',
    ].join('\n');

    const identified = withRowIds(parseTsv(text), counter());

    expect(serializeTsv(withoutRowIds(identified))).toBe(text);
  });

  it('ID の無い既存ファイルは、ID 列の追加だけが差分になる', () => {
    // 中止条件: これ以外の差分が出るなら設計を見直す。
    const before = [
      '#! md-business:test-spec-tsv/v1',
      '# タイトル: 受発注 検証シート',
      '#@ style 結果 OK=#e7f6ec',
      'No.:number\t項目\t結果',
      '1\tログイン\tOK',
    ].join('\n');

    const after = serializeTsv(withoutRowIds(withRowIds(parseTsv(before), counter())));

    expect(after).toBe(
      [
        '#! md-business:test-spec-tsv/v1',
        '# タイトル: 受発注 検証シート',
        `#@ rowid ${ROW_ID_COLUMN}`,
        '#@ style 結果 OK=#e7f6ec',
        `No.:number\t項目\t結果\t${ROW_ID_COLUMN}`,
        '1\tログイン\tOK\tr000000000001',
      ].join('\n'),
    );
  });
});
