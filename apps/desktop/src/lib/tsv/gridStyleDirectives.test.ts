import { describe, expect, it } from 'vitest';
import { readRowTints, rowTintOf } from './gridStyleDirectives';

/** テスト内で頻用する列並び（テンプレートの検証シートを縮めたもの）。 */
const COLUMNS = ['No.', '項目', '結果', '備考'];

describe('readRowTints', () => {
  it('列名と 値=色 の並びを 1 本のルールへ読む', () => {
    const rules = readRowTints(['style 結果 OK=#e4f5e9 NG=#fde8e7'], COLUMNS);

    expect(rules).toHaveLength(1);
    expect(rules[0]?.columnIndex).toBe(2);
    expect(rules[0]?.colors.get('OK')).toBe('#e4f5e9');
    expect(rules[0]?.colors.get('NG')).toBe('#fde8e7');
  });

  it('style 以外のディレクティブは無視する', () => {
    const rules = readRowTints(
      ['note 補足', 'colwidth 0=240', 'group 0-1 概要', 'rowheight 3=60'],
      COLUMNS,
    );

    expect(rules).toEqual([]);
  });

  it('列定義に無い列名を指す指定は捨てる', () => {
    expect(readRowTints(['style 存在しない列 OK=#e4f5e9'], COLUMNS)).toEqual([]);
  });

  it('3 桁の短縮 hex も受け付ける', () => {
    const rules = readRowTints(['style 結果 OK=#cfc'], COLUMNS);

    expect(rules[0]?.colors.get('OK')).toBe('#cfc');
  });

  it('hex 以外の色指定は捨てる（インライン style への差し込みを防ぐ）', () => {
    const rules = readRowTints(
      ['style 結果 OK=red NG=rgb(1,2,3) 保留=#12345 未実施=#e4f5e9;background:url(x)'],
      COLUMNS,
    );

    expect(rules).toEqual([]);
  });

  it('不正な色だけを捨て、同じ行の妥当な指定は残す', () => {
    const rules = readRowTints(['style 結果 OK=#e4f5e9 NG=red'], COLUMNS);

    expect(rules[0]?.colors.get('OK')).toBe('#e4f5e9');
    expect(rules[0]?.colors.has('NG')).toBe(false);
  });

  it('色の指定が 1 件も残らないルールは生成しない', () => {
    expect(readRowTints(['style 結果'], COLUMNS)).toEqual([]);
    expect(readRowTints(['style 結果 OK=red'], COLUMNS)).toEqual([]);
  });

  it('同じ値が重複したら後勝ち', () => {
    const rules = readRowTints(['style 結果 OK=#e4f5e9 OK=#fdf1d6'], COLUMNS);

    expect(rules[0]?.colors.get('OK')).toBe('#fdf1d6');
  });

  it('列名だけの `style` 語や値のない断片で落ちない', () => {
    expect(readRowTints(['style', 'style ', 'styleish 結果 OK=#cfc'], COLUMNS)).toEqual([]);
  });

  it('複数の style 行はそれぞれ独立したルールになる', () => {
    const rules = readRowTints(
      ['style 結果 OK=#e4f5e9', 'style 備考 要確認=#fdf1d6'],
      COLUMNS,
    );

    expect(rules).toHaveLength(2);
    expect(rules[0]?.columnIndex).toBe(2);
    expect(rules[1]?.columnIndex).toBe(3);
  });
});

describe('rowTintOf', () => {
  const rules = readRowTints(['style 結果 OK=#e4f5e9 NG=#fde8e7 保留=#fdf1d6'], COLUMNS);

  it('対象列の値に対応する色を返す', () => {
    expect(rowTintOf(rules, ['1', 'ログイン', 'OK', ''])).toBe('#e4f5e9');
    expect(rowTintOf(rules, ['2', 'ログアウト', 'NG', ''])).toBe('#fde8e7');
    expect(rowTintOf(rules, ['3', '検索', '保留', ''])).toBe('#fdf1d6');
  });

  it('未入力セル・対応色のない値・短い行は色なし', () => {
    expect(rowTintOf(rules, ['4', '一覧', '', ''])).toBeUndefined();
    expect(rowTintOf(rules, ['5', '一覧', '未実施', ''])).toBeUndefined();
    expect(rowTintOf(rules, ['6'])).toBeUndefined();
    expect(rowTintOf(rules, [])).toBeUndefined();
  });

  it('ルールが無ければ常に色なし', () => {
    expect(rowTintOf([], ['1', 'ログイン', 'OK', ''])).toBeUndefined();
  });

  it('複数ルールが当たったら後勝ち', () => {
    const multi = readRowTints(['style 結果 OK=#e4f5e9', 'style 備考 済=#fdf1d6'], COLUMNS);

    expect(rowTintOf(multi, ['1', 'ログイン', 'OK', '済'])).toBe('#fdf1d6');
    expect(rowTintOf(multi, ['1', 'ログイン', 'OK', ''])).toBe('#e4f5e9');
  });
});
