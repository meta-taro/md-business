import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { FileDocumentStore } from './fileStore.js';

/**
 * 書き込み中断を再現するための差し込み口。`partial` の間は要求された内容の前半だけを
 * 書いて例外を投げる（ディスク満杯・プロセス強制終了で起きる「中途半端なファイル」）。
 * vi.mock のファクトリはホイストされるため vi.hoisted で先に用意する。
 */
const writeControl = vi.hoisted(() => ({
  mode: 'normal' as 'normal' | 'partial',
  /** writeFile が実際に受け取ったパス（一時ファイル名の規則を検査するため）。 */
  targets: [] as string[],
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    writeFile: async (path: never, data: never, options: never) => {
      writeControl.targets.push(String(path));
      if (writeControl.mode !== 'partial') return actual.writeFile(path, data, options);
      const text = String(data);
      await actual.writeFile(path, text.slice(0, Math.ceil(text.length / 2)), options);
      throw new Error('書き込みを中断しました（テスト）');
    },
  };
});

/**
 * FileDocumentStore は DocumentStore の本番実装（node:fs）。ここだけ実ファイル I/O を
 * temp ディレクトリ相手に検証する（MemoryDocumentStore で契約は担保済みなので、
 * fs 特有の点＝相対パス解決・root 逸脱防御・再帰 list・親ディレクトリ生成を見る）。
 */
describe('FileDocumentStore', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mdbiz-store-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('write した内容を read で取り出せる（親ディレクトリ自動生成）', async () => {
    const store = new FileDocumentStore(root);
    await store.write('invoices/new.md', '# 請求書');
    expect(await store.read('invoices/new.md')).toBe('# 請求書');
  });

  it('存在しない read は reject する', async () => {
    const store = new FileDocumentStore(root);
    await expect(store.read('nope.md')).rejects.toThrow();
  });

  it('exists は有無を返す', async () => {
    const store = new FileDocumentStore(root);
    expect(await store.exists('x.md')).toBe(false);
    await store.write('x.md', '');
    expect(await store.exists('x.md')).toBe(true);
  });

  it('list は .md を再帰収集し / 区切りの相対パスでソートして返す', async () => {
    await mkdir(join(root, 'a', 'b'), { recursive: true });
    await writeFile(join(root, 'z.md'), '');
    await writeFile(join(root, 'a', 'm.md'), '');
    await writeFile(join(root, 'a', 'b', 'deep.md'), '');
    await writeFile(join(root, 'a', 'ignore.txt'), ''); // .md 以外は無視
    const store = new FileDocumentStore(root);
    expect(await store.list()).toEqual(['a/b/deep.md', 'a/m.md', 'z.md']);
  });

  it('listSheets は .tsv を再帰収集し、文書とは混ぜない', async () => {
    // シートの一覧が取れないと、エージェントはパスを教わるまで検証シートに触れられない。
    await mkdir(join(root, 'sheets'), { recursive: true });
    await writeFile(join(root, 'z.tsv'), '');
    await writeFile(join(root, 'sheets', 'a.tsv'), '');
    await writeFile(join(root, 'sheets', 'note.md'), '');
    const store = new FileDocumentStore(root);
    expect(await store.listSheets()).toEqual(['sheets/a.tsv', 'z.tsv']);
    expect(await store.list()).toEqual(['sheets/note.md']);
  });

  it('listSite は文書・検証シート以外を集め、生成物と隠しフォルダは覗かない', async () => {
    // node_modules や dist まで並べると、書いた覚えのないファイルで一覧が埋まる。
    await mkdir(join(root, 'assets'), { recursive: true });
    await mkdir(join(root, 'node_modules', 'pkg'), { recursive: true });
    await mkdir(join(root, 'dist'), { recursive: true });
    await mkdir(join(root, '.git'), { recursive: true });
    await writeFile(join(root, 'index.html'), '');
    await writeFile(join(root, 'assets', 'app.js'), '');
    await writeFile(join(root, 'note.md'), '');
    await writeFile(join(root, 'node_modules', 'pkg', 'lib.js'), '');
    await writeFile(join(root, 'dist', 'index.html'), '');
    await writeFile(join(root, '.git', 'config'), '');
    const store = new FileDocumentStore(root);
    expect(await store.listSite()).toEqual(['assets/app.js', 'index.html']);
  });

  it('list は生成物フォルダと隠しフォルダの .md を覗かない', async () => {
    // 依存パッケージの README が業務文書として並ぶと、一覧が読み物として使えなくなる。
    // 除外の考え方は listSite と同じものを使う（同じフォルダに 2 通りの答えを作らない）。
    await mkdir(join(root, 'docs'), { recursive: true });
    await mkdir(join(root, 'node_modules', 'pkg'), { recursive: true });
    await mkdir(join(root, 'dist'), { recursive: true });
    await mkdir(join(root, 'build'), { recursive: true });
    await mkdir(join(root, '.git'), { recursive: true });
    await writeFile(join(root, 'docs', 'spec.md'), '');
    await writeFile(join(root, 'node_modules', 'pkg', 'README.md'), '');
    await writeFile(join(root, 'dist', 'out.md'), '');
    await writeFile(join(root, 'build', 'out.md'), '');
    await writeFile(join(root, '.git', 'note.md'), '');
    const store = new FileDocumentStore(root);
    expect(await store.list()).toEqual(['docs/spec.md']);
  });

  it('listSheets は生成物フォルダと隠しフォルダの .tsv を覗かない', async () => {
    await mkdir(join(root, 'docs', 'test-specs'), { recursive: true });
    await mkdir(join(root, 'node_modules', 'pkg', 'fixtures'), { recursive: true });
    await mkdir(join(root, '.cache'), { recursive: true });
    await writeFile(join(root, 'docs', 'test-specs', '001-login.tsv'), '');
    await writeFile(join(root, 'node_modules', 'pkg', 'fixtures', 'sample.tsv'), '');
    await writeFile(join(root, '.cache', 'x.tsv'), '');
    const store = new FileDocumentStore(root);
    expect(await store.listSheets()).toEqual(['docs/test-specs/001-login.tsv']);
  });

  it('excludedCount は一覧から外した .md / .tsv を数える', async () => {
    // 件数が思ったより少ないときに、除外のせいなのかを見分けられるようにする。
    await mkdir(join(root, 'node_modules', 'pkg'), { recursive: true });
    await mkdir(join(root, '.git'), { recursive: true });
    await writeFile(join(root, 'spec.md'), '');
    await writeFile(join(root, 'node_modules', 'pkg', 'README.md'), '');
    await writeFile(join(root, 'node_modules', 'pkg', 'CHANGELOG.md'), '');
    await writeFile(join(root, 'node_modules', 'pkg', 'data.tsv'), '');
    await writeFile(join(root, 'node_modules', 'pkg', 'lib.js'), ''); // 文書ではないので数えない
    await writeFile(join(root, '.git', 'note.md'), '');
    const store = new FileDocumentStore(root);
    expect(await store.excludedCount()).toBe(4);
  });

  it('root 外へ逃げる相対パスは拒否する（多重防御）', async () => {
    const store = new FileDocumentStore(root);
    await expect(store.read('../escape.md')).rejects.toThrow();
    await expect(store.write('../escape.md', 'x')).rejects.toThrow();
  });
});

