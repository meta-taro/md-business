/**
 * 列のリンク定義（`#@ link <列名> -> <ファイル>#<列名>`）。
 *
 * 検証シートは 1 枚で閉じない。ケースの一覧と観点の一覧が別ファイルにあり、
 * ケース側の列が観点側の行を指す。指しているだけでは「打ち間違えた」「観点を起こしたのに
 * ケースを書いていない」のどちらも見つからないので、**関係そのものを宣言させて機械に照合させる**。
 *
 * ## 1 つの宣言を 3 つの用途で使う
 *
 * 同じ関係を必要とする機能が 3 つある（集計・整合検証・選択肢の追随）。それぞれに別の宣言を
 * 持たせると同じことを 3 回書かせることになり、ズレたときに直す場所が 3 つになる。
 * ここを 1 本の正本にして、上に乗せる。
 *
 * ## 多値が既定
 *
 * 1 セルに複数の参照先が入る（現場の Sheets 式が `SPLIT(…, ",")` していた）。1 対 1 を
 * 前提にすると、集計も両方向検証も最初から動かない。区切り文字は宣言側で変えられる。
 *
 * ## 参照先を読めないのは警告
 *
 * ワークスペースの一部だけを開いていることがある。読めないだけで落とすと、開くたびに
 * 赤くなって「赤いのが普通」になり、本物の欠落が埋もれる。
 *
 * ## 循環
 *
 * 照合は宣言 1 本ぶんで閉じており、参照先の宣言を辿らない。したがってここでは循環が作れない
 * （A → B と B → A が両方あっても、それぞれ独立に 1 回ずつ照合されるだけ）。
 * 辿るのは集計（`countIn`）を入れるときなので、循環の検出はそちらで持つ。
 */
import type { TsvDocument } from './parse.js';

/** リンク定義ディレクティブの種別語。 */
const LINK_DIRECTIVE = 'link';

/** 参照元と参照先を分ける記号。列名に含められるよう、最初の 1 個だけで切る。 */
const ARROW = '->';

/** 1 セル内の多値をどこで切るかの既定。 */
const DEFAULT_SEPARATOR = ',';

/** 宣言の末尾に置けるオプション（`key=value`）。ここに無い key は宣言ごと捨てる。 */
const OPTION_TAIL = /\s+([a-z]+)=(\S*)$/i;

/** その PC でしか開けない書き方。共有した時点で壊れているので受け付けない。 */
const ABSOLUTE_PATTERN = /^(\/|[a-z]:\/)/i;

/** 1 本の `#@ link` 行を解釈した結果。 */
export interface ColumnLink {
  /** 参照元の列の位置（列定義の並び）。 */
  columnIndex: number;
  /** 参照先ファイル（いま開いているファイルからの相対）。 */
  path: string;
  /** 参照先の列名。 */
  targetColumn: string;
  /** 1 セル内の多値の区切り。 */
  separator: string;
}

/** 対象ディレクティブなら本体（種別語を除いた残り）を返す。違えば null。 */
function bodyOf(directive: string): string | null {
  if (directive === LINK_DIRECTIVE) return '';
  if (directive.startsWith(`${LINK_DIRECTIVE} `)) {
    return directive.slice(LINK_DIRECTIVE.length + 1).trim();
  }
  return null;
}

/** 末尾のオプションを剥がす。未知の key があれば null（＝宣言ごと捨てる）。 */
function takeOptions(target: string): { rest: string; separator: string } | null {
  let rest = target;
  let separator = DEFAULT_SEPARATOR;

  for (;;) {
    const match = OPTION_TAIL.exec(rest);
    if (match === null) return { rest: rest.trim(), separator };

    const key = (match[1] as string).toLowerCase();
    const value = match[2] as string;
    if (key !== 'sep' || value === '') return null;

    separator = value;
    rest = rest.slice(0, match.index);
  }
}

/** `<ファイル>#<列名>` を分ける。読めなければ null。 */
function splitTarget(target: string): { path: string; targetColumn: string } | null {
  // Windows で入力すると区切りが `\` になる。書いた本人の環境でだけ動く形にしない。
  const normalized = target.replace(/\\/g, '/');
  if (ABSOLUTE_PATTERN.test(normalized)) return null;

  // 列名に `#` を含められるよう（`観点#`）、パス側の最初の `#` で切る。
  const hash = normalized.indexOf('#');
  if (hash <= 0) return null;

  const path = normalized.slice(0, hash).trim();
  const targetColumn = normalized.slice(hash + 1).trim();
  if (targetColumn === '') return null;

  // 列を引ける形式に限る。`.md` には列が無いので、指せても照合できない。
  if (!path.toLowerCase().endsWith('.tsv')) return null;

  return { path, targetColumn };
}

/**
 * ディレクティブ群からリンク定義を読む。`link` 以外は無視し、列定義に無い列名・
 * `->` を欠く行・列を指していない参照先・未知のオプションは捨てる。
 * 同じ列への重複宣言は後勝ちで 1 本に畳む。
 */
