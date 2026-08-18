import { describe, it, expect } from 'vitest';
import { planGridKey } from './gridMode';
import type { CellPos, GridDims } from './gridNav';

/**
 * スプレッドシート同様の「選択（nav）⇄ 編集（edit）」二モードのキー解決。
 * nav: ↑↓←→でセル選択枠が動く。Enter/F2/文字入力で edit へ。
 * edit: キャレット編集。↑↓←→は文字内。Esc で nav へ、Enter で確定して下。
 * DOM 非依存の純ロジックを RED 先行で検査する。
 */

const dims: GridDims = { rows: 3, cols: 3 };
const at = (row: number, col: number): CellPos => ({ row, col });

describe('planGridKey / nav モード', () => {
  it('矢印でセル選択が 1 マス動く', () => {
    expect(planGridKey({ key: 'ArrowDown' }, at(0, 0), dims, { mode: 'nav', multiline: false })).toEqual({
      kind: 'move',
      to: at(1, 0),
    });
    expect(planGridKey({ key: 'ArrowRight' }, at(0, 0), dims, { mode: 'nav', multiline: false })).toEqual({
      kind: 'move',
      to: at(0, 1),
    });
  });

  it('端の矢印は同セルへ move（クランプ・preventDefault 用）', () => {
    expect(planGridKey({ key: 'ArrowUp' }, at(0, 1), dims, { mode: 'nav', multiline: false })).toEqual({
      kind: 'move',
      to: at(0, 1),
    });
  });

  it('Tab は次セルへ、右下端はグリッド外へ委ねる（pass）', () => {
    expect(planGridKey({ key: 'Tab' }, at(0, 0), dims, { mode: 'nav', multiline: false })).toEqual({
      kind: 'move',
      to: at(0, 1),
    });
    expect(planGridKey({ key: 'Tab' }, at(2, 2), dims, { mode: 'nav', multiline: false })).toEqual({
      kind: 'pass',
    });
  });

  it('Enter / F2 は編集開始', () => {
    expect(planGridKey({ key: 'Enter' }, at(1, 1), dims, { mode: 'nav', multiline: false })).toEqual({
      kind: 'edit',
    });
    expect(planGridKey({ key: 'F2' }, at(1, 1), dims, { mode: 'nav', multiline: false })).toEqual({
      kind: 'edit',
    });
  });

  it('Alt+↓ は編集開始（コンボボックスを開く合図）', () => {
    expect(
      planGridKey({ key: 'ArrowDown', alt: true }, at(1, 1), dims, { mode: 'nav', multiline: false }),
    ).toEqual({ kind: 'edit' });
  });

  it('Alt+↑ は移動のまま（開く合図は ↓ だけ）', () => {
    expect(
      planGridKey({ key: 'ArrowUp', alt: true }, at(1, 1), dims, { mode: 'nav', multiline: false }),
    ).toEqual({ kind: 'move', to: at(0, 1) });
  });

  it('印字文字は編集開始（タイプで入る）', () => {
    expect(planGridKey({ key: 'a' }, at(1, 1), dims, { mode: 'nav', multiline: false })).toEqual({
      kind: 'edit',
    });
    expect(planGridKey({ key: '合' }, at(1, 1), dims, { mode: 'nav', multiline: false })).toEqual({
      kind: 'edit',
    });
  });

  it('Ctrl 付きの文字（ショートカット）は編集開始しない', () => {
    expect(planGridKey({ key: 'c', ctrl: true }, at(1, 1), dims, { mode: 'nav', multiline: false })).toEqual({
      kind: 'pass',
    });
  });

  it('Delete / Backspace はセルクリア', () => {
    expect(planGridKey({ key: 'Delete' }, at(1, 1), dims, { mode: 'nav', multiline: false })).toEqual({
      kind: 'clear',
    });
    expect(planGridKey({ key: 'Backspace' }, at(1, 1), dims, { mode: 'nav', multiline: false })).toEqual({
      kind: 'clear',
    });
  });

  it('Home/End は行頭・行末へ、Ctrl+Home は先頭セルへ', () => {
    expect(planGridKey({ key: 'Home' }, at(1, 2), dims, { mode: 'nav', multiline: false })).toEqual({
      kind: 'move',
      to: at(1, 0),
    });
    expect(planGridKey({ key: 'Home', ctrl: true }, at(2, 2), dims, { mode: 'nav', multiline: false })).toEqual({
      kind: 'move',
      to: at(0, 0),
    });
  });

  it('nav の Escape は無効（pass）', () => {
    expect(planGridKey({ key: 'Escape' }, at(1, 1), dims, { mode: 'nav', multiline: false })).toEqual({
      kind: 'pass',
    });
  });

  it('空グリッドでは矢印も pass', () => {
    expect(
      planGridKey({ key: 'ArrowDown' }, at(0, 0), { rows: 0, cols: 0 }, { mode: 'nav', multiline: false }),
    ).toEqual({ kind: 'pass' });
  });
});

