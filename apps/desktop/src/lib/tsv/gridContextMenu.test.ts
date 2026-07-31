import { describe, it, expect } from 'vitest';
import { keepsNativeContextMenu } from './gridContextMenu.js';

/**
 * グリッド上の右クリックで、WebView 既定のメニューを残すかどうかの判定。
 * 文字入力中だけは既定のメニュー（切り取り／コピー／貼り付け）に価値があるので残し、
 * それ以外は抑止する（「戻る」「名前を付けて保存」「印刷」は表計算の操作ではない）。
 */
describe('keepsNativeContextMenu', () => {
  it('文字入力の上では残す（貼り付けの導線を消さないため）', () => {
    expect(keepsNativeContextMenu({ tagName: 'INPUT', isContentEditable: false })).toBe(true);
    expect(keepsNativeContextMenu({ tagName: 'TEXTAREA', isContentEditable: false })).toBe(true);
    expect(keepsNativeContextMenu({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });

  it('小文字のタグ名でも同じ判定になる', () => {
    // 対象の取り方によって tagName の大小が揺れても挙動を変えない。
    expect(keepsNativeContextMenu({ tagName: 'input', isContentEditable: false })).toBe(true);
  });

  it('セル・ヘッダ・余白では抑止する', () => {
    expect(keepsNativeContextMenu({ tagName: 'TD', isContentEditable: false })).toBe(false);
    expect(keepsNativeContextMenu({ tagName: 'TH', isContentEditable: false })).toBe(false);
    expect(keepsNativeContextMenu({ tagName: 'DIV', isContentEditable: false })).toBe(false);
    expect(keepsNativeContextMenu({ tagName: 'BUTTON', isContentEditable: false })).toBe(false);
  });

  it('対象を取れないときは抑止する', () => {
    // right クリック元が失われた場合、既定メニューを出すより出さない方が実害が小さい。
    expect(keepsNativeContextMenu(null)).toBe(false);
  });
});
