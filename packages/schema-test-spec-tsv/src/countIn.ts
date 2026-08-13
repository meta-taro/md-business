/**
 * 集計（`#@ computed <列名> = countIn(<ファイル>)`）。
 *
 * 観点の一覧に「この観点を何件のケースが見ているか」を出す。現場では表計算の式で
 * 数えていて、式の中にファイル名も列名も毎回書いていた。同じ関係が複数の式に散ると、
 * 列名を変えたときに直す場所が式の数だけになる。
 *
 * ## 関係は数えられる側でなく、指している側が持つ
 *
 * 対応する列の組はケース側の `#@ link` に既にある（{@link readColumnLinks}）。
 * ここで書かせるのは **数える相手のファイル名だけ**。列の対応は相手の宣言から読む。
 * 引数で列まで書かせると、同じ関係の 2 本目の宣言になり、ズレたときにどちらが正しいか
 * 決められなくなる。
 *
 * ## 数えられないときは値を出さない
 *
 * 相手を開いていない・相手がこちらを指していない場合は `null` を返し、呼び出し側は
 * セルに触らない。0 を書くと「参照が 1 件も無い」と区別がつかず、開いていないだけの
 * 状態が件数としてファイルへ焼かれる。
 *
 * ## 1 行は 1 件
 *
 * 相手が 2 つの列でこちらを指していることがある（「主な観点」と「関連する観点」）。
 * 列ごとに数えて足すと、1 件のケースが 2 件に見える。行の位置で畳んでから数える。
 */
import { readColumnLinks, splitLinkedValues } from './columnLink.js';
import type { TsvDocument } from './parse.js';

/** 式の表記。括弧の中は数える相手のファイルだけを取る（式言語は作らない）。 */
const COUNT_IN_PATTERN = /^countIn\(([^()]*)\)$/;

/** その PC でしか開けない書き方。共有した時点で壊れているので受け付けない。 */
const ABSOLUTE_PATTERN = /^(\/|[a-z]:\/)/i;

/**
 * `countIn(<ファイル>)` から相手のファイルを読む。読めなければ null。
 *
 * パスは**この列があるシートからの相対**（セルのリンク・`#@ link` と同じ規則）。
 */
export function parseCountInSource(expression: string): string | null {
  const match = COUNT_IN_PATTERN.exec(expression.trim());
  if (match === null) return null;

  // Windows で入力すると区切りが `\` になる。書いた本人の環境でだけ動く形にしない。
  const path = (match[1] as string).trim().replace(/\\/g, '/');
  if (path === '' || ABSOLUTE_PATTERN.test(path)) return null;

  // 列を引ける形式に限る。`.md` には列が無いので、指せても数えられない。
  if (!path.toLowerCase().endsWith('.tsv')) return null;

  return path;
}

/**
 * `fromFile` の隣を基準に相対パスを畳む。ルート基準にしないのは、シートに書く側が
 * 隣のファイルを `観点表.tsv` と書けるようにするため。
 */
function resolveFrom(fromFile: string, relative: string): string {
  const segments = fromFile.replace(/\\/g, '/').split('/').slice(0, -1);

  for (const part of relative.replace(/\\/g, '/').split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') segments.pop();
    else segments.push(part);
  }

  return segments.join('/');
}

/**
 * 2 つのパスが同じファイルを指すか。
 *
 * 大文字小文字を無視するのは、共有ワークスペースの実体が Windows のことが多く、
 * `観点表.TSV` と書かれた宣言を別ファイル扱いにすると、数えられない理由が
 * 利用者から見て分からないため。
 */
function samePath(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * `other` の行のうち、`self` の各行を参照しているものを数える。
 *
 * @param self 数えられる側（この結果を列に入れるシート）
 * @param selfPath `self` の位置（ワークスペース基準の相対）
 * @param other 数える対象（`#@ link` でこちらを指しているシート）
 * @param otherPath `other` の位置（同上）
 * @returns `self` の行ごとの件数。関係が引けないときは null（＝セルに触らない）
 */
export function countReferences(
  self: TsvDocument,
  selfPath: string,
  other: TsvDocument,
  otherPath: string,
): number[] | null {
  const links = readColumnLinks(
    other.directives,
    other.columns.map((column) => column.name),
  );

  // こちらを指している宣言だけを残し、そのうえで参照先の列がこちらに実在するものに絞る。
  const usable = links
    .filter((link) => samePath(resolveFrom(otherPath, link.path), selfPath))
    .map((link) => ({
      link,
      selfColumn: self.columns.findIndex((column) => column.name.trim() === link.targetColumn),
    }))
    .filter((entry) => entry.selfColumn >= 0);

  if (usable.length === 0) return null;

  // 値 → その値を参照している相手の行の位置。行の位置で畳むので、
  // 同じ行が複数の列・複数回で指していても 1 件になる。
  const rowsByValue = new Map<string, Set<number>>();

  for (const { link } of usable) {
    other.rows.forEach((cells, rowIndex) => {
      for (const value of splitLinkedValues(cells[link.columnIndex] ?? '', link.separator)) {
        const rows = rowsByValue.get(value);
        if (rows === undefined) rowsByValue.set(value, new Set([rowIndex]));
        else rows.add(rowIndex);
      }
    });
  }

  return self.rows.map((cells) => {
    const rows = new Set<number>();

    for (const { selfColumn } of usable) {
      const key = (cells[selfColumn] ?? '').trim();
      // 空セルは未入力＝まだ何も指されていない。参照先として照合しない。
      if (key === '') continue;
      for (const row of rowsByValue.get(key) ?? []) rows.add(row);
    }

    return rows.size;
  });
}