describe('planGridKey / edit モード', () => {
  it('Escape は編集をやめて nav へ（cancel）', () => {
    expect(planGridKey({ key: 'Escape' }, at(1, 1), dims, { mode: 'edit', multiline: false })).toEqual({
      kind: 'cancel',
    });
  });

  it('編集中の Alt+↓ はウィジェットへ委ねる（pass）', () => {
    expect(
      planGridKey({ key: 'ArrowDown', alt: true }, at(1, 1), dims, { mode: 'edit', multiline: false }),
    ).toEqual({ kind: 'pass' });
  });

  it('単行セルの Enter は確定して下へ、Shift+Enter は上へ', () => {
    expect(planGridKey({ key: 'Enter' }, at(0, 0), dims, { mode: 'edit', multiline: false })).toEqual({
      kind: 'commit-move',
      to: at(1, 0),
    });
    expect(planGridKey({ key: 'Enter', shift: true }, at(1, 0), dims, { mode: 'edit', multiline: false })).toEqual({
      kind: 'commit-move',
      to: at(0, 0),
    });
  });

  // 表計算ソフトと同じ割り当て。Enter は行がどの型でも確定で、セル内改行は修飾キーを添える。
  it('複数行セルでも修飾なしの Enter は確定して下', () => {
    expect(planGridKey({ key: 'Enter' }, at(0, 0), dims, { mode: 'edit', multiline: true })).toEqual({
      kind: 'commit-move',
      to: at(1, 0),
    });
  });

  // 改行の合図はソフトごとに違う（Alt / Ctrl / Shift）。覚え違いで確定させないよう全部受ける。
  it('複数行セルの Alt+Enter / Ctrl+Enter / Shift+Enter はセル内改行', () => {
    for (const intent of [
      { key: 'Enter', alt: true },
      { key: 'Enter', ctrl: true },
      { key: 'Enter', shift: true },
    ]) {
      expect(planGridKey(intent, at(1, 0), dims, { mode: 'edit', multiline: true })).toEqual({
        kind: 'break',
      });
    }
  });

  // 改行を持てない列で改行を入れると 1 行 1 件が崩れるので、確定として扱う。
  it('単行セルの Alt+Enter / Ctrl+Enter は改行せず確定して下', () => {
    for (const intent of [
      { key: 'Enter', alt: true },
      { key: 'Enter', ctrl: true },
    ]) {
      expect(planGridKey(intent, at(0, 0), dims, { mode: 'edit', multiline: false })).toEqual({
        kind: 'commit-move',
        to: at(1, 0),
      });
    }
  });

  it('最下端の Enter は確定のみで nav へ（cancel）', () => {
    expect(planGridKey({ key: 'Enter' }, at(2, 0), dims, { mode: 'edit', multiline: false })).toEqual({
      kind: 'cancel',
    });
  });

  it('Tab は確定して次セルへ、右下端はグリッド外へ委ねる（pass）', () => {
    expect(planGridKey({ key: 'Tab' }, at(0, 0), dims, { mode: 'edit', multiline: false })).toEqual({
      kind: 'commit-move',
      to: at(0, 1),
    });
    expect(planGridKey({ key: 'Tab' }, at(2, 2), dims, { mode: 'edit', multiline: false })).toEqual({
      kind: 'pass',
    });
  });

  it('矢印・Home/End・印字はテキスト入力へ委ねる（pass）', () => {
    for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'a']) {
      expect(planGridKey({ key }, at(1, 1), dims, { mode: 'edit', multiline: false })).toEqual({
        kind: 'pass',
      });
    }
  });
});

describe('planGridKey の undo / redo', () => {
  const dims: GridDims = { rows: 3, cols: 3 };
  const at = (row: number, col: number): CellPos => ({ row, col });

  // セル入力は value を親から与える制御入力なので、ブラウザ既定の文字 undo は働かない。
  // 編集中でもグリッドの履歴へ回さないと、打ち間違いを戻す手段が無くなる。
  for (const mode of ['nav', 'edit'] as const) {
    it(`${mode} 中の Ctrl+Z は undo`, () => {
      expect(
        planGridKey({ key: 'z', ctrl: true }, at(1, 1), dims, { mode, multiline: false }),
      ).toEqual({ kind: 'undo' });
    });

    it(`${mode} 中の Ctrl+Y と Ctrl+Shift+Z は redo`, () => {
      expect(
        planGridKey({ key: 'y', ctrl: true }, at(1, 1), dims, { mode, multiline: false }),
      ).toEqual({ kind: 'redo' });
      expect(
        planGridKey({ key: 'Z', ctrl: true, shift: true }, at(1, 1), dims, {
          mode,
          multiline: false,
        }),
      ).toEqual({ kind: 'redo' });
    });
  }

  it('修飾なしの z / y は通常のキーとして扱う', () => {
    expect(planGridKey({ key: 'z' }, at(1, 1), dims, { mode: 'nav', multiline: false })).toEqual({
      kind: 'edit',
    });
    expect(planGridKey({ key: 'z' }, at(1, 1), dims, { mode: 'edit', multiline: false })).toEqual({
      kind: 'pass',
    });
  });
});
