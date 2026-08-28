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
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { randomBytes } from 'node:crypto';
import { join, resolve, dirname, basename, relative, sep } from 'node:path';
import type { DocumentStore } from './store.js';

/**
 * 覗かないフォルダ。ドット始まり（`.git` 等）と、既知のビルド生成物。
 *
 * 文書・検証シート・サイトの部品で**同じ判定を使う**。一覧ごとに違う答えを出すと、
 * 「デスクトップアプリのツリーには出ないのに一覧には出る」ファイルが生まれ、
 * どちらが正しいかを利用者が切り分けることになる。
 * デスクトップ側（`apps/desktop/src-tauri/src/workspace.rs` の `is_excluded_dir`）と
 * 同じ 4 規則。片方だけ足すと同じずれが起きるので、増やすときは両方に足す。
 */
function isGeneratedDir(name: string): boolean {
  return name.startsWith('.') || name === 'node_modules' || name === 'dist' || name === 'build';
}

/** 一覧・件数の対象になる拡張子（文書 / 検証シート）。 */
function isDocumentOrSheet(name: string): boolean {
  return name.endsWith('.md') || name.endsWith('.tsv');
}

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
   * 行単位で流す。読み終えた行は捨てながら進むので、ファイル全体はメモリに載らない。
   *
   * 呼び出し側が途中で離脱しても（上限に達して break する）、finally でストリームを
   * 破棄してファイルハンドルを閉じる。close だけでは入力側が開いたまま残る。
   */
  async *lines(relativePath: string): AsyncIterable<string> {
    const abs = await this.realPathWithin(this.absolute(relativePath));
    const stream = createReadStream(abs, { encoding: 'utf8' });
    const reader = createInterface({ input: stream, crlfDelay: Infinity });
    try {
      yield* reader;
    } finally {
      reader.close();
      stream.destroy();
    }
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

  /**
   * root 配下の `.md` を再帰収集し、`/` 区切りの相対パスでソートして返す。
   *
   * 生成物と隠しフォルダは覗かない。依存パッケージの README まで並べると、
   * 業務文書がその中に埋もれて、一覧として使えなくなる。
   */
  async list(): Promise<string[]> {
    return this.collect('.md');
  }

  /** root 配下の `.tsv`（検証シート）を同じ形で集める。 */
  async listSheets(): Promise<string[]> {
    return this.collect('.tsv');
  }

  /**
   * root 配下の、文書でも検証シートでもないファイルを同じ形で集める。
   *
   * 拡張子で絞れないぶん、目に入る量は他の 2 つより大きくなるが、覗く先の判定は同じ。
   */
  async listSite(): Promise<string[]> {
    return this.collect((name) => !isDocumentOrSheet(name));
  }

  /**
   * 一覧から外した `.md` / `.tsv` の件数。
   *
   * 件数が思ったより少ないときに、除外のせいなのか、そもそも置いていないのかを
   * 見分けるために出す。数えるときだけ生成物の中へ入るので、一覧の速さには効かない。
   */
  async excludedCount(): Promise<number> {
    let count = 0;
    const walk = async (dir: string, excluded: boolean): Promise<void> => {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          await walk(join(dir, entry.name), excluded || isGeneratedDir(entry.name));
        } else if (excluded && entry.isFile() && isDocumentOrSheet(entry.name)) {
          count += 1;
        }
      }
    };
    await walk(this.root, false);
    return count;
  }

  /** 条件に合うファイルを再帰収集する。覗かないフォルダは 3 つの一覧で共通。 */
  private async collect(accept: string | ((name: string) => boolean)): Promise<string[]> {
    const matches = typeof accept === 'string' ? (name: string) => name.endsWith(accept) : accept;
    const found: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const abs = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (isGeneratedDir(entry.name)) continue;
          await walk(abs);
        } else if (entry.isFile() && matches(entry.name)) {
          found.push(relative(this.root, abs).split(sep).join('/'));
        }
      }
    };
    await walk(this.root);
    return found.sort();
  }
}
