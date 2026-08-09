import { describe, it, expect } from 'vitest';
import { opensPickerOnEdit, opensOnSingleClick, type CellClickIntent } from './gridPicker';

/**
 * enum セルの候補リストを「いつ開くか」の決定ロジック。
 * 選択肢が有限な enum だけは 1 クリックで開き、テキスト入力系は従来どおり
 * ダブルクリック / Enter / F2 で編集へ入る。DOM 非依存で RED 先行で検査する。
 */

const click = (over: Partial<CellClickIntent> = {}): CellClickIntent => ({
  button: 0,
  shift: false,
  ctrl: false,
  collapsed: true,
  active: true,
  editable: true,
  mode: 'nav',
  ...over,
});

describe('opensPickerOnEdit', () => {
  it('select は編集へ入った時点で候補リストを開く', () => {
    expect(opensPickerOnEdit('select')).toBe(true);
  });

  it('radio は選択肢が常時見えているので開かない', () => {
    expect(opensPickerOnEdit('radio')).toBe(false);
  });

  it('テキスト入力系・列型なしは開かない', () => {
    expect(opensPickerOnEdit('text')).toBe(false);
    expect(opensPickerOnEdit('multiline')).toBe(false);
    expect(opensPickerOnEdit('number')).toBe(false);
    expect(opensPickerOnEdit('date')).toBe(false);
    expect(opensPickerOnEdit(undefined)).toBe(false);
  });
});

describe('opensOnSingleClick', () => {
  it('select セルはシングルクリックで編集へ入る', () => {
    expect(opensOnSingleClick('select', click())).toBe(true);
  });

  it('テキスト入力系はシングルクリックでは入らない（選択のまま）', () => {
    expect(opensOnSingleClick('text', click())).toBe(false);
    expect(opensOnSingleClick('multiline', click())).toBe(false);
    expect(opensOnSingleClick(undefined, click())).toBe(false);
  });

  it('読み取り専用の文書では入らない', () => {
    expect(opensOnSingleClick('select', click({ editable: false }))).toBe(false);
  });

  it('すでに編集中なら何もしない（ウィジェット自身の操作を奪わない）', () => {
    expect(opensOnSingleClick('select', click({ mode: 'edit' }))).toBe(false);
  });

  it('主ボタン以外（右クリック＝列メニュー）では入らない', () => {
    expect(opensOnSingleClick('select', click({ button: 2 }))).toBe(false);
  });

  it('Shift / Ctrl 併用は範囲選択の操作なので入らない', () => {
    expect(opensOnSingleClick('select', click({ shift: true }))).toBe(false);
    expect(opensOnSingleClick('select', click({ ctrl: true }))).toBe(false);
  });

  it('ドラッグで複数セルを掴んだ離しでは入らない', () => {
    expect(opensOnSingleClick('select', click({ collapsed: false }))).toBe(false);
  });

  it('離した先がアクティブセルでなければ入らない', () => {
    expect(opensOnSingleClick('select', click({ active: false }))).toBe(false);
  });
});
