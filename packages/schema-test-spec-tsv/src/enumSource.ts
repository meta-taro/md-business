/**
 * 選択肢を別シートの列から引く（`種別:enum(-> 提出物.tsv#種別)`）。
 *
 * 選択肢を型注記に直接並べると、増減のたびに使っている全シートのヘッダを直すことになる。
 * 一覧が既にシートとして存在するなら、そちらを正本にして参照する。
 *
 * ここが持つのは**書き方の解釈と値の集め方**だけで、ファイルの読み取りは持たない
 * （`#@ link` / `countIn` と同じ分担）。
 */
import type { TsvDocument } from './parse.js';

/** `enum(-> ファイル#列名)` の参照先。 */
export interface EnumSource {
  /** 参照先ファイル（この列があるシートからの相対）。 */
  path: string;
  /** 参照先の列名。 */
  column: string;
}

/**
 * 参照先から引いた選択肢（列の位置 → 選択肢）。引けなかった列は載せない。
 *
 * 載っていない列を「選択肢が 0 個」として扱わないこと。参照先を開いていないだけで
 * 既存の値が一斉に不正になる。
 */
export type EnumChoices = ReadonlyMap<number, readonly string[]>;

const ARROW_PATTERN = /^->\s*(.+)$/s;

/**
 * 型注記の括弧の中身を参照先として読む。参照先の書き方でなければ `null`
 * （呼び出し側は今までどおり選択肢の並びとして読む）。
 */
export function parseEnumSource(params: string): EnumSource | null {
  const match = ARROW_PATTERN.exec(params.trim());
  if (match === null) return null;

  const rest = (match[1] as string).trim();
  // 最初の `#` で切る。右側の `#` は列名の一部（`観点#` のような列名が実在する）。
  const hash = rest.indexOf('#');
  if (hash < 0) return null;

  const path = rest.slice(0, hash).trim();
  const column = rest.slice(hash + 1).trim();
  if (path === '' || column === '') return null;
  if (!path.toLowerCase().endsWith('.tsv')) return null;

  return { path, column };
}

/**
 * 参照先の列に載っている値を、出てきた順に重複を畳んで集める。
 *
 * 参照先は選択肢の一覧とは限らず、行が並んだ普通のデータ列でもよい（同じ値が何度も出る）。
 * 空セルは未入力であって選択肢ではないので落とす。
 *
 * 指した列が参照先に無ければ `null`（＝引けなかった）。空配列と区別する。
 */
export function collectEnumChoices(other: TsvDocument, columnName: string): string[] | null {
  const index = other.columns.findIndex((column) => column.name.trim() === columnName);
  if (index < 0) return null;

  const seen = new Set<string>();
  const choices: string[] = [];
  for (const cells of other.rows) {
    const value = (cells[index] ?? '').trim();
    if (value === '' || seen.has(value)) continue;
    seen.add(value);
    choices.push(value);
  }
  return choices;
}
