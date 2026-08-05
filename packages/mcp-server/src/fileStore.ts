/**
 * FileDocumentStore — DocumentStore の本番実装。
 * -----------------------------------------------------------------------------
 * ワークスペース root ディレクトリ配下で node:fs を読み書きする。ツール本体は
 * safeRelativePath で境界を担保済みだが、ここでも root 逸脱を実パスで再検査する
 * （多重防御）。テスト・dry-run はインメモリ実装（MemoryDocumentStore）を使う。
 */
import {
  readFile,
  writeFile,
  mkdir,
  access,
  readdir,
  rename,
  rm,
  realpath,
} from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join, resolve, dirname, basename, relative, sep } from 'node:path';
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

  /**
   * 絶対パスをシンボリックリンク解決後の実パスへ直し、root 配下でなければ例外を投げる。
   *
   * `..` を含まない相対パスでも、root 配下にリンクが 1 本あればその先は root の外に出る。
   * 字句上の比較（absolute）はそれを見抜けないので、実パスで判定し直す。root 側も同じ
   * 解決を通す（root 自体がリンクのことがある。macOS の `/tmp` → `/private/tmp` など）。
   *
   * 対象がまだ存在しない場合（新規ファイル・未作成の中間フォルダ）は実在する最も深い
   * 祖先まで遡って判定する。存在しない区間にリンクは無いので、そこまで見れば十分。
   */
  private async realPathWithin(abs: string): Promise<string> {
    const realRoot = await realpath(this.root);
    const denied = new Error(`ワークスペース外へのアクセスは拒否されました: ${abs}`);

    const pending: string[] = [];
    let probe = abs;
    for (;;) {
      let real: string;
      try {
        real = await realpath(probe);
      } catch {
        const parent = dirname(probe);
        if (parent === probe) throw denied; // 直上まで遡っても実在しない
        pending.unshift(basename(probe));
        probe = parent;
        continue;
      }
      if (real !== realRoot && !real.startsWith(realRoot + sep)) throw denied;
      return join(real, ...pending);
    }
  }

  async read(relativePath: string): Promise<string> {
    return readFile(await this.realPathWithin(this.absolute(relativePath)), 'utf8');
  }

  /**
   * 一時ファイルへ書いてから rename で差し替える。
   *
   * 行単位の書き込み（検証シート）は全文を読んで全文を書き戻すので、直接上書きすると
   * 途中で落ちた 1 回でシート全体を失いうる。rename は同一ボリューム内では原子的で、
   * Windows でも既存ファイルを置換できる。一時ファイルの拡張子は `.md` / `.tsv` を
   * 避けてあり、デスクトップのファイル監視には現れない。
   */
  async write(relativePath: string, content: string): Promise<void> {
    const abs = this.absolute(relativePath);
    // 親を実パスで検査してから mkdir する。順序を逆にすると、リンク越しの書き込みを
    // 拒否したあとも root 外にフォルダだけが残る。
    const dir = await this.realPathWithin(dirname(abs));
    await mkdir(dir, { recursive: true });
    const target = join(dir, basename(abs));
    const temp = join(dir, `.${basename(abs)}.${randomBytes(6).toString('hex')}.partial`);
    try {
      await writeFile(temp, content, 'utf8');
      await rename(temp, target);
    } catch (error) {
      await rm(temp, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      await access(await this.realPathWithin(this.absolute(relativePath)));
      return true;
    } catch {
      return false;
    }
  }

  /** root 配下の `.md` を再帰収集し、`/` 区切りの相対パスでソートして返す。 */
  async list(): Promise<string[]> {
    return this.collect('.md');
  }

  /** root 配下の `.tsv`（検証シート）を同じ形で集める。 */
  async listSheets(): Promise<string[]> {
    return this.collect('.tsv');
  }

  /** 指定拡張子のファイルを再帰収集する。 */
  private async collect(extension: string): Promise<string[]> {
    const found: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const abs = join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(abs);
        } else if (entry.isFile() && entry.name.endsWith(extension)) {
          found.push(relative(this.root, abs).split(sep).join('/'));
        }
      }
    };
    await walk(this.root);
    return found.sort();
  }
}
