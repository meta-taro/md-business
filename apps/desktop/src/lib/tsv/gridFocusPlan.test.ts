import { describe, it, expect } from 'vitest';
import { focusSpotKey, planCellFocus, type FocusSpot } from './gridFocusPlan';

const at = (row: number, col: number, editing: boolean): FocusSpot => ({ row, col, editing });

describe('focusSpotKey', () => {
  it('セル位置とモードが同じなら同じ鍵になる', () => {
    expect(focusSpotKey(at(2, 3, true))).toBe(focusSpotKey(at(2, 3, true)));
  });

  it('位置かモードが違えば別の鍵になる', () => {
    const edit = focusSpotKey(at(2, 3, true));
    expect(focusSpotKey(at(2, 3, false))).not.toBe(edit);
    expect(focusSpotKey(at(2, 4, true))).not.toBe(edit);
    expect(focusSpotKey(at(3, 3, true))).not.toBe(edit);
  });
});

describe('planCellFocus', () => {
  it('セルを移った・編集へ入ったときは仕込んで焦点も当てる', () => {
    expect(planCellFocus(at(1, 1, true), null, 'none')).toMatchObject({
      prepare: true,
      takeFocus: true,
    });
    expect(planCellFocus(at(1, 1, true), focusSpotKey(at(1, 1, false)), 'grid')).toMatchObject({
      prepare: true,
      takeFocus: true,
    });
  });

  // 1 文字打つたびに本文が組み直され、この判定が走り直す。ここで仕込み直すと
  // 既存値が全選択され、次の 1 文字で置き換わる（最後の 1 文字しか残らない）。
  it('同じセル・同じモードのまま走り直したときは仕込み直さない', () => {
    const spot = at(4, 2, true);
    const plan = planCellFocus(spot, focusSpotKey(spot), 'grid');
    expect(plan.prepare).toBe(false);
  });

  // エディター側を触っている最中に焦点を奪い返すと、打った文字がグリッドのセルへ入る。
  it('グリッドの外に焦点があるなら、走り直しでは焦点を奪わない', () => {
    const spot = at(4, 2, false);
    expect(planCellFocus(spot, focusSpotKey(spot), 'outside').takeFocus).toBe(false);
  });

  it('グリッド内の別要素（行メモの下書き等）にある焦点も走り直しでは奪わない', () => {
    const spot = at(4, 2, false);
    expect(planCellFocus(spot, focusSpotKey(spot), 'grid').takeFocus).toBe(false);
  });

  // 間引きで行が作り直されると焦点が浮く。ここは拾い直さないと矢印キーが効かなくなる。
  it('どこにも焦点が無ければ走り直しでも拾い直す', () => {
    const spot = at(4, 2, false);
    expect(planCellFocus(spot, focusSpotKey(spot), 'none').takeFocus).toBe(true);
  });

  it('セルを移ったときは外に焦点があっても当てに行く（利用者の明示操作なので）', () => {
    expect(planCellFocus(at(5, 0, false), focusSpotKey(at(4, 0, false)), 'outside').takeFocus).toBe(
      true,
    );
  });

  it('返した鍵をそのまま次回の prepared に使える', () => {
    const spot = at(7, 1, true);
    const first = planCellFocus(spot, null, 'none');
    const second = planCellFocus(spot, first.spot, 'grid');
    expect(second.prepare).toBe(false);
  });

  // 間引きで選択セルの DOM が消えると焦点が浮く。人がスクロールして外したぶんまで
  // 「浮いたから」で取り返すと、戻ってきた瞬間に表示が寄る（スクロールの揺れの一因）。
  it('手放したと分かっているときは、焦点が浮いていても取り返さない', () => {
    const spot = at(500, 0, false);
    const plan = planCellFocus(spot, focusSpotKey(spot), 'none', true);
    expect(plan.takeFocus).toBe(false);
  });

  it('手放していなければ、焦点が浮いたときは従来どおり取り返す', () => {
    const spot = at(500, 0, false);
    expect(planCellFocus(spot, focusSpotKey(spot), 'none', false).takeFocus).toBe(true);
  });

  it('手放していても、選択が動いたなら焦点を当てる', () => {
    const plan = planCellFocus(at(501, 0, false), focusSpotKey(at(500, 0, false)), 'none', true);
    expect(plan.takeFocus).toBe(true);
  });
});
