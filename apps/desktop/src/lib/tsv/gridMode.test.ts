import { describe, it, expect } from 'vitest';
import { planGridKey } from './gridMode';
import type { CellPos, GridDims } from './gridNav';

/**
 * スプレッドシート同様の「選択（nav）⇄ 編集（edit）」二モードのキー解決（田中さん 2026-07-23 決定）。
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

  it('複数行セルの Enter は改行（pass）、Ctrl+Enter で確定して下', () => {
    expect(planGridKey({ key: 'Enter' }, at(0, 0), dims, { mode: 'edit', multiline: true })).toEqual({
      kind: 'pass',
    });
    expect(planGridKey({ key: 'Enter', ctrl: true }, at(0, 0), dims, { mode: 'edit', multiline: true })).toEqual({
      kind: 'commit-move',
      to: at(1, 0),
    });
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
