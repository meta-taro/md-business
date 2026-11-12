import { describe, it, expect } from 'vitest';
import { parseAgentAction } from './agentAction.js';

describe('parseAgentAction', () => {
  it('指す・押すは見えている文字で対象を指す', () => {
    expect(parseAgentAction({ action: 'point', target: '保存', message: 'ここです' })).toEqual({
      ok: true,
      agent: { action: 'point', target: '保存', message: 'ここです' },
    });
    expect(parseAgentAction({ action: 'click', target: ' 開く ' })).toEqual({
      ok: true,
      agent: { action: 'click', target: '開く' },
    });
  });

  it('対象の無い指す・押すは断る', () => {
    expect(parseAgentAction({ action: 'click' }).ok).toBe(false);
    expect(parseAgentAction({ action: 'point', target: '   ' }).ok).toBe(false);
  });

  it('打つには対象と値が要る', () => {
    expect(parseAgentAction({ action: 'type', target: '検索' }).ok).toBe(false);
    expect(parseAgentAction({ action: 'type', target: '検索', value: '請求' })).toEqual({
      ok: true,
      agent: { action: 'type', target: '検索', value: '請求' },
    });
  });

  it('話すには言葉が要る', () => {
    expect(parseAgentAction({ action: 'say' }).ok).toBe(false);
    expect(parseAgentAction({ action: 'say', message: 'こんにちは', seconds: 8 })).toEqual({
      ok: true,
      agent: { action: 'say', message: 'こんにちは', seconds: 8 },
    });
  });

  it('移るのはアプリの中の場所だけ', () => {
    // 外の URL へ連れ出すと、利用者は自分の画面がどこへ行ったか分からなくなる。
    expect(parseAgentAction({ action: 'go', hash: 'https://example.com' }).ok).toBe(false);
    expect(parseAgentAction({ action: 'go', hash: '#mcp' })).toEqual({
      ok: true,
      agent: { action: 'go', hash: '#mcp' },
    });
  });

  it('絞り込みの値は空でもよい（空は解除）', () => {
    expect(parseAgentAction({ action: 'filter' })).toEqual({
      ok: true,
      agent: { action: 'filter', value: '' },
    });
  });

  it('長すぎる言葉・範囲外の秒数・知らない動作は断る', () => {
    expect(parseAgentAction({ action: 'say', message: 'あ'.repeat(501) }).ok).toBe(false);
    expect(parseAgentAction({ action: 'say', message: 'a', seconds: 0 }).ok).toBe(false);
    expect(parseAgentAction({ action: 'say', message: 'a', seconds: 61 }).ok).toBe(false);
    expect(parseAgentAction({ action: 'drag', target: 'x' }).ok).toBe(false);
  });
});
