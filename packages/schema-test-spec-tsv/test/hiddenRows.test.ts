import { describe, it, expect } from 'vitest';
import {
  mergeHiddenRows,
  readHiddenIds,
  setHiddenIds,
  splitHiddenRows,
  splitRowsById,
} from '../src/hiddenRows.js';
import { withRowIds, withoutRowIds, ROW_ID_COLUMN } from '../src/rowId.js';
import { parseTsv } from '../src/parse.js';
import { serializeTsv } from '../src/serialize.js';
import type { IdentifiedTsv } from '../src/rowId.js';

/**
 * 控え行（`#@ hidden <id> …`）。
 *
 * 文言を書き直したとき、元の文言の行を「消していいか毎回悩む」のをやめるための仕組み。
 * 行はファイルに残したまま、グリッドには出さない。
 *
 * 最重要契約:
 * - **控え行は行 ID でしか指さない**。行インデックスで指すと 1 行挿さった時点で
 *   別の行が控え扱いになり、消していいか悩む状態が悪化する。
 * - **doc から抜いて渡す**。ID 列（{@link withRowIds}）と同じ扱いにすることで、
 *   グリッドの選択・移動・貼り付け・検証は行インデックスのまま無改修で動く。
 * - **`merge(split(doc))` は元へ戻る**。控えを含むファイルを開いて保存しても差分が出ない。
 * - **戻す位置は直前の可視行で覚える**。控えは書き直した行の隣にあることに意味がある。
 */

function makeDoc(overrides: Partial<IdentifiedTsv>): IdentifiedTsv {
  return {
    formatId: '',
    meta: {},
    directives: [],
    columns: [],
    rows: [],
    rowIds: [],
    idColumn: ROW_ID_COLUMN,
    ...overrides,
  };
}

const A = 'raaaaaaaaaaaa';
const B = 'rbbbbbbbbbbbb';
const C = 'rcccccccccccc';
const D = 'rdddddddddddd';

const 項目 = { name: '項目', type: 'text', required: false } as const;

describe('readHiddenIds', () => {
  it('`hidden` 行の ID を記載順に読む', () => {
    expect(readHiddenIds([`hidden ${A} ${B}`])).toEqual([A, B]);
  });

  it('複数の `hidden` 行は足し合わせる', () => {
    // 手編集で 1 行が長くなりすぎたときに分割できる。後勝ちにすると分割で控えが消える。
    expect(readHiddenIds([`hidden ${A}`, 'style 結果 OK=#e7f6ec', `hidden ${B}`])).toEqual([A, B]);
  });

  it('重複した ID は 1 件に畳む', () => {
    expect(readHiddenIds([`hidden ${A} ${A}`])).toEqual([A]);
  });

  it('ID の形をしていないトークンは捨てる', () => {
    // 行インデックス（数字）を書かれても受け付けない。受けると 1 行挿さった時点で
    // 別の行が控えになる。
    expect(readHiddenIds([`hidden 3 ${A} rzz`])).toEqual([A]);
  });

  it('`hidden` 以外のディレクティブは見ない', () => {
    expect(readHiddenIds([`rowheight ${A}=48`, `hiddenish ${B}`])).toEqual([]);
  });

  it('本体が空の `hidden` 行は控えなしとして扱う', () => {
    expect(readHiddenIds(['hidden', 'hidden   '])).toEqual([]);
  });
});

describe('setHiddenIds', () => {
  it('既存の `hidden` 行を 1 本に差し替える', () => {
    const directives = setHiddenIds([`hidden ${A}`, 'style 結果 OK=#e7f6ec', `hidden ${B}`], [C]);

    expect(directives).toEqual(['style 結果 OK=#e7f6ec', `hidden ${C}`]);
  });

  it('控えが無くなったら行ごと消す', () => {
    expect(setHiddenIds([`hidden ${A}`, 'style 結果 OK=#e7f6ec'], [])).toEqual([
      'style 結果 OK=#e7f6ec',
    ]);
  });

  it('控えが無いファイルには `hidden` 行を出さない', () => {
    // 未使用のファイルに空行が生えると、触っていないファイルに差分が出る。
    expect(setHiddenIds(['style 結果 OK=#e7f6ec'], [])).toEqual(['style 結果 OK=#e7f6ec']);
  });
});

