import { describe, it, expect } from 'vitest';
import { safeRelativePath } from './workspacePath.js';

/**
 * ワークスペース・パス安全ガード（Issue 004 Phase 2・MCP P0 の土台）。
 *
 * MCP サーバーは AI エージェントから渡された相対パスでローカルファイルを
 * read / create / update する。エージェント（または介在するプロンプト）が
 * `../../etc/passwd` のような越境パスを渡してもワークスペース外へ出さないことを
 * fs に触れず純ロジックで保証する。OS 非依存で決定的に検証できるよう、絶対パス
 * 解決（path.resolve のドライブレター差異）に依存しない正規化にしている。
 */
describe('safeRelativePath', () => {
  it('通常の相対パスを POSIX 正規形へ整える', () => {
    const r = safeRelativePath('expenses/2026-07/receipt-001.md');
    expect(r).toEqual({ ok: true, relative: 'expenses/2026-07/receipt-001.md' });
  });

  it('バックスラッシュ区切りを / へ正規化する', () => {
    const r = safeRelativePath('expenses\\2026-07\\a.md');
    expect(r).toEqual({ ok: true, relative: 'expenses/2026-07/a.md' });
  });

  it('先頭 ./ と重複スラッシュ・中間の . を畳む', () => {
    const r = safeRelativePath('./docs//specs/./a.md');
    expect(r).toEqual({ ok: true, relative: 'docs/specs/a.md' });
  });

  it('ワークスペース内で解決できる .. は畳む', () => {
    const r = safeRelativePath('docs/specs/../a.md');
    expect(r).toEqual({ ok: true, relative: 'docs/a.md' });
  });

  it('空文字・空白のみは拒否する', () => {
    expect(safeRelativePath('').ok).toBe(false);
    expect(safeRelativePath('   ').ok).toBe(false);
  });

  it('POSIX 絶対パスを拒否する', () => {
    const r = safeRelativePath('/etc/passwd');
    expect(r.ok).toBe(false);
  });

  it('Windows ドライブレター絶対パスを拒否する', () => {
    expect(safeRelativePath('C:\\Windows\\system32').ok).toBe(false);
    expect(safeRelativePath('c:/Windows').ok).toBe(false);
  });

  it('UNC パスを拒否する', () => {
    expect(safeRelativePath('\\\\server\\share\\a.md').ok).toBe(false);
  });

  it('ルートを飛び出す .. を拒否する', () => {
    expect(safeRelativePath('../secrets.md').ok).toBe(false);
    expect(safeRelativePath('docs/../../escape.md').ok).toBe(false);
  });

  it('. や .. のみに畳まれる入力は拒否する', () => {
    expect(safeRelativePath('.').ok).toBe(false);
    expect(safeRelativePath('docs/..').ok).toBe(false);
  });

  it('拒否時は日本語の理由を返す', () => {
    const r = safeRelativePath('../x');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(typeof r.reason).toBe('string');
  });
});
