import { escapeCell } from './escape.js';
import type { ParsedHeader } from './types.js';
import type { TsvDocument } from './parse.js';

/**
 * シリアライザ（Block TSV-6）: 構造化された {@link TsvDocument} を
 * カスタム TSV テキストへ書き戻す純関数。{@link parseTsv} の逆変換。
 *
 * 設計制約:
 * - **1 レコード = 1 物理行**。データセルの改行・タブ・バックスラッシュは
 *   {@link escapeCell} で畳むため、生の改行で行が割れず git diff がクリーンに保たれる。
 * - `parseTsv(serializeTsv(doc))` は正規化済みドキュメントを復元する（round-trip）。
 *   正規化とは: formatId / meta キー値 / directives が trim 済みで、
 *   列名・enum 値に型注釈の構造文字（`: ( ) | !`）を含まないこと。
 */

/**
 * 列型（+ UI ヒント）を型付きヘッダのキーワードへ戻す。
 * `text` は注釈不要なので `undefined`。
 */
function typeKeyword(header: ParsedHeader): string | undefined {
  switch (header.type) {
    case 'text':
      return undefined;
    case 'multiline_text':
      return 'multiline';
    case 'enum':
      return header.ui === 'radio' ? 'radio' : 'enum';
    case 'date':
      return header.ui === 'datetime' ? 'datetime' : 'date';
    case 'number':
      return 'number';
    case 'checkbox':
      return 'checkbox';
    case 'url':
      return 'url';
  }
}

/**
 * 列定義を型付きヘッダのセル文字列へ書き戻す（`parseTypedHeader` の逆）。
 *
 * 記法 `列名[:型(パラメータ)][!]`:
 * - `text` は注釈なし（列名のみ）。
 * - `enum` / `radio` は `(値1|値2)` を付与（値は {@link escapeCell} 済み）。
 * - `required` は末尾 `!`。
 */
export function serializeHeader(header: ParsedHeader): string {
  let cell = escapeCell(header.name);
  const keyword = typeKeyword(header);

  if (keyword !== undefined) {
    cell += `:${keyword}`;
    if (header.type === 'enum') {
      const values = (header.enumValues ?? []).map((value) => escapeCell(value)).join('|');
      cell += `(${values})`;
    }
  }

  if (header.required) {
    cell += '!';
  }

  return cell;
}

/**
 * {@link TsvDocument} をカスタム TSV テキストへ整形する。
 *
 * 出力順は `#!` マジック → `#` メタ → `#@` ディレクティブ → 型付きヘッダ → データ行。
 * 末尾に改行は付けない（ファイル書き出し層で付与する想定の純テキスト）。
 */
export function serializeTsv(doc: TsvDocument): string {
  const lines: string[] = [];

  if (doc.formatId !== '') {
    lines.push(`#! ${doc.formatId}`);
  }

  for (const [key, value] of Object.entries(doc.meta)) {
    lines.push(`# ${key}: ${value}`);
  }

  for (const directive of doc.directives) {
    lines.push(`#@ ${directive}`);
  }

  if (doc.columns.length > 0) {
    lines.push(doc.columns.map((header) => serializeHeader(header)).join('\t'));
  }

  for (const row of doc.rows) {
    lines.push(row.map((cell) => escapeCell(cell)).join('\t'));
  }

  return lines.join('\n');
}
