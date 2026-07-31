import { describe, it, expect } from 'vitest';
import { parseRequestEvent, planExportPdf, waitUntil } from './appRequest';

describe('parseRequestEvent', () => {
  it('画面操作の依頼を読み取る', () => {
    expect(
      parseRequestEvent({ id: 'req-1', action: 'export-pdf', path: 'invoices/INV-1.md' }),
    ).toEqual({ id: 'req-1', action: 'export-pdf', path: 'invoices/INV-1.md' });
  });

  it('形が違う payload は読み飛ばす', () => {
    // サーバーの版が進めば知らない形も来る。読めない依頼で画面を止めない。
    expect(parseRequestEvent(null)).toBeNull();
    expect(parseRequestEvent('x')).toBeNull();
    expect(parseRequestEvent({ id: 'a', action: 'export-pdf' })).toBeNull();
    expect(parseRequestEvent({ id: '', action: 'export-pdf', path: 'a.md' })).toBeNull();
    expect(parseRequestEvent({ id: 'a', action: 'unknown', path: 'a.md' })).toBeNull();
  });
});

describe('planExportPdf', () => {
  const paths = ['invoices/INV-1.md', 'specs/design.md'];

  it('開いているフォルダにある文書なら実行できる', () => {
    expect(planExportPdf('invoices/INV-1.md', { hasWorkspace: true, knownPaths: paths })).toEqual({
      ok: true,
      path: 'invoices/INV-1.md',
    });
  });

  it('フォルダが開かれていなければ理由を返す', () => {
    // 依頼元は画面の状態を知らないので、何が足りないかを言葉で返す。
    const plan = planExportPdf('a.md', { hasWorkspace: false, knownPaths: [] });
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error).not.toBe('');
  });

  it('ツリーに無いパスは実行しない', () => {
    const plan = planExportPdf('missing.md', { hasWorkspace: true, knownPaths: paths });
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error).toContain('missing.md');
  });
});

describe('waitUntil', () => {
  it('条件が満たされた時点で真を返す', async () => {
    let value = false;
    setTimeout(() => {
      value = true;
    }, 5);
    await expect(waitUntil(() => value, { timeoutMs: 200, stepMs: 1 })).resolves.toBe(true);
  });

  it('時間切れなら偽を返す', async () => {
    // 描画が終わらないまま待ち続けると、依頼元が先に時間切れになる。
    await expect(waitUntil(() => false, { timeoutMs: 20, stepMs: 1 })).resolves.toBe(false);
  });

  it('最初から満たされていれば待たない', async () => {
    await expect(waitUntil(() => true, { timeoutMs: 0, stepMs: 1 })).resolves.toBe(true);
  });
});
