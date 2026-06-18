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