export function readColumnLinks(
  directives: readonly string[],
  columnNames: readonly string[],
): ColumnLink[] {
  const byColumn = new Map<number, ColumnLink>();

  for (const directive of directives) {
    const body = bodyOf(directive);
    if (body === null || body === '') continue;

    const arrow = body.indexOf(ARROW);
    if (arrow <= 0) continue;

    const columnIndex = columnNames.indexOf(body.slice(0, arrow).trim());
    if (columnIndex < 0) continue;

    const options = takeOptions(body.slice(arrow + ARROW.length).trim());
    if (options === null) continue;

    const target = splitTarget(options.rest);
    if (target === null) continue;

    byColumn.set(columnIndex, { columnIndex, ...target, separator: options.separator });
  }

  return [...byColumn.values()];
}

/**
 * 1 セルの文字列を参照先の値の並びとして読む。前後の空白を詰め、空の要素は落とす。
 *
 * 同じ値が 2 回書かれていても 1 つに畳む。参照は「どの行を指すか」であって回数ではないため、
 * 畳まないと集計（`countIn`）が 1 行を二重に数える。
 */
export function splitLinkedValues(cell: string, separator: string): string[] {
  const values: string[] = [];
  const seen = new Set<string>();

  for (const part of cell.split(separator)) {
    const value = part.trim();
    if (value === '' || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
  }

  return values;
}

/** リンク照合で見つかる欠落の種類（機械判定用の安定コード）。 */
export type LinkIssueCode =
  | 'link_target_missing'
  | 'link_target_column_missing'
  | 'link_unknown_value'
  | 'link_unreferenced_row';

/** 1 件のリンク照合の結果。 */
export interface LinkIssue {
  /** 欠落の種類。 */
  code: LinkIssueCode;
  /** `error` は間違い、`warning` は途中かもしれないもの。 */
  severity: 'error' | 'warning';
  /** 位置がどちらのファイルにあるか。 */
  side: 'source' | 'target';
  /** 行の位置（0 始まり）。行に紐づかないものは -1。 */
  row: number;
  /** 列の位置（それぞれのファイルの列定義基準・0 始まり）。 */
  column: number;
  /** 該当した値。値に紐づかないものは空文字。 */
  value: string;
  /** 人間向け説明（日本語）。 */
  message: string;
}

/** 参照先の列の値 → その値を持つ行の位置。 */
function targetValueRows(target: TsvDocument, columnIndex: number): Map<string, number[]> {
  const rowsByValue = new Map<string, number[]>();

  target.rows.forEach((cells, rowIndex) => {
    const value = (cells[columnIndex] ?? '').trim();
    // 空セルは未入力＝まだ何も指していない。取りこぼしには数えない。
    if (value === '') return;

    const rows = rowsByValue.get(value);
    if (rows === undefined) rowsByValue.set(value, [rowIndex]);
    else rows.push(rowIndex);
  });

  return rowsByValue;
}

/**
 * リンク定義 1 本を両方向に照合する。参照先が読めないときは警告 1 件だけを返す。
 *
 * 両方向にするのは、片方だけでは見つからない欠落があるため:
 * - 参照元の値が参照先に無い＝打ち間違い（`error`）。指した先が無いので間違いが確定している
 * - 参照先の行を誰も参照していない＝取りこぼし（`warning`）。観点を先に起こして
 *   ケースを後から書く進め方は普通なので、途中の状態を赤くしない
 */
export function checkColumnLink(
  source: TsvDocument,
  link: ColumnLink,
  target: TsvDocument | null,
): LinkIssue[] {
  if (target === null) {
    return [
      {
        code: 'link_target_missing',
        severity: 'warning',
        side: 'source',
        row: -1,
        column: link.columnIndex,
        value: '',
        message: `参照先 ${link.path} を読めませんでした`,
      },
    ];
  }

  const targetColumn = target.columns.findIndex(
    (header) => header.name.trim() === link.targetColumn,
  );
  if (targetColumn < 0) {
    return [
      {
        code: 'link_target_column_missing',
        severity: 'warning',
        side: 'source',
        row: -1,
        column: link.columnIndex,
        value: '',
        message: `参照先 ${link.path} に列「${link.targetColumn}」がありません`,
      },
    ];
  }

  const issues: LinkIssue[] = [];
  const rowsByValue = targetValueRows(target, targetColumn);
  const referenced = new Set<string>();

  source.rows.forEach((cells, rowIndex) => {
    for (const value of splitLinkedValues(cells[link.columnIndex] ?? '', link.separator)) {
      if (rowsByValue.has(value)) {
        referenced.add(value);
        continue;
      }
      issues.push({
        code: 'link_unknown_value',
        severity: 'error',
        side: 'source',
        row: rowIndex,
        column: link.columnIndex,
        value,
        message: `参照先 ${link.path} に「${value}」がありません`,
      });
    }
  });

  for (const [value, rows] of rowsByValue) {
    if (referenced.has(value)) continue;
    for (const row of rows) {
      issues.push({
        code: 'link_unreferenced_row',
        severity: 'warning',
        side: 'target',
        row,
        column: targetColumn,
        value,
        message: `「${value}」を参照している行がありません`,
      });
    }
  }

  return issues;
}
