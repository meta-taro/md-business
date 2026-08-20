import { describe, it, expect, vi } from 'vitest';
import { createAppBridge } from './appBridge.js';
import type { RequestEvent } from './control.js';

/** 送った依頼を控え、応答は手動で返すテスト用の配線。 */
function setup(timeoutMs?: number) {
  const sent: RequestEvent[] = [];
  const bridge = createAppBridge({
    send: (event) => sent.push(event),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
  });
  return { sent, bridge };
}

describe('createAppBridge', () => {
  it('依頼を id つきで送り、応答が来るまで解決しない', async () => {
    const { sent, bridge } = setup();
    let settled = false;
    const promise = bridge.request({ action: 'export-pdf', path: 'invoices/INV-1.md' });
    void promise.then(() => {
      settled = true;
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      type: 'request',
      action: 'export-pdf',
      path: 'invoices/INV-1.md',
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    bridge.settle({ type: 'response', id: sent[0]?.id ?? '', ok: true });
    await expect(promise).resolves.toEqual({ ok: true });
  });

  it('対象を持たない依頼は path を付けずに送る', async () => {
    // 「何が開いているか」を聞く依頼に対象は無い。空文字を入れると、アプリ側で
    // 「空パスの文書」を探しにいってしまう。
    const { sent, bridge } = setup();
    const promise = bridge.request({ action: 'list-documents' });
    expect(sent[0]).toMatchObject({ type: 'request', action: 'list-documents' });
    expect('path' in (sent[0] ?? {})).toBe(false);
    bridge.settle({ type: 'response', id: sent[0]?.id ?? '', ok: true });
    await promise;
  });

  it('応答が持ち帰った中身を呼び出し側へ渡す', async () => {
    const { sent, bridge } = setup();
    const promise = bridge.request({ action: 'list-documents' });
    bridge.settle({
      type: 'response',
      id: sent[0]?.id ?? '',
      ok: true,
      data: { documents: [{ path: 'a.md' }] },
    });
    await expect(promise).resolves.toEqual({ ok: true, data: { documents: [{ path: 'a.md' }] } });
  });

  it('失敗の応答は理由をそのまま返す', async () => {
    const { sent, bridge } = setup();
    const promise = bridge.request({ action: 'export-pdf', path: 'a.md' });
    bridge.settle({ type: 'response', id: sent[0]?.id ?? '', ok: false, error: '文書を開けません' });
    await expect(promise).resolves.toEqual({ ok: false, error: '文書を開けません' });
  });

  it('理由の無い失敗にも説明を付ける', async () => {
    const { sent, bridge } = setup();
    const promise = bridge.request({ action: 'export-pdf', path: 'a.md' });
    bridge.settle({ type: 'response', id: sent[0]?.id ?? '', ok: false });
    const result = await promise;
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).not.toBe('');
  });

  it('依頼ごとに id が変わる', async () => {
    const { sent, bridge } = setup();
    void bridge.request({ action: 'export-pdf', path: 'a.md' });
    void bridge.request({ action: 'export-pdf', path: 'b.md' });
    expect(sent[0]?.id).not.toBe(sent[1]?.id);
    bridge.settle({ type: 'response', id: sent[0]?.id ?? '', ok: true });
    bridge.settle({ type: 'response', id: sent[1]?.id ?? '', ok: true });
  });

  it('応答が来なければ待ち続けずに時間切れで返す', async () => {
    // アプリが落ちていたり画面が応答しない場合、ツールが永久に返らないと使い物にならない。
    vi.useFakeTimers();
    try {
      const { bridge } = setup(50);
      const promise = bridge.request({ action: 'export-pdf', path: 'a.md' });
      await vi.advanceTimersByTimeAsync(60);
      const result = await promise;
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toContain('応答');
    } finally {
      vi.useRealTimers();
    }
  });

  it('時間切れの後に届いた応答は捨てる', async () => {
    vi.useFakeTimers();
    try {
      const { sent, bridge } = setup(50);
      const promise = bridge.request({ action: 'export-pdf', path: 'a.md' });
      await vi.advanceTimersByTimeAsync(60);
      await promise;
      // 二重解決になれば例外になる。落ちずに無視できることを確かめる。
      expect(() => bridge.settle({ type: 'response', id: sent[0]?.id ?? '', ok: true })).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });

  it('知らない id の応答は無視する', () => {
    const { bridge } = setup();
    expect(() => bridge.settle({ type: 'response', id: 'unknown', ok: true })).not.toThrow();
  });
});
