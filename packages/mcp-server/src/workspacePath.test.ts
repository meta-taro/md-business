import { describe, it, expect } from 'vitest';
import { safeRelativePath } from './workspacePath.js';

/**
 * ワークスペース・パス安全ガード（MCP P0 の土台）。
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

/**
 * Windows 実機（Windows 11 / Node 22）で確認した挙動に基づく拒否条件。
 *
 * - `a.md:x` は書き込みも読み出しも成功するが、ファイル一覧には `a.md` しか現れない
 *   （NTFS の代替データストリームへ入るため）。書いた内容がアプリから見えない文書に
 *   なるので受け付けない。
 * - `CON.md` / `NUL.md` などは実ファイルとして作られ内容も読めるが、エクスプローラや
 *   多くのエディタから開けず削除もしづらい。利用者が扱えない文書を作らせない。
 *
 * どちらもワークスペース外へ抜ける経路ではない。判定は OS を見ずに常に同じにする
 * （macOS で作った文書が Windows で開けない、を防ぐため）。
 */
describe('safeRelativePath — 扱えない名前', () => {
  it('代替データストリーム指定（コロン）を拒否する', () => {
    expect(safeRelativePath('a.md:x').ok).toBe(false);
    expect(safeRelativePath('docs/a.md::$DATA').ok).toBe(false);
    expect(safeRelativePath('docs:hidden/a.md').ok).toBe(false);
  });

  it('予約デバイス名を拒否する（拡張子の有無・大文字小文字を問わない）', () => {
    expect(safeRelativePath('CON').ok).toBe(false);
    expect(safeRelativePath('con.md').ok).toBe(false);
    expect(safeRelativePath('docs/NUL.md').ok).toBe(false);
    expect(safeRelativePath('COM1.md').ok).toBe(false);
    expect(safeRelativePath('lpt9.tsv').ok).toBe(false);
    expect(safeRelativePath('PRN/a.md').ok).toBe(false);
  });

  it('予約語を含むだけの普通の名前は通す', () => {
    expect(safeRelativePath('console.md').ok).toBe(true);
    expect(safeRelativePath('docs/contract.md').ok).toBe(true);
    expect(safeRelativePath('COM10.md').ok).toBe(true);
    expect(safeRelativePath('nullable.md').ok).toBe(true);
  });
});
