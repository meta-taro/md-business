import { describe, it, expect } from 'vitest';
import {
  MENU_IDS,
  MENU_ITEMS,
  itemsOf,
  isItemEnabled,
  itemToggleState,
  nextMenuId,
  type MenuCaps,
} from './menuBar';

/** 何も開いていない起動直後。ここから 1 つずつ立てて、増えた分だけ押せるようになるかを見る。 */
const idle: MenuCaps = {
  loading: false,
  hasRoot: false,
  canSave: false,
  autosaveOn: true,
  canPdf: false,
  canHtml: false,
  canImage: false,
  imagePicking: false,
  canSite: false,
  canPublish: false,
  browserBusy: false,
  timelineOpen: false,
  trusted: false,
  declaredWeb: false,
  canDeclareWeb: false,
};

describe('メニューの並び', () => {
  it('言葉の数は 3 つ（ヘルプは押すとすぐ開くので数に入れない）', () => {
    expect(MENU_IDS).toEqual(['file', 'export', 'view']);
  });

  it('書き出し系は 1 つのメニューに集まる', () => {
    expect(itemsOf('export')).toEqual([
      'pdf',
      'html',
      'image',
      'site',
      'browser',
      'publish',
    ]);
  });

  it('宣言と許可の口は、フォルダを扱うメニューに置く', () => {
    expect(itemsOf('file')).toEqual([
      'openFolder',
      'save',
      'autosave',
      'webMode',
      'revokeTrust',
    ]);
  });

  it('どの項目もちょうど 1 つのメニューに属する（重複も迷子も作らない）', () => {
    const all = MENU_IDS.flatMap((id) => MENU_ITEMS[id]);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('押せるかどうか', () => {
  it('起動直後でも、フォルダを開く・自動保存・明暗・言語は押せる', () => {
    const enabled = MENU_IDS.flatMap((id) => itemsOf(id)).filter((item) =>
      isItemEnabled(item, idle),
    );
    expect(enabled).toEqual(['openFolder', 'autosave', 'theme', 'language']);
  });

  it('読み込み中はフォルダを開く操作を受け付けない', () => {
    expect(isItemEnabled('openFolder', { ...idle, loading: true })).toBe(false);
  });

  it('保存は、保存できる状態のときだけ押せる', () => {
    expect(isItemEnabled('save', { ...idle, canSave: true })).toBe(true);
  });

  it('画像は、選んでいる最中なら閉じられるように押せたままにする', () => {
    expect(isItemEnabled('image', { ...idle, canImage: false, imagePicking: true })).toBe(true);
  });

  it('ブラウザで開くのは、フォルダを開いてから', () => {
    expect(isItemEnabled('browser', idle)).toBe(false);
    expect(isItemEnabled('browser', { ...idle, hasRoot: true })).toBe(true);
  });

  it('ブラウザ表示は、切り替えの最中は押せない', () => {
    expect(isItemEnabled('browser', { ...idle, hasRoot: true, browserBusy: true })).toBe(false);
  });

  it('出すのは、下見を取れる状態のときだけ押せる', () => {
    expect(isItemEnabled('publish', idle)).toBe(false);
    expect(isItemEnabled('publish', { ...idle, canPublish: true })).toBe(true);
  });

  // 手で書いた宣言があるフォルダでは押せない（アプリから崩さない）。
  it('web モードは、宣言を書き換えられるときだけ押せる', () => {
    expect(isItemEnabled('webMode', { ...idle, hasRoot: true })).toBe(false);
    expect(isItemEnabled('webMode', { ...idle, hasRoot: true, canDeclareWeb: true })).toBe(true);
  });

  // 宣言しているかを印で見せる。押す前に、今どちらなのかが分かる。
  it('web モードは今の状態を印で返す', () => {
    expect(itemToggleState('webMode', idle)).toBe(false);
    expect(itemToggleState('webMode', { ...idle, declaredWeb: true })).toBe(true);
  });

  it('許可の取り消しは、許してあるフォルダでだけ押せる', () => {
    expect(isItemEnabled('revokeTrust', { ...idle, hasRoot: true })).toBe(false);
    expect(isItemEnabled('revokeTrust', { ...idle, hasRoot: true, trusted: true })).toBe(true);
  });

  it('時系列はフォルダを開いてから', () => {
    expect(isItemEnabled('timeline', idle)).toBe(false);
    expect(isItemEnabled('timeline', { ...idle, hasRoot: true })).toBe(true);
  });
});

describe('入り切りの印', () => {
  it('入り切りするものだけ、今どちらかを持つ', () => {
    expect(itemToggleState('autosave', idle)).toBe(true);
    expect(itemToggleState('timeline', { ...idle, timelineOpen: true })).toBe(true);
  });

  it('一度きりの操作は入り切りを持たない（チェック印を出さない）', () => {
    expect(itemToggleState('pdf', idle)).toBe(null);
    // 出しているかどうかは印にしない。押せば開くだけで、止めるものではない。
    expect(itemToggleState('browser', idle)).toBe(null);
    expect(itemToggleState('openFolder', idle)).toBe(null);
    expect(itemToggleState('theme', idle)).toBe(null);
  });
});

describe('左右キーでメニューを渡り歩く', () => {
  it('右で次へ、左で前へ', () => {
    expect(nextMenuId('file', 1)).toBe('export');
    expect(nextMenuId('export', -1)).toBe('file');
  });

  it('端まで来たら反対の端へ回り込む', () => {
    expect(nextMenuId('view', 1)).toBe('file');
    expect(nextMenuId('file', -1)).toBe('view');
  });
});