describe('splitHiddenRows — 読み込み時に控え行を抜く', () => {
  it('控え行を doc から抜き、直前の可視行の ID とともに返す', () => {
    const doc = makeDoc({
      directives: [`hidden ${B}`],
      columns: [項目],
      rows: [['ログイン（改訂）'], ['ログイン（初版）'], ['ログアウト']],
      rowIds: [A, B, C],
    });

    const { doc: visible, hidden } = splitHiddenRows(doc);

    expect(visible.rows).toEqual([['ログイン（改訂）'], ['ログアウト']]);
    expect(visible.rowIds).toEqual([A, C]);
    expect(hidden).toEqual([{ id: B, cells: ['ログイン（初版）'], afterId: A }]);
  });

  it('先頭が控え行なら afterId は null', () => {
    const doc = makeDoc({
      directives: [`hidden ${A}`],
      columns: [項目],
      rows: [['初版'], ['改訂']],
      rowIds: [A, B],
    });

    expect(splitHiddenRows(doc).hidden).toEqual([{ id: A, cells: ['初版'], afterId: null }]);
  });

  it('控えが無ければ doc をそのまま返す', () => {
    const doc = makeDoc({ columns: [項目], rows: [['ログイン']], rowIds: [A] });

    const { doc: visible, hidden } = splitHiddenRows(doc);

    expect(hidden).toEqual([]);
    expect(visible.rows).toEqual([['ログイン']]);
  });

  it('文書に無い ID の指定は無視する', () => {
    const doc = makeDoc({ directives: [`hidden ${D}`], columns: [項目], rows: [['a']], rowIds: [A] });

    expect(splitHiddenRows(doc).doc.rows).toEqual([['a']]);
  });

  it('`hidden` 行はディレクティブに残す', () => {
    // 抜いた事実はファイル側の宣言が正本。保存で書き戻せなくなる。
    const doc = makeDoc({ directives: [`hidden ${A}`], columns: [項目], rows: [['a']], rowIds: [A] });

    expect(splitHiddenRows(doc).doc.directives).toEqual([`hidden ${A}`]);
  });
});

describe('mergeHiddenRows — 保存時に控え行を戻す', () => {
  it('直前の可視行の後ろへ戻す', () => {
    const doc = makeDoc({
      directives: [`hidden ${B}`],
      columns: [項目],
      rows: [['改訂'], ['ログアウト']],
      rowIds: [A, C],
    });

    const merged = mergeHiddenRows(doc, [{ id: B, cells: ['初版'], afterId: A }]);

    expect(merged.rows).toEqual([['改訂'], ['初版'], ['ログアウト']]);
    expect(merged.rowIds).toEqual([A, B, C]);
  });

  it('afterId が null の控えは先頭へ戻す', () => {
    const doc = makeDoc({ columns: [項目], rows: [['改訂']], rowIds: [B] });

    const merged = mergeHiddenRows(doc, [{ id: A, cells: ['初版'], afterId: null }]);

    expect(merged.rowIds).toEqual([A, B]);
  });

  it('同じ行に付く控えは記載順を保つ', () => {
    const doc = makeDoc({ columns: [項目], rows: [['三版']], rowIds: [A] });

    const merged = mergeHiddenRows(doc, [
      { id: B, cells: ['初版'], afterId: A },
      { id: C, cells: ['二版'], afterId: A },
    ]);

    expect(merged.rowIds).toEqual([A, B, C]);
    expect(merged.rows).toEqual([['三版'], ['初版'], ['二版']]);
  });

  it('戻す先の行が消えていたら末尾へ回す', () => {
    // 控えの元になった行を消しても、控えそのものは落とさない（消していいか悩まないための機能で、
    // 黙って消えるのはいちばんまずい壊れ方）。
    const doc = makeDoc({ columns: [項目], rows: [['ログアウト']], rowIds: [C] });

    const merged = mergeHiddenRows(doc, [{ id: B, cells: ['初版'], afterId: A }]);

    expect(merged.rowIds).toEqual([C, B]);
    expect(merged.rows).toEqual([['ログアウト'], ['初版']]);
  });

  it('split の結果をそのまま戻すと元の doc に一致する', () => {
    const doc = makeDoc({
      directives: [`hidden ${B} ${D}`],
      columns: [項目],
      rows: [['改訂'], ['初版'], ['ログアウト'], ['ログアウト初版']],
      rowIds: [A, B, C, D],
    });

    const { doc: visible, hidden } = splitHiddenRows(doc);

    expect(mergeHiddenRows(visible, hidden)).toEqual(doc);
  });
});

