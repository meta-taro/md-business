/**
 * Markdown table を Sheets row に変換するための最小パーサ。
 * Why: 第一実装では @md-business/core の重い AST パーサを Apps Script に bundle するより、
 *      検証シート用 table 専用の薄いパーサを別途持つ方が build size とテスト速度に勝る。
 *      schema-test-spec 完成時に core 統合判断を行う。
 */

export interface MdTable {
  header: string[];
  rows: string[][];
}

/**
 * 任意の Markdown 本文から最初の table ブロックを抽出して返す。
 * Why: parseMdTable は冒頭 2 行が table 形式であることを要求する。
 *      本文には見出し / リスト / 段落が混ざるため、最初の pipe + separator のペアを
 *      探してその連続行だけを切り出してから parseMdTable に渡す前段が必要。
 *      table が見つからなければ null（呼び出し側で空配列フォールバック）。
 */
export function extractFirstMdTable(src: string): string | null {
  const lines = src.split('\n').map((l) => l.replace(/\r$/, ''));
  for (let i = 0; i < lines.length - 1; i++) {
    const head = lines[i]!;
    const sep = lines[i + 1]!;
    if (isPipeRow(head) && isSeparatorRow(sep)) {
      const out = [head, sep];
      for (let j = i + 2; j < lines.length; j++) {
        const line = lines[j]!;
        if (!isPipeRow(line)) break;
        out.push(line);
      }
      return out.join('\n');
    }
  }
  return null;
}

export function parseMdTable(src: string): MdTable | null {
  const lines = src
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.trim().length > 0);
  if (lines.length < 2) return null;
  const headerLine = lines[0]!;
  const separatorLine = lines[1]!;
  if (!isPipeRow(headerLine) || !isSeparatorRow(separatorLine)) return null;

  const header = splitPipeRow(headerLine);
  const rows = lines.slice(2).map((line) => splitPipeRow(line));
  return { header, rows };
}

export function mdTableToValues(table: MdTable): string[][] {
  return [table.header, ...table.rows];
}

/**
 * Sheets の 2D 配列を Markdown table 文字列に変換（Sheets → md エクスポート用）。
 * Why: 双方向同期のうち「Sheets で編集 → md にエクスポートして git にコピペ」の片方向を成立させる。
 *      `schema-test-spec` 完成後は onEdit + GitHub API で auto-commit するが、
 *      手動エクスポートは fallback として常に有用。
 *
 * - 空セルは空文字に正規化（Sheets が `null` / `undefined` を返すケースあり）。
 * - セル内の `|` は `\|` にエスケープ。
 * - 各列の幅は揃えない（GitHub レンダリングに任せる）= バイト最小・diff 最小。
 * - 0 行 / 1 行（header のみ）の場合は header + 空 separator を返す。
 */
export function valuesToMdTable(values: ReadonlyArray<ReadonlyArray<unknown>>): string {
  if (values.length === 0) return '';
  const header = (values[0] ?? []).map(toCell);
  const separator = header.map(() => '---');
  const body = values.slice(1).map((row) => row.map(toCell));
  const formatRow = (cells: string[]): string => `| ${cells.join(' | ')} |`;
  const lines = [formatRow(header), formatRow(separator), ...body.map(formatRow)];
  return lines.join('\n');
}

function toCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function isPipeRow(line: string): boolean {
  return line.trimStart().startsWith('|');
}

function isSeparatorRow(line: string): boolean {
  const trimmed = line.trim();
  return /^\|?(\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?$/.test(trimmed);
}

function splitPipeRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}
