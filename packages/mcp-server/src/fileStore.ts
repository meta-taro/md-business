/**
 * FileDocumentStore — DocumentStore の本番実装。
 * -----------------------------------------------------------------------------
 * ワークスペース root ディレクトリ配下で node:fs を読み書きする。ツール本体は
 * safeRelativePath で境界を担保済みだが、ここでも root 逸脱を実パスで再検査する
 * （多重防御）。テスト・dry-run はインメモリ実装（MemoryDocumentStore）を使う。
 */
import { readFile, writeFile, mkdir, access, readdir } from 'node:fs/promises';
import { join, resolve, dirname, relative, sep } from 'node:path';
import type { DocumentStore } from './store.js';

export class FileDocumentStore implements DocumentStore {
  private root: string;

  constructor(rootDir: string) {
    this.root = resolve(rootDir);
  }

  /**
   * ワークスペース root を差し替える。
   *
   * サーバーは起動時に掴んだ store インスタンスを持ち続けるので、フォルダ切り替えは
   * 新しい store を作るのではなく、この場で root を書き換えて追従させる。
   */
  setRoot(rootDir: string): void {
    this.root = resolve(rootDir);
  }

  getRoot(): string {
    return this.root;
  }

  /** 相対パスを root 配下の絶対パスへ解決し、root 逸脱なら例外を投げる。 */
  private absolute(relativePath: string): string {
    const abs = resolve(this.root, relativePath);
    const rel = relative(this.root, abs);
    if (rel === '' || rel.startsWith('..') || rel.startsWith(`..${sep}`)) {
      throw new Error(`ワークスペース外へのアクセスは拒否されました: ${relativePath}`);
    }
    return abs;
  }

  async read(relativePath: string): Promise<string> {
    return readFile(this.absolute(relativePath), 'utf8');
  }

  async write(relativePath: string, content: string): Promise<void> {
    const abs = this.absolute(relativePath);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content, 'utf8');
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      await access(this.absolute(relativePath));
      return true;
    } catch {
      return false;
    }
  }

  /** root 配下の `.md` を再帰収集し、`/` 区切りの相対パスでソートして返す。 */
  async list(): Promise<string[]> {
    const found: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const abs = join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(abs);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          found.push(relative(this.root, abs).split(sep).join('/'));
        }
      }
    };
    await walk(this.root);
    return found.sort();
  }
}