describe('round-trip', () => {
  it('控えを含むファイルは開いて保存しても変わらない', () => {
    const text = [
      '#! md-business:test-spec-tsv/v1',
      '# タイトル: 受発注 検証シート',
      `#@ rowid ${ROW_ID_COLUMN}`,
      `#@ hidden ${B}`,
      `項目\t${ROW_ID_COLUMN}`,
      `ログイン（改訂）\t${A}`,
      `ログイン（初版）\t${B}`,
    ].join('\n');

    const { doc, hidden } = splitHiddenRows(withRowIds(parseTsv(text)));

    expect(doc.rows).toEqual([['ログイン（改訂）']]);
    expect(serializeTsv(withoutRowIds(mergeHiddenRows(doc, hidden)))).toBe(text);
  });
});

/**
 * 行 ID を渡して抜く（{@link splitHiddenRows} の中身）。
 *
 * 控えはファイルの宣言から抜く行を決めるが、絞り込みは**画面の都合**で決める。
 * 決め方は違っても、抜いて戻す作法は 1 つでなければならない。2 つ持つと、
 * 戻し方が食い違ったときに行が黙って消える。
 */
describe('splitRowsById — 渡された ID の行を抜く', () => {
  it('宣言ではなく渡された ID で抜く', () => {
    const doc = makeDoc({
      directives: [`hidden ${A}`],
      columns: [項目],
      rows: [['ログイン'], ['ログアウト'], ['退会']],
      rowIds: [A, B, C],
    });

    const { doc: visible, taken } = splitRowsById(doc, new Set([B]));

    expect(visible.rowIds).toEqual([A, C]);
    expect(taken).toEqual([{ id: B, cells: ['ログアウト'], afterId: A }]);
  });

  it('空の指定なら doc をそのまま返す', () => {
    const doc = makeDoc({ columns: [項目], rows: [['ログイン']], rowIds: [A] });

    const { doc: visible, taken } = splitRowsById(doc, new Set());

    expect(visible).toBe(doc);
    expect(taken).toEqual([]);
  });

  it('文書に無い ID は無視する', () => {
    const doc = makeDoc({ columns: [項目], rows: [['ログイン']], rowIds: [A] });

    expect(splitRowsById(doc, new Set([D])).doc.rows).toEqual([['ログイン']]);
  });

  it('抜いた分をそのまま戻すと元の並びに一致する', () => {
    const doc = makeDoc({
      columns: [項目],
      rows: [['ログイン'], ['ログアウト'], ['退会'], ['再入会']],
      rowIds: [A, B, C, D],
    });

    const { doc: visible, taken } = splitRowsById(doc, new Set([A, C]));

    expect(mergeHiddenRows(visible, taken).rowIds).toEqual([A, B, C, D]);
  });
});
