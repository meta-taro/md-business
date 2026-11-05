import { describe, it, expect } from 'vitest';
import { editionWarnings } from '../src/index.js';

describe('editionWarnings', () => {
  it('社内版では何も言わない（社内版は全部載せるのが正しい）', () => {
    expect(editionWarnings('参照: src/a.ts:40', 'internal')).toEqual([]);
  });

  it('提出版で囲みの外に残ったソースの場所を知らせる', () => {
    const out = editionWarnings('参照: src/a.ts:40', 'submission');
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('src/a.ts:40');
    expect(out[0]).toContain('::: 社内');
  });

  it('提出版で囲みの外に残ったコミットのハッシュを知らせる', () => {
    const out = editionWarnings('修正は a8f7b79 で入った。', 'submission');
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('a8f7b79');
  });

  it('囲みの中は知らせない', () => {
    expect(editionWarnings('::: 社内\nsrc/a.ts:40\n:::\n', 'submission')).toEqual([]);
  });

  it('閉じていない囲みを知らせる（後ろが文末まで消える）', () => {
    const out = editionWarnings('a\n::: 社内\nb\n', 'submission');
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('閉じていません');
  });

  it('多いときは数件だけ出し、残りは件数で言う', () => {
    const body = Array.from({ length: 8 }, (_, i) => `f${i}.ts:${i + 1}`).join('\n');
    const out = editionWarnings(body, 'submission');
    expect(out.length).toBeLessThan(8);
    expect(out.at(-1)).toContain('ほか');
  });
});
