import { describe, it, expect } from 'vitest';
import type { ParsedHeader } from '@md-business/schema-test-spec-tsv';
import {
  COL_ALIGNS,
  defaultColAlign,
  defaultColAligns,
  setColAlign,
  colAlignMenuItems,
  groupAlign,
  alignStyle,
} from './gridColumnAlign';
import { messages } from '../i18n/messages';

/**
 * 検証グリッドの列寄せ（右クリックで左／中央／右を選べるようにする）。
 * 型付きヘッダ・データセル・大分類の見え方を決める純ロジック。
 */

const col = (
  name: string,
  type: ParsedHeader['type'],
  extra: Partial<ParsedHeader> = {},
): ParsedHeader => ({ name, type, required: false, ...extra });

describe('defaultColAlign', () => {
  it('数値列は右寄せが既定（表計算の慣習）', () => {
    expect(defaultColAlign(col('件数', 'number'))).toBe('right');
  });

  it('それ以外は左寄せが既定', () => {
    expect(defaultColAlign(col('項目', 'text'))).toBe('left');
    expect(defaultColAlign(col('手順', 'multiline_text'))).toBe('left');
    expect(defaultColAlign(col('結果', 'enum', { enumValues: ['〇', '×'] }))).toBe('left');
  });
});

describe('defaultColAligns', () => {
  it('列ごとの既定寄せを順に返す', () => {
    expect(defaultColAligns([col('項目', 'text'), col('件数', 'number')])).toEqual([
      'left',
      'right',
    ]);
  });

  it('列なしは空配列', () => {
    expect(defaultColAligns([])).toEqual([]);
  });
});

describe('setColAlign', () => {
  it('指定列だけ差し替えた新しい配列を返す（入力は不変）', () => {
    const aligns: ReturnType<typeof defaultColAligns> = ['left', 'left', 'right'];
    const next = setColAlign(aligns, 1, 'center');
    expect(next).toEqual(['left', 'center', 'right']);
    expect(aligns).toEqual(['left', 'left', 'right']);
  });

  it('範囲外の列指定は無視する', () => {
    const aligns: ReturnType<typeof defaultColAligns> = ['left', 'right'];
    expect(setColAlign(aligns, 5, 'center')).toBe(aligns);
    expect(setColAlign(aligns, -1, 'center')).toBe(aligns);
  });
});

describe('colAlignMenuItems', () => {
  it('全ての寄せを表示順で返し、現在の寄せに印を付ける', () => {
    const items = colAlignMenuItems('center');
    expect(items.map((i) => i.align)).toEqual([...COL_ALIGNS]);
    expect(items.filter((i) => i.checked).map((i) => i.align)).toEqual(['center']);
  });

  // 文言キーを持たせただけでは、綴りを間違えてもメニューが出るまで気づけない
  // （辞書に無いキーはキー文字列そのものが表示される）。辞書側に実在することまで見る。
  it('どの寄せの文言キーも辞書にある', () => {
    for (const item of colAlignMenuItems('left')) {
      expect(messages.ja[item.labelKey], item.align).toBeTruthy();
    }
  });
});

describe('groupAlign', () => {
  it('所属列の寄せが揃っていればそれに従う', () => {
    expect(groupAlign(['right', 'right', 'left'], 0, 2)).toBe('right');
  });

  it('所属列の寄せが割れていれば中央寄せ（見出しとして無難な側へ倒す）', () => {
    expect(groupAlign(['right', 'left', 'left'], 0, 2)).toBe('center');
  });

  it('1 列だけの大分類はその列の寄せに従う', () => {
    expect(groupAlign(['left', 'center'], 1, 1)).toBe('center');
  });

  it('列が取れない範囲は中央寄せ', () => {
    expect(groupAlign(['left'], 3, 2)).toBe('center');
  });
});

describe('alignStyle', () => {
  it('折り返し（block）と 1 行表示（flex）の両方に効く指定を返す', () => {
    expect(alignStyle('left')).toBe('text-align:left;justify-content:flex-start');
    expect(alignStyle('center')).toBe('text-align:center;justify-content:center');
    expect(alignStyle('right')).toBe('text-align:right;justify-content:flex-end');
  });
});