/**
 * Windows の symlink は作成に権限が要るが、ディレクトリ junction は権限なしで作れる。
 * リンクを作れない環境（権限のない CI など）では、検査せず黙って緑になるのを避けるため
 * describe ごと skip する。
 */
const linkType = process.platform === 'win32' ? 'junction' : 'dir';
const canLink = await (async () => {
  const probe = await mkdtemp(join(tmpdir(), 'mdbiz-link-probe-'));
  try {
    await mkdir(join(probe, 'target'));
    await symlink(join(probe, 'target'), join(probe, 'link'), linkType);
    return true;
  } catch {
    return false;
  } finally {
    await rm(probe, { recursive: true, force: true });
  }
})();

/**
 * 相対パスに `..` が無くても、root 配下にリンクが 1 本あればその先は root の外。
 * 字句上のパス比較だけでは踏み抜けるので、実パス（リンク解決後）で判定する。
 */
describe.skipIf(!canLink)('FileDocumentStore — リンク越しの root 逸脱', () => {
  let root: string;
  let outside: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mdbiz-link-root-'));
    outside = await mkdtemp(join(tmpdir(), 'mdbiz-link-out-'));
    await writeFile(join(outside, 'secret.md'), '外の秘密');
    await symlink(outside, join(root, 'link'), linkType);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  it('リンク越しの read を拒否する', async () => {
    const store = new FileDocumentStore(root);
    await expect(store.read('link/secret.md')).rejects.toThrow(/ワークスペース外/);
  });

  it('リンク越しの write を拒否する', async () => {
    const store = new FileDocumentStore(root);
    await expect(store.write('link/planted.md', '外へ書く')).rejects.toThrow(/ワークスペース外/);
    expect(await readdir(outside)).toEqual(['secret.md']);
  });

  it('リンク越しの write は root 外にディレクトリも作らない', async () => {
    // 検査の前に mkdir すると、拒否したはずの経路で外にフォルダだけが残る。
    const store = new FileDocumentStore(root);
    await expect(store.write('link/sub/deep/planted.md', '外へ書く')).rejects.toThrow();
    expect(await readdir(outside)).toEqual(['secret.md']);
  });

  it('リンク越しの exists は false を返す', async () => {
    const store = new FileDocumentStore(root);
    expect(await store.exists('link/secret.md')).toBe(false);
  });
});

