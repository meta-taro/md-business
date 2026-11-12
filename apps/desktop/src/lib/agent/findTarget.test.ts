// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { accessibleName, findTarget, pickTarget } from './findTarget';

describe('pickTarget', () => {
  const items = [
    { name: 'MCP 設定', el: 'a' },
    { name: 'MCP', el: 'b' },
    { name: '開く MCP', el: 'c' },
  ];

  it('完全一致を最優先する', () => {
    expect(pickTarget(items, 'MCP')?.el).toBe('b');
  });

  it('次に前方一致、最後に部分一致', () => {
    expect(pickTarget(items, 'MCP 設')?.el).toBe('a');
    expect(pickTarget(items, '開く')?.el).toBe('c');
    expect(pickTarget(items, 'く M')?.el).toBe('c');
  });

  it('空白の違いは無視し、無ければ null', () => {
    expect(pickTarget(items, '  MCP\n設定 ')?.el).toBe('a');
    expect(pickTarget(items, '保存')).toBeNull();
  });
});

describe('accessibleName', () => {
  it('aria-label → title → placeholder → 文字の順に読む', () => {
    document.body.innerHTML = `
      <button id="a" aria-label="閉じる" title="x">×</button>
      <button id="b" title="設定">⚙</button>
      <input id="c" placeholder="検索" />
      <button id="d">  保存
        する </button>`;
    const name = (id: string) => accessibleName(document.getElementById(id) as HTMLElement);
    expect(name('a')).toBe('閉じる');
    expect(name('b')).toBe('設定');
    expect(name('c')).toBe('検索');
    expect(name('d')).toBe('保存 する');
  });

  it('入力欄はラベルの文字でも指せる', () => {
    document.body.innerHTML = '<label for="q">絞り込み</label><input id="q" />';
    expect(accessibleName(document.getElementById('q') as HTMLElement)).toBe('絞り込み');
  });
});

describe('findTarget', () => {
  it('見えているものだけから探す', () => {
    document.body.innerHTML = '<button id="hidden">MCP</button><button id="shown">MCP タブ</button>';
    const found = findTarget(document, 'MCP', (el) => el.id !== 'hidden');
    expect(found?.id).toBe('shown');
  });

  it('ボタン以外の飾りの文字は拾わない', () => {
    document.body.innerHTML = '<span>MCP</span>';
    expect(findTarget(document, 'MCP', () => true)).toBeNull();
  });
});
