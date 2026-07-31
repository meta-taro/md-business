import { describe, it, expect } from 'vitest';
import { buildToolLogEntry } from './toolLog.js';

/**
 * buildToolLogEntry はツール結果 + 引数パス + 時刻から 1 件のログ entry を組む純関数。
 * 副作用（発火）は server 側が持ち、ここは「どんな entry になるか」だけを決める。
 */
describe('buildToolLogEntry', () => {
  it('成功結果は ok=true・result.path を採用し detail を持たない', () => {
    const entry = buildToolLogEntry(
      'read_document',
      { ok: true, path: 'invoices/INV-9.md' },
      'invoices/INV-9.md',
      1000,
    );
    expect(entry).toEqual({
      type: 'log',
      tool: 'read_document',
      ok: true,
      ts: 1000,
      path: 'invoices/INV-9.md',
    });
    expect('detail' in entry).toBe(false);
  });

  it('失敗結果は ok=false・argPath を採用し error を detail に載せる', () => {
    const entry = buildToolLogEntry(
      'read_document',
      { ok: false, error: 'ファイルが見つかりません: missing.md' },
      'missing.md',
      2000,
    );
    expect(entry).toEqual({
      type: 'log',
      tool: 'read_document',
      ok: false,
      ts: 2000,
      path: 'missing.md',
      detail: 'ファイルが見つかりません: missing.md',
    });
  });

  it('result.path が argPath より優先される', () => {
    const entry = buildToolLogEntry(
      'create_document',
      { ok: true, path: 'invoices/normalized.md' },
      'invoices/../invoices/normalized.md',
      3000,
    );
    expect(entry.path).toBe('invoices/normalized.md');
  });

  it('パスの無いツール（list_schemas 等）は path フィールドを持たない', () => {
    const entry = buildToolLogEntry('list_schemas', { ok: true }, undefined, 4000);
    expect(entry).toEqual({ type: 'log', tool: 'list_schemas', ok: true, ts: 4000 });
    expect('path' in entry).toBe(false);
  });

  // git_diff はパス省略時に path:null（＝ワークスペース全体）を返す。
  it('result.path が null の結果は path フィールドを持たない', () => {
    const entry = buildToolLogEntry('git_diff', { ok: true, path: null }, undefined, 5000);
    expect('path' in entry).toBe(false);
  });

  it('ts はそのまま透過する（時刻は呼び出し側が確定）', () => {
    expect(buildToolLogEntry('search_documents', { ok: true }, undefined, 42).ts).toBe(42);
  });
});
