import { describe, it, expect } from 'vitest';
import { MemoryDocumentStore, type DocumentStore } from './store.js';
import { parseCliArgs, checkHealth, formatHealth, runInfoCommand, USAGE } from './cli.js';

/**
 * 手元で動きを確かめるための入口。
 *
 * このサーバーは AI クライアントの設定ファイルに書いて使うので、うまく動かないとき
 * 利用者が見られるのは「接続できません」だけになる。設定のどこが悪いのか（パスか、
 * 版か、そもそも起動できていないのか）を切り分ける手立てが要る。
 */

describe('parseCliArgs — 引数の読み取り', () => {
  it('引数が無ければ、そのまま待ち受けに入る', () => {
    expect(parseCliArgs([])).toEqual({ mode: 'serve' });
  });

  it('最初の位置引数はワークスペースの場所として読む', () => {
    expect(parseCliArgs(['/仕事'])).toEqual({ mode: 'serve', root: '/仕事' });
  });

  it('版を尋ねられたら、待ち受けに入らない', () => {
    expect(parseCliArgs(['--version'])).toEqual({ mode: 'version' });
    expect(parseCliArgs(['-v'])).toEqual({ mode: 'version' });
  });

  it('点検は、場所の指定と併せて書ける', () => {
    expect(parseCliArgs(['--health'])).toEqual({ mode: 'health' });
    expect(parseCliArgs(['--health', '/仕事'])).toEqual({ mode: 'health', root: '/仕事' });
    // 設定ファイルの `args` へ後ろから足す書き方も通す。
    expect(parseCliArgs(['/仕事', '--health'])).toEqual({ mode: 'health', root: '/仕事' });
  });

  it('使い方を尋ねられたら、待ち受けに入らない', () => {
    expect(parseCliArgs(['--help'])).toEqual({ mode: 'help' });
    expect(parseCliArgs(['-h'])).toEqual({ mode: 'help' });
  });

  it('知らない指定は、黙って待ち受けに入らず使い方を出す', () => {
    // 待ち受けに入ってしまうと、綴り違いに気づけないまま「動かない」だけが残る。
    expect(parseCliArgs(['--helth'])).toEqual({ mode: 'help', error: '--helth' });
  });
});

/** list / listSheets が必ず失敗する store（読めない場所を指したときの再現）。 */
class UnreadableStore implements DocumentStore {
  async read(): Promise<string> {
    throw new Error('読めません');
  }
  async write(): Promise<void> {
    throw new Error('書けません');
  }
  async exists(): Promise<boolean> {
    return false;
  }
  async list(): Promise<string[]> {
    throw new Error('ENOENT: no such file or directory');
  }
  async listSheets(): Promise<string[]> {
    throw new Error('ENOENT: no such file or directory');
  }
  async listSite(): Promise<string[]> {
    throw new Error('ENOENT: no such file or directory');
  }
  async *lines(): AsyncIterable<string> {
    throw new Error('読めません');
  }
}

describe('checkHealth — 点検', () => {
  const store = new MemoryDocumentStore({
    'docs/請求書.md': '---\nschemaVersion: invoice/v1\n---\n',
    'docs/test-specs/001-login.tsv': '#! md-business:test-spec-tsv/v1\n',
  });

  it('読める場所を指していれば、通る', async () => {
    const report = await checkHealth({ store, root: '/仕事' });
    expect(report.ok).toBe(true);
    expect(report.checks.every((c) => c.ok)).toBe(true);
  });

  it('見つけた数を出す（0 でも失敗にはしない）', async () => {
    const found = await checkHealth({ store, root: '/仕事' });
    expect(found.checks.find((c) => c.name === '文書')?.detail).toContain('1');

    // 空のフォルダを指すのは間違いとは限らない。これから置く場合もある。
    const empty = await checkHealth({ store: new MemoryDocumentStore(), root: '/空' });
    expect(empty.ok).toBe(true);
    expect(empty.checks.find((c) => c.name === '文書')?.ok).toBe(true);
  });

  it('読めない場所を指していたら、落ちずに理由を返す', async () => {
    // ここで例外を投げると、点検そのものが「動かない」側に回ってしまう。
    const report = await checkHealth({ store: new UnreadableStore(), root: '/無い' });
    expect(report.ok).toBe(false);
    const workspace = report.checks.find((c) => c.name === 'ワークスペース');
    expect(workspace?.ok).toBe(false);
    expect(workspace?.detail).toContain('ENOENT');
  });

  it('スキーマが実際に動くところまで確かめる', async () => {
    // 組み込み方によっては、読み込めても検証器を組み立てられないことがある。
    const report = await checkHealth({ store, root: '/仕事' });
    const schemas = report.checks.find((c) => c.name === 'スキーマ');
    expect(schemas?.ok).toBe(true);
    expect(schemas?.detail).toContain('invoice/v1');
  });
});

describe('formatHealth — 点検結果の書き出し', () => {
  it('項目ごとに可否と理由を 1 行で出す', async () => {
    const report = await checkHealth({ store: new MemoryDocumentStore(), root: '/仕事' });
    const text = formatHealth(report);
    expect(text).toContain('/仕事');
    for (const check of report.checks) expect(text).toContain(check.name);
  });

  it('駄目だった項目が字面で分かる', async () => {
    const report = await checkHealth({ store: new UnreadableStore(), root: '/無い' });
    expect(formatHealth(report)).toContain('NG');
  });
});

describe('runInfoCommand — 待ち受けに入らない指定', () => {
  /** 出力を集めて、終了コードと一緒に返す。 */
  async function run(command: Parameters<typeof runInfoCommand>[0], store: DocumentStore) {
    let out = '';
    let err = '';
    const code = await runInfoCommand(command, {
      root: '/仕事',
      store,
      versionLine: 'md-business 0.1.0',
      out: (text) => (out += text),
      err: (text) => (err += text),
    });
    return { code, out, err };
  }

  it('版は、そのまま出して通す', async () => {
    const { code, out } = await run({ mode: 'version' }, new MemoryDocumentStore());
    expect(code).toBe(0);
    expect(out).toBe('md-business 0.1.0\n');
  });

  it('点検が通れば 0、駄目なら 1 で終わる', async () => {
    // 終了コードで分かるようにしておかないと、他の手順から呼べない。
    expect((await run({ mode: 'health' }, new MemoryDocumentStore())).code).toBe(0);
    expect((await run({ mode: 'health' }, new UnreadableStore())).code).toBe(1);
  });

  it('使い方は、そのまま出して通す', async () => {
    const { code, out, err } = await run({ mode: 'help' }, new MemoryDocumentStore());
    expect(code).toBe(0);
    expect(out).toContain('--health');
    expect(err).toBe('');
  });

  it('知らない指定は、字面を添えて 1 で終わる', async () => {
    const { code, out, err } = await run(
      { mode: 'help', error: '--helth' },
      new MemoryDocumentStore(),
    );
    expect(code).toBe(1);
    expect(out).toContain('--health');
    expect(err).toContain('--helth');
  });
});

describe('USAGE — 使い方', () => {
  it('指定できるものが並んでいる', () => {
    for (const flag of ['--version', '--health', '--help']) expect(USAGE).toContain(flag);
  });
});
