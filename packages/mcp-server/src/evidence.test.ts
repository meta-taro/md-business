import { describe, it, expect } from 'vitest';
import { saveEvidence, EVIDENCE_DIR } from './evidence.js';
import { MemoryDocumentStore } from './store.js';

/**
 * 証拠で確かめたいのは 3 つ。
 * 「どこから取ったかが本文に残ること」「上書きで消えないこと」「伏せ字を通ること」。
 */

function base(): Parameters<typeof saveEvidence>[1] {
  return {
    title: 'ログイン失敗の集中',
    tool: 'filter_records',
    sources: ['logs/app.jsonl'],
    body: '05:10 に 12 件',
  };
}

describe('saveEvidence', () => {
  it('番号を振って保存し、報告書から辿れる参照を返す', async () => {
    const store = new MemoryDocumentStore();
    const result = await saveEvidence(store, base());
    if (!result.ok) throw new Error(result.error);
    expect(result.id).toBe('EV-001');
    expect(result.path).toBe(`${EVIDENCE_DIR}/EV-001.md`);
    expect(result.reference).toBe('evidence/EV-001.md');
    expect(await store.exists(result.path)).toBe(true);
  });

  it('出どころと日時を本文に残す', async () => {
    const store = new MemoryDocumentStore();
    const result = await saveEvidence(store, base(), () => Date.parse('2026-08-11T05:00:00Z'));
    if (!result.ok) throw new Error(result.error);
    const saved = await store.read(result.path);
    expect(saved).toContain('title: ログイン失敗の集中');
    expect(saved).toContain('tool: filter_records');
    expect(saved).toContain('logs/app.jsonl');
    expect(saved).toContain('2026-08-11T05:00:00.000Z');
    expect(saved).toContain('05:10 に 12 件');
  });

  it('次の番号を続けて振る', async () => {
    const store = new MemoryDocumentStore({
      [`${EVIDENCE_DIR}/EV-001.md`]: '既にある',
      [`${EVIDENCE_DIR}/EV-007.md`]: '既にある',
    });
    const result = await saveEvidence(store, base());
    if (!result.ok) throw new Error(result.error);
    expect(result.id).toBe('EV-008');
  });

  it('番号を指定できる', async () => {
    const store = new MemoryDocumentStore();
    const result = await saveEvidence(store, { ...base(), id: 'EV-042' });
    if (!result.ok) throw new Error(result.error);
    expect(result.id).toBe('EV-042');
  });

  it('既にある証拠は上書きしない', async () => {
    const store = new MemoryDocumentStore({ [`${EVIDENCE_DIR}/EV-042.md`]: '先にある証拠' });
    const result = await saveEvidence(store, { ...base(), id: 'EV-042' });
    expect(result.ok).toBe(false);
    expect(await store.read(`${EVIDENCE_DIR}/EV-042.md`)).toBe('先にある証拠');
  });

  it('保存する前に伏せ字を通す', async () => {
    const store = new MemoryDocumentStore();
    const result = await saveEvidence(store, {
      ...base(),
      body: 'taro@example.com が 12 回失敗',
    });
    if (!result.ok) throw new Error(result.error);
    const saved = await store.read(result.path);
    expect(saved).not.toContain('taro@example.com');
    expect(result.masked.email).toBe(1);
  });

  it('覚え書きを付けられる', async () => {
    const store = new MemoryDocumentStore();
    const result = await saveEvidence(store, { ...base(), note: '所見 2 の根拠' });
    if (!result.ok) throw new Error(result.error);
    expect(await store.read(result.path)).toContain('所見 2 の根拠');
  });

  it('本文が空なら断る', async () => {
    const store = new MemoryDocumentStore();
    const result = await saveEvidence(store, { ...base(), body: '   ' });
    expect(result.ok).toBe(false);
  });

  it('出どころが無ければ断る', async () => {
    const store = new MemoryDocumentStore();
    const result = await saveEvidence(store, { ...base(), sources: [] });
    expect(result.ok).toBe(false);
  });

  it('ワークスペースの外を出どころにできない', async () => {
    const store = new MemoryDocumentStore();
    const result = await saveEvidence(store, { ...base(), sources: ['../secret.jsonl'] });
    expect(result.ok).toBe(false);
  });

  it('番号の形が違えば断る（置き場の名前を壊させない）', async () => {
    const store = new MemoryDocumentStore();
    const result = await saveEvidence(store, { ...base(), id: '../../etc/passwd' });
    expect(result.ok).toBe(false);
  });
});
