/**
 * DocumentStore — MCP ツールとローカルファイルの境界。
 * -----------------------------------------------------------------------------
 * ツール本体（read / create / update / search）は fs に直接触れず、この抽象越しに
 * 読み書きする。これにより本体を fs 非依存の純ロジックとして単体テストでき、本番は
 * fs 実装を、テスト / dry-run はインメモリ実装を差し替えられる。
 * パスは常に `safeRelativePath` で正規化済みの `/` 区切り相対パスを渡す約束。
 */

export interface DocumentStore {
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
}
