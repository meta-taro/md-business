// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { createAgentCursor, parseAgent } from './agentCursor';

const instant = () => Promise.resolve();

function setup() {
  return createAgentCursor({ doc: document, wait: instant, visible: () => true });
}

describe('parseAgent', () => {
  it('知らない動作は理由を返す', () => {
    expect(parseAgent({ action: 'drag' })).toEqual({ ok: false, error: '知らない動作です: drag' });
    expect(parseAgent(undefined)).toEqual({ ok: false, error: '動作が指定されていません' });
  });

  it('文字でない指定は無かったことにする', () => {
    expect(parseAgent({ action: 'point', target: 'A', seconds: '3' })).toEqual({
      ok: true,
      agent: { action: 'point', target: 'A' },
    });
  });
});

describe('createAgentCursor', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('押す: 指した文字のボタンを押す', async () => {
    document.body.innerHTML = '<button>MCP</button>';
    let clicked = 0;
    document.querySelector('button')!.addEventListener('click', () => (clicked += 1));
    await expect(setup().run({ action: 'click', target: 'MCP' })).resolves.toEqual({ ok: true });
    expect(clicked).toBe(1);
  });

  it('打つ: 入力欄へ値を入れ、input を知らせる', async () => {
    document.body.innerHTML = '<input placeholder="検索" />';
    const input = document.querySelector('input')!;
    let seen = '';
    input.addEventListener('input', () => (seen = input.value));
    await setup().run({ action: 'type', target: '検索', value: '請求書' });
    expect(seen).toBe('請求書');
  });

  it('見つからない対象は、何が見つからないかを返す', async () => {
    await expect(setup().run({ action: 'click', target: '保存' })).resolves.toEqual({
      ok: false,
      error: '「保存」が画面に見つかりません',
    });
  });

  it('絞り込み: 検索欄が無ければ無いと返す', async () => {
    await expect(setup().run({ action: 'filter', value: 'a' })).resolves.toEqual({
      ok: false,
      error: 'この画面に絞り込みはありません',
    });
  });

  it('話す: 吹き出しに言葉を出す', async () => {
    const cursor = setup();
    await cursor.run({ action: 'say', message: 'ここを見てください' });
    expect(document.querySelector('[data-agent-bubble]')?.textContent).toContain('ここを見てください');
    cursor.destroy();
    expect(document.querySelector('[data-agent-overlay]')).toBeNull();
  });

  it('依頼は 1 つずつ順に動く', async () => {
    document.body.innerHTML = '<button>A</button><button>B</button>';
    const order: string[] = [];
    for (const b of document.querySelectorAll('button')) {
      b.addEventListener('click', () => order.push(b.textContent ?? ''));
    }
    const cursor = setup();
    await Promise.all([
      cursor.run({ action: 'click', target: 'B' }),
      cursor.run({ action: 'click', target: 'A' }),
    ]);
    expect(order).toEqual(['B', 'A']);
  });
});