/**
 * root 自体がリンクである場合（macOS の `/tmp` → `/private/tmp` など）、
 * 実パスに直すと root 文字列とは一致しなくなる。root 側も同じ解決を通さないと、
 * 正当な読み書きまで「root 外」と誤判定して全部落ちる。
 */
describe.skipIf(!canLink)('FileDocumentStore — root 自体がリンク', () => {
  let real: string;
  let linked: string;

  beforeEach(async () => {
    const base = await mkdtemp(join(tmpdir(), 'mdbiz-link-self-'));
    real = join(base, 'real');
    linked = join(base, 'linked');
    await mkdir(real);
    await symlink(real, linked, linkType);
  });

  afterEach(async () => {
    await rm(dirname(real), { recursive: true, force: true });
  });

  it('リンク経由の root でも通常どおり読み書きできる', async () => {
    const store = new FileDocumentStore(linked);
    await store.write('docs/a.md', '本文');
    expect(await store.read('docs/a.md')).toBe('本文');
    expect(await store.exists('docs/a.md')).toBe(true);
    expect(await store.list()).toEqual(['docs/a.md']);
  });
});

/**
 * 行単位の書き込み（検証シート）は「全文を読んで全文を書き戻す」形なので、上書きの
 * 途中で落ちると 1 回でシート全体を失いうる。一時ファイルへ書いてから rename で
 * 差し替えることで、元ファイルは差し替わるまで最後まで元の内容のまま残す。
 */
