import { describe, it, expect } from 'vitest';
import { parseRequestEvent, planCloseRequest, planDocumentRequest, waitUntil } from './appRequest';

describe('parseRequestEvent', () => {
  it('画面操作の依頼を読み取る', () => {
    expect(
      parseRequestEvent({ id: 'req-1', action: 'export-pdf', path: 'invoices/INV-1.md' }),
    ).toEqual({ id: 'req-1', action: 'export-pdf', path: 'invoices/INV-1.md' });
  });

  it('文書を開く依頼も読み取る', () => {
    expect(
      parseRequestEvent({ id: 'req-2', action: 'open-document', path: 'specs/design.md' }),
    ).toEqual({ id: 'req-2', action: 'open-document', path: 'specs/design.md' });
  });

  it('一覧の依頼は対象を伴わない', () => {
    // 「何が開いているか」を聞く依頼に対象は無い。path を必須にすると読み飛ばしてしまう。
    expect(parseRequestEvent({ id: 'req-3', action: 'list-documents' })).toEqual({
      id: 'req-3',
      action: 'list-documents',
    });
  });

  it('同意の照会は対象を伴わない', () => {
    // 「このフォルダで script を動かしてよいか」はフォルダそのものへの問いで、
    // 中のどのファイルかは関係ない。
    expect(parseRequestEvent({ id: 'req-5', action: 'trust-status' })).toEqual({
      id: 'req-5',
      action: 'trust-status',
    });
  });

  it('窓を撮る依頼は対象を伴わない', () => {
    // 撮るのは窓そのもので、中のどの文書かは関係ない。
    expect(parseRequestEvent({ id: 'req-6', action: 'capture-window' })).toEqual({
      id: 'req-6',
      action: 'capture-window',
    });
  });

  it('撮る大きさの指定は数のときだけ受け取る', () => {
    // どれだけの大きさなら扱えるかを知っているのは依頼元。指定があれば通す。
    expect(parseRequestEvent({ id: 'req-7', action: 'capture-window', maxEdge: 800 })).toEqual({
      id: 'req-7',
      action: 'capture-window',
      maxEdge: 800,
    });
    // 数でない指定は無かったことにする。ここで断ると、撮れるはずの依頼が
    // 画面へ届かないまま時間切れになる。
    expect(parseRequestEvent({ id: 'req-7', action: 'capture-window', maxEdge: '800' })).toEqual({
      id: 'req-7',
      action: 'capture-window',
    });
  });

  it('閉じる依頼は対象を伴う', () => {
    expect(parseRequestEvent({ id: 'req-4', action: 'close-document', path: 'a.md' })).toEqual({
      id: 'req-4',
      action: 'close-document',
      path: 'a.md',
    });
    // 対象の無い「閉じる」は、どれを閉じてよいか決められない。
    expect(parseRequestEvent({ id: 'req-4', action: 'close-document' })).toBeNull();
  });

  it('形が違う payload は読み飛ばす', () => {
    // サーバーの版が進めば知らない形も来る。読めない依頼で画面を止めない。
    expect(parseRequestEvent(null)).toBeNull();
    expect(parseRequestEvent('x')).toBeNull();
    expect(parseRequestEvent({ id: 'a', action: 'export-pdf' })).toBeNull();
    expect(parseRequestEvent({ id: '', action: 'export-pdf', path: 'a.md' })).toBeNull();
    expect(parseRequestEvent({ id: 'a', action: 'unknown', path: 'a.md' })).toBeNull();
    expect(parseRequestEvent({ id: 'a', action: 'open-document', path: '' })).toBeNull();
  });
});

describe('planDocumentRequest', () => {
  const paths = ['invoices/INV-1.md', 'specs/design.md'];
  const open = { folderName: '経理2026', knownPaths: paths };

  it('開いているフォルダにある文書なら実行できる', () => {
    expect(planDocumentRequest('invoices/INV-1.md', open)).toEqual({
      ok: true,
      path: 'invoices/INV-1.md',
    });
  });

  it('フォルダが開かれていなければ理由を返す', () => {
    // 依頼元は画面の状態を知らないので、何が足りないかを言葉で返す。
    const plan = planDocumentRequest('a.md', { folderName: null, knownPaths: [] });
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error).not.toBe('');
  });

  it('ツリーに無いパスは、今開いているフォルダ名を添えて断る', () => {
    // フォルダ名が無いと、依頼元は「別のフォルダを見ている」ことに気づけない。
    const plan = planDocumentRequest('missing.md', open);
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error).toContain('missing.md');
    expect(plan.error).toContain('経理2026');
  });
});

describe('planCloseRequest', () => {
  const documents = [
    { id: 't1', path: 'invoices/INV-1.md', active: true, unsaved: false },
    { id: 't2', path: 'specs/design.md', active: false, unsaved: false },
  ];

  it('開いている文書なら、その札を指して閉じられる', () => {
    expect(planCloseRequest('specs/design.md', documents)).toEqual({ ok: true, id: 't2' });
  });

  it('開いていない文書は、開いていないことを理由に断る', () => {
    // 存在しない札を黙って無視すると、依頼元は閉じたつもりのまま次へ進む。
    const plan = planCloseRequest('other/memo.md', documents);
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error).toContain('other/memo.md');
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
