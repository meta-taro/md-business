import { describe, it, expect } from 'vitest';
import { seedFromKey, handsOffKey } from './gridEdit';

/**
 * nav→edit で打鍵した文字を「置換編集の種」にするかの純ロジック。
 * テキスト入力系だけが打鍵1文字で置換を始める。DOM 非依存なので node vitest で検査。
 */
describe('seedFromKey', () => {
  it('テキスト入力系は印字1文字をそのまま種として返す', () => {
    for (const kind of ['text', 'url', 'number', 'multiline'] as const) {
      expect(seedFromKey(kind, 'a', false)).toBe('a');
    }
    // 列型なし（未定義）もテキストとして扱う
    expect(seedFromKey(undefined, '5', false)).toBe('5');
  });

  it('select / date / datetime / checkbox / radio は種にしない（値を保持して編集へ）', () => {
    for (const kind of ['select', 'date', 'datetime', 'checkbox', 'radio'] as const) {
      expect(seedFromKey(kind, 'a', false)).toBeNull();
    }
  });

  it('修飾キー付き・非印字キー（複数文字のキー名）は種にしない', () => {
    expect(seedFromKey('text', 'a', true)).toBeNull(); // Ctrl+a
    expect(seedFromKey('text', 'Enter', false)).toBeNull();
    expect(seedFromKey('text', 'F2', false)).toBeNull();
    expect(seedFromKey('text', 'ArrowDown', false)).toBeNull();
  });

  it('日本語1文字・空白も種にする（直接入力の1打鍵）', () => {
    expect(seedFromKey('text', 'あ', false)).toBe('あ');
    expect(seedFromKey('text', ' ', false)).toBe(' ');
  });
});

/**
 * 種にできないウィジェットのうち、打鍵そのものを入力へ渡すもの。
 * 日付系は 1 文字目を握り潰すと「2026」が「0026」になるので、止めずに渡す。
 */
describe('handsOffKey', () => {
  it('日付・日時は印字1文字を入力へ渡す', () => {
    for (const kind of ['date', 'datetime'] as const) {
      expect(handsOffKey(kind, '2', false)).toBe(true);
    }
  });

  it('種にできるテキスト入力系は渡さない（種の仕組みで入る）', () => {
    for (const kind of ['text', 'url', 'number', 'multiline'] as const) {
      expect(handsOffKey(kind, '2', false)).toBe(false);
    }
    expect(handsOffKey(undefined, '2', false)).toBe(false);
  });

  it('選択肢・チェックボックスは渡さない（打鍵で値を作らない）', () => {
    for (const kind of ['select', 'radio', 'checkbox'] as const) {
      expect(handsOffKey(kind, '2', false)).toBe(false);
    }
  });

  it('修飾キー付き・非印字キー・空白は渡さない', () => {
    expect(handsOffKey('date', '2', true)).toBe(false);
    expect(handsOffKey('date', 'Enter', false)).toBe(false);
    expect(handsOffKey('date', 'F2', false)).toBe(false);
    expect(handsOffKey('date', ' ', false)).toBe(false);
  });
});
