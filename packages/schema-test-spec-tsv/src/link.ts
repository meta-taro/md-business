/**
 * セルに書いたリンクの読み方。
 *
 * 検証シートを実施していると「この項目は別のシートの項目と対」「詳細は基本設計書」という
 * 参照が出る。参照を人がたどるのをやめるには、まずセルの文字列から指し先を一意に決められる
 * 必要がある。ここは文字列を読むところまでを持ち、実際に開く・移動するのは画面側が担う。
 *
 * ## 行の指し方を「値」にした理由
 *
 * 行番号は行を 1 本挿すだけで全部ずれるので採れない。行 ID（`_id`）も採らない。ID 列を
 * 持たないファイルにこちらから ID 列を足すことはしないと決めてあるため（{@link ./rowId.ts}）、
 * ID 列の無いシートは読み込みのたびにその場で採番される。そこへ ID でリンクを張ると、
 * 開き直すたびに別の行を指すか、どの行も指さなくなる。しかもその壊れ方は画面に出ない。
 *
 * 値で指せば ID 列の有無に関わらずどのシートにも効き、並べ替えでも壊れず、差分を読んだ人に
 * 意味が分かる。値が重複したときに一意に決まらないのは承知のうえで、件数を返して
 * 呼び出し側に知らせる（{@link findRowsByCell}）。
 */
import type { TsvDocument } from './parse.js';

/** セルに書いたリンクの指し先。 */
export type CellLink =
  | { kind: 'external'; href: string }
  | { kind: 'file'; path: string }
  | { kind: 'row'; path: string | null; column: string; value: string }
  | { kind: 'heading'; path: string; heading: string };

/**
 * 開いてよい外部スキーム。
 *
 * セルの値はファイルから来る。既定のブラウザへ丸ごと渡す前にここで絞る。
 */
const EXTERNAL_SCHEMES = new Set(['http:', 'https:', 'mailto:']);

/**
 * スキーム付きかどうかの判定。2 文字目以降を必須にしているのは、Windows のドライブ文字
 * （`C:\…`）をスキームと読まないため。
 */
const SCHEME_PATTERN = /^([a-z][a-z0-9+.-]+:)/i;

/** その PC でしか開けない書き方。共有した時点で壊れているので受け付けない。 */
const ABSOLUTE_PATTERN = /^(\/|[a-z]:\/)/i;

/** 行を指すときの区切り。値に `=` を含められるよう、最初の 1 個だけで切る。 */
function splitRowAnchor(anchor: string): { column: string; value: string } | null {
  const at = anchor.indexOf('=');
  if (at < 0) return null;
  const column = anchor.slice(0, at).trim();
  const value = anchor.slice(at + 1).trim();
  if (column === '' || value === '') return null;
  return { column, value };
}

/** 拡張子（小文字・ドット込み）。無ければ空文字。 */
function extensionOf(path: string): string {
  const slash = path.lastIndexOf('/');
  const name = slash < 0 ? path : path.slice(slash + 1);
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot).toLowerCase();
}

/**
 * セルの文字列を指し先として読む。リンクとして読めなければ null。
 *
 * パスは「いま開いているファイルからの相対」として読む。`#` より後ろの読み方は拡張子で
 * 決める（`.tsv` は `列名=値`、`.md` は見出しの文字列）。指し先のファイル側に何かを
 * 宣言させないので、既存のシートを 1 行も変えずに指せる。
 *
 * ファイルを指す形は `.tsv` / `.md` に限る。何でも参照として通すと、ただの覚え書きが
 * 「開けないファイルへのリンク」に化ける。
 */
export function parseCellLink(raw: string): CellLink | null {
  const text = raw.trim();
  if (text === '') return null;

  const scheme = SCHEME_PATTERN.exec(text)?.[1]?.toLowerCase();
  if (scheme !== undefined) {
    return EXTERNAL_SCHEMES.has(scheme) ? { kind: 'external', href: text } : null;
  }

  // Windows で入力すると区切りが `\` になる。書いた本人の環境でだけ動く形にしない。
  const normalized = text.replace(/\\/g, '/');
  if (ABSOLUTE_PATTERN.test(normalized)) return null;

  const hash = normalized.indexOf('#');
  const path = hash < 0 ? normalized : normalized.slice(0, hash);
  const anchor = hash < 0 ? null : normalized.slice(hash + 1).trim();

  if (path === '') {
    // パスを省いた形は、同じシートの中の行を指す。
    if (anchor === null || anchor === '') return null;
    const row = splitRowAnchor(anchor);
    return row === null ? null : { kind: 'row', path: null, ...row };
  }

  // 開ける形式だけを参照として認める。これが無いと、`url` 列に書いたただの覚え書きが
  // 「開けないファイルへのリンク」に化けてクリックできてしまう。
  const extension = extensionOf(path);
  if (extension !== '.tsv' && extension !== '.md') return null;

  if (anchor === null || anchor === '') return { kind: 'file', path };

  if (extension === '.tsv') {
    const row = splitRowAnchor(anchor);
    return row === null ? null : { kind: 'row', path, ...row };
  }

  return { kind: 'heading', path, heading: anchor };
}

/** 値で行を引いた結果。 */
export interface RowLookup {
  /** 引いた列の位置。列が無ければ -1。 */
  column: number;
  /** 値が一致した行の位置（上から順）。 */
  rows: number[];
}

/**
 * 列名と値で行を引く。
 *
 * 「列が無い」と「値が無い」は知らせ方が変わるため、返り値で区別できるようにしてある。
 * 一致が複数あるときは全部返す。呼び出し側は最初の行へ移動したうえで、複数あったことを
 * 知らせる（一致しているのに動かないほうが困るため）。
 */
export function findRowsByCell(doc: TsvDocument, column: string, value: string): RowLookup {
  const name = column.trim();
  const index = doc.columns.findIndex((header) => header.name.trim() === name);
  if (index < 0) return { column: -1, rows: [] };

  const wanted = value.trim();
  const rows: number[] = [];
  doc.rows.forEach((cells, i) => {
    if ((cells[index] ?? '').trim() === wanted) rows.push(i);
  });
  return { column: index, rows };
}
