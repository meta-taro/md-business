import { classifyLine, parseTsv, validateTsv } from '@md-business/schema-test-spec-tsv';

import type { Problem } from './diagnostics.js';

const FORMAT_ID = 'md-business:test-spec-tsv/v1';

/**
 * 検証シートとして扱う TSV か。デスクトップアプリと同じく、最初の空でない行が
 * 行頭 0 桁の `#!` で始まり、識別子が一致するものだけを対象にする。
 * ただの表データの TSV に赤線を出さないため。
 */
export function isTestSpecTsv(text: string): boolean {
  const first = text.split('\n').find((line) => line.trim() !== '');
  return first !== undefined && first.startsWith('#!') && first.slice(2).trim() === FORMAT_ID;
}

/**
 * 検証シートの誤り（必須の空欄・選択肢にない値・日付の形など）を、該当行の物理行へ載せて返す。
 *
 * 検証はデータ行の並び（0 始まり）で位置を返すので、ヘッダより後の data 行を数えて
 * ファイル上の行へ戻す。メタ行・ディレクティブ行・空行は数えない。
 */
export function diagnoseTsv(text: string): Problem[] {
  if (!isTestSpecTsv(text)) return [];

  const dataLines: number[] = [];
  text.split('\n').forEach((raw, index) => {
    if (classifyLine(raw.replace(/\r$/, '')) === 'data') dataLines.push(index + 1);
  });
  // 先頭の data 行はヘッダ。
  const rowLines = dataLines.slice(1);

  return validateTsv(parseTsv(text)).map((issue) => ({
    line: rowLines[issue.row] ?? dataLines[0] ?? 1,
    message: issue.columnName === '' ? issue.message : `${issue.columnName}: ${issue.message}`,
    severity: 'error',
  }));
}
