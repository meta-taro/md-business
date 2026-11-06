/**
 * 共有リンクの `line=` / `id=` から、文書を開いたあとの移動先を決める。
 *
 * 検証シートは表で開くので、物理行の番号をそのまま使えない（控え・並べ替え・絞り込みで
 * 表の並びとファイルの並びがずれる）。行番号はファイル上の行の ID へ読み替えてから引く。
 */
import { isRowId, parseTsv, rowIdColumnName, classifyLine } from '@md-business/schema-test-spec-tsv';

export interface ShareJumpRequest {
  line?: number;
  id?: string;
}

export type ShareJump =
  | { kind: 'row'; column: string; value: string }
  | { kind: 'caret'; offset: number }
  | { kind: 'missing'; line: number };

function lineStartOffset(source: string, line: number): number | null {
  let offset = 0;
  for (let current = 1; current < line; current++) {
    const next = source.indexOf('\n', offset);
    if (next < 0) return null;
    offset = next + 1;
  }
  return offset;
}

function rowIdAtLine(source: string, line: number): { column: string; value: string } | null {
  const doc = parseTsv(source);
  const column = rowIdColumnName(
    doc.directives,
    doc.columns.map((header) => header.name),
  );
  if (column === null) return null;
  const index = doc.columns.findIndex((header) => header.name === column);
  if (index < 0) return null;

  const lines = source.split('\n');
  if (line > lines.length) return null;
  // 先頭の data 行はヘッダ。2 本目以降が rows に順に対応する。
  let dataSeen = -1;
  for (let i = 0; i < line; i++) {
    if (classifyLine((lines[i] ?? '').replace(/\r$/, '')) === 'data') dataSeen++;
    else if (i === line - 1) return null;
  }
  if (dataSeen < 1) return null;
  const value = (doc.rows[dataSeen - 1]?.[index] ?? '').trim();
  return isRowId(value) ? { column, value } : null;
}

/** 移動しないときは null。指した行が見つからなければ `missing`。 */
export function resolveShareJump(source: string, isTsv: boolean, request: ShareJumpRequest): ShareJump | null {
  const { line, id } = request;
  if (isTsv) {
    if (id !== undefined) {
      const doc = parseTsv(source);
      const column = rowIdColumnName(
        doc.directives,
        doc.columns.map((header) => header.name),
      );
      return { kind: 'row', column: column ?? '_id', value: id };
    }
    if (line === undefined) return null;
    const found = rowIdAtLine(source, line);
    return found === null ? { kind: 'missing', line } : { kind: 'row', ...found };
  }
  if (line === undefined) return null;
  const offset = lineStartOffset(source, line);
  return offset === null ? { kind: 'missing', line } : { kind: 'caret', offset };
}
