/**
 * DocumentStore — MCP ツールとローカルファイルの境界。
 * -----------------------------------------------------------------------------
 * ツール本体（read / create / update / search）は fs に直接触れず、この抽象越しに
 * 読み書きする。これにより本体を fs 非依存の純ロジックとして単体テストでき、本番は
 * fs 実装を、テスト / dry-run はインメモリ実装を差し替えられる。
 * パスは常に `safeRelativePath` で正規化済みの `/` 区切り相対パスを渡す約束。
 */

/**
 * 行だけ読める口。
 *
 * ログを扱う層（filter / aggregate / timeline）が実際に触るのはここだけで、
 * 書き込みも一覧も要らない。読み書き一式を要求すると、行しか返せない相手
 * （デスクトップアプリのように、読む口が別で用意されている側）は
 * 使わない口を偽物で埋めないと呼べなくなる。
 */
export interface LineSource {
  /**
   * 相対パスを 1 行ずつ流す。存在しなければ最初の取り出しで reject する。
   *
   * 流す行に改行文字は含まず、CRLF と LF は同じ結果になる。
   * 末尾の改行で空行は増えない（行番号が実ファイルとずれないため）。
   */
  lines(relativePath: string): AsyncIterable<string>;
}

export interface DocumentStore extends LineSource {
  /** 相対パスの内容を読む。存在しなければ reject する。 */
  read(relativePath: string): Promise<string>;
  /** 相対パスへ内容を書く（親ディレクトリは実装側で用意）。 */
  write(relativePath: string, content: string): Promise<void>;
  /** 相対パスが存在するか。 */
  exists(relativePath: string): Promise<boolean>;
  /** 文書（`.md`）の全相対パス（ソート済み）。search / 一覧の走査元。 */
  list(): Promise<string[]>;
  /** 検証シート（`.tsv`）の全相対パス（ソート済み）。 */
  listSheets(): Promise<string[]>;
  /**
   * 文書でも検証シートでもないファイルの全相対パス（ソート済み）。
   *
   * サイトの部品には形（スキーマ）が無く、拡張子も決め打ちできないので、
   * 「残り」として集める。どれを部品として扱うかの判断は呼ぶ側が持つ。
   */
  listSite(): Promise<string[]>;
  /**
   * 一覧から外したファイルの件数。
   *
   * 一覧は生成物フォルダ（`node_modules` / `dist` 等）を覗かないので、置いてある数と
   * 並ぶ数は一致しない。件数が合わないときに、除外のせいなのかを見分けるために出す。
   */
  excludedCount(): Promise<number>;
  /**
   * 同じファイルを触る別プロセスと順番を取り合う（取り合えるときだけ）。
   *
   * 読み込みから書き戻しまでを渡すと、その間ほかのプロセスを待たせる。
   * 置き場を持たない実装は取り合う相手がいないので任意にしてある。
   */
  lockPath?<T>(relativePath: string, run: () => Promise<T>): Promise<T>;
}

/**
 * 文字列を行へ切る。fs 実装（readline）と同じ切り方に揃えるための共通処理。
 * 末尾の改行 1 つは行の終わりであって次の行の始まりではない。
 */
export function splitLines(text: string): string[] {
  if (text === '') return [];
  return text.replace(/\r?\n$/, '').split(/\r?\n/);
}

/** 走査対象として扱う拡張子（文書 / 検証シート）。 */
const DOCUMENT_EXT = '.md';
const SHEET_EXT = '.tsv';

/** テスト・dry-run 用のインメモリ DocumentStore。 */
export class MemoryDocumentStore implements DocumentStore {
  private readonly files: Map<string, string>;

  constructor(seed: Record<string, string> = {}) {
    this.files = new Map(Object.entries(seed));
  }

  async read(relativePath: string): Promise<string> {
    const value = this.files.get(relativePath);
    if (value === undefined) throw new Error(`ファイルが見つかりません: ${relativePath}`);
    return value;
  }

  async write(relativePath: string, content: string): Promise<void> {
    this.files.set(relativePath, content);
  }

  async exists(relativePath: string): Promise<boolean> {
    return this.files.has(relativePath);
  }

  async list(): Promise<string[]> {
    return [...this.files.keys()].filter((p) => p.endsWith(DOCUMENT_EXT)).sort();
  }

  async listSheets(): Promise<string[]> {
    return [...this.files.keys()].filter((p) => p.endsWith(SHEET_EXT)).sort();
  }

  async listSite(): Promise<string[]> {
    return [...this.files.keys()]
      .filter((p) => !p.endsWith(DOCUMENT_EXT) && !p.endsWith(SHEET_EXT))
      .sort();
  }

  /** 中身は明示的に置かれたものだけで、走査するフォルダが無いので常に 0。 */
  async excludedCount(): Promise<number> {
    return 0;
  }

  async *lines(relativePath: string): AsyncIterable<string> {
    yield* splitLines(await this.read(relativePath));
  }
}