describe('FileDocumentStore — 上書きの原子性', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mdbiz-atomic-'));
    writeControl.targets = [];
  });

  afterEach(async () => {
    writeControl.mode = 'normal';
    await rm(root, { recursive: true, force: true });
  });

  it('書き込みが途中で失敗しても元の内容が残る', async () => {
    const store = new FileDocumentStore(root);
    await store.write('sheet.tsv', '元の内容');

    writeControl.mode = 'partial';
    await expect(store.write('sheet.tsv', '新しい内容をここへ書き込む')).rejects.toThrow();

    writeControl.mode = 'normal';
    expect(await store.read('sheet.tsv')).toBe('元の内容');
  });

  it('失敗しても一時ファイルを残さない', async () => {
    const store = new FileDocumentStore(root);
    await store.write('sheet.tsv', '元の内容');

    writeControl.mode = 'partial';
    await expect(store.write('sheet.tsv', '新しい内容をここへ書き込む')).rejects.toThrow();

    writeControl.mode = 'normal';
    expect(await readdir(root)).toEqual(['sheet.tsv']);
  });

  it('成功時も一時ファイルを残さない', async () => {
    const store = new FileDocumentStore(root);
    await store.write('doc.md', '一度目');
    await store.write('doc.md', '二度目');

    expect(await readdir(root)).toEqual(['doc.md']);
    expect(await store.read('doc.md')).toBe('二度目');
  });

  it('一時ファイルは同じディレクトリに置き、監視対象の拡張子にしない', async () => {
    const store = new FileDocumentStore(root);
    await store.write('sub/doc.md', '本文');

    // 実際に書いた先は目的のファイルではなく、同ディレクトリの一時ファイル。
    // デスクトップのファイル監視は .md / .tsv しか拾わないので、途中経過が
    // ファイル一覧に一瞬現れないよう拡張子を外す。
    const written = writeControl.targets.at(-1) ?? '';
    expect(dirname(written)).toBe(join(root, 'sub'));
    expect(written.endsWith('.md')).toBe(false);
    expect(written.endsWith('.tsv')).toBe(false);
  });

  /**
   * 調査対象のログは全文を文字列にできない大きさになりうる。lines は行単位で流し、
   * 読み終えた行を捨てながら進む。ここで見るのは fs 特有の点（改行の扱いと root 逸脱）。
   */
  describe('lines', () => {
    async function collect(source: AsyncIterable<string>): Promise<string[]> {
      const out: string[] = [];
      for await (const line of source) out.push(line);
      return out;
    }

    it('改行文字を含まない行を順に流す（末尾の改行で空行を増やさない）', async () => {
      const store = new FileDocumentStore(root);
      await writeFile(join(root, 'app.log'), 'one\ntwo\nthree\n', 'utf8');
      expect(await collect(store.lines('app.log'))).toEqual(['one', 'two', 'three']);
    });

    it('CRLF でも同じ結果になる', async () => {
      const store = new FileDocumentStore(root);
      await writeFile(join(root, 'win.log'), 'one\r\ntwo\r\n', 'utf8');
      expect(await collect(store.lines('win.log'))).toEqual(['one', 'two']);
    });

    it('root 逸脱を拒否する', async () => {
      const store = new FileDocumentStore(root);
      await expect(collect(store.lines('../outside.log'))).rejects.toThrow(/ワークスペース外/);
    });

    it('シンボリックリンク越しの読み出しも拒否する', async () => {
      const store = new FileDocumentStore(root);
      const outside = await mkdtemp(join(tmpdir(), 'mdbiz-outside-'));
      await writeFile(join(outside, 'secret.log'), 'token=abc', 'utf8');
      try {
        await symlink(outside, join(root, 'link'), 'junction');
      } catch {
        return; // リンクを作れない環境（権限なし）ではこの観点を検証できない
      }
      try {
        await expect(collect(store.lines('link/secret.log'))).rejects.toThrow(/ワークスペース外/);
      } finally {
        await rm(outside, { recursive: true, force: true });
      }
    });

    it('全文を文字列にせずに流す（大きなファイルでも読み進められる）', async () => {
      const store = new FileDocumentStore(root);
      const line = 'x'.repeat(1000);
      await writeFile(join(root, 'big.log'), `${`${line}\n`.repeat(20000)}last\n`, 'utf8');

      // 先頭 3 行だけ見て離脱する。読み切らずに抜けても後続に影響しないことを確かめる。
      const seen: string[] = [];
      for await (const value of store.lines('big.log')) {
        seen.push(value);
        if (seen.length === 3) break;
      }
      expect(seen).toEqual([line, line, line]);
      expect(await collect(store.lines('big.log'))).toHaveLength(20001);
    });
  });
});

/**
 * アプリのフォルダ切り替えに追従するため、root は生成後に差し替えられる。
 * HTTP サーバーは store インスタンスを掴んだままなので、差し替えは同一インスタンス
 * 上で起きる必要がある（新しい store に作り替えると参照が古いままになる）。
 */
describe('FileDocumentStore — root の差し替え', () => {
  let first: string;
  let second: string;

  beforeEach(async () => {
    first = await mkdtemp(join(tmpdir(), 'mdbiz-root-a-'));
    second = await mkdtemp(join(tmpdir(), 'mdbiz-root-b-'));
  });

  afterEach(async () => {
    await rm(first, { recursive: true, force: true });
    await rm(second, { recursive: true, force: true });
  });

  it('差し替え後は新しい root を読み書きする', async () => {
    const store = new FileDocumentStore(first);
    await store.write('a.md', '旧');
    store.setRoot(second);

    expect(await store.exists('a.md')).toBe(false);
    await store.write('a.md', '新');
    expect(await store.read('a.md')).toBe('新');
    expect(await store.list()).toEqual(['a.md']);
  });

  it('同じインスタンスのまま root だけが変わる', async () => {
    const store = new FileDocumentStore(first);
    const held = store;
    store.setRoot(second);
    expect(held.getRoot()).toBe(resolve(second));
  });

  it('相対パス指定の root を絶対パスへ解決する', () => {
    const store = new FileDocumentStore(first);
    store.setRoot('.');
    expect(store.getRoot()).toBe(resolve('.'));
  });

  it('差し替え後も root 逸脱を拒否する', async () => {
    const store = new FileDocumentStore(first);
    store.setRoot(second);
    await expect(store.read('../outside.md')).rejects.toThrow(/ワークスペース外/);
  });
});
