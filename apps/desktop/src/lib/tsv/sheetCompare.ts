/**
 * 前の版との突き合わせを、グリッドが印を引ける形へ落とす（DOM 非依存の純ロジック）。
 *
 * 提出様式では直した箇所を赤字にする慣習があり、いまは人が手で塗っている。塗り忘れた行は
 * 「変えていない行」として相手へ渡るので、**申告ではなく突き合わせで出す**。
 *
 * 突き合わせ自体は schema 側の `diffSheets` が持つ。ここが引き受けるのは 3 つだけ。
 *
 * - git から返ったテキストを検証シートとして読めるか判定する（読めないものは比べない）
 * - 控え行を戻してから比べる（外したまま比べると、控えにした行が全部「消えた行」になる）
 * - 行 ID と列名の組を、グリッドが行・列の位置から引ける鍵へ畳む
 */
import {
  diffSheets,
  mergeHiddenRows,
  parseTsv,
  withoutRowIds,
  type HiddenRow,
  type IdentifiedTsv,
  type RemovedRow,
} from '@md-business/schema-test-spec-tsv';
import { isTsvSource } from './detect';

/**
 * 比べられなかった理由。
 *
 * - `missing`: その版にこのファイルが無い（後から足したファイル / 名前を変えた）
 * - `unreadable`: 中身が検証シートではない（同じ名前で別物だった）
 * - `no-row-id`: 前の版に行 ID が無い（ID を入れる前の版）
 *
 * `no-row-id` のとき行番号で当てにいかない。1 行挿しただけで以降が全部「変わった」になり、
 * 赤字が全面に出て意味が消える。嘘の赤字は直す先を誤らせるので、比べられないと言うほうが安全。
 */
export type CompareIssue = 'missing' | 'unreadable' | 'no-row-id';

/** グリッドへ渡す印。比べられなかったときは `issue` が入り、印はすべて空。 */
export interface SheetComparison {
  /** 比べられたか。比べられたときだけ null。 */
  issue: CompareIssue | null;
  /** 値が変わったセル（{@link cellKey} の鍵）。 */
  changed: ReadonlySet<string>;
  /** いまの版にだけある行の ID。 */
  added: ReadonlySet<string>;
  /** いまの版で増えた列の名前。 */
  addedColumns: ReadonlySet<string>;
  /** 前の版にあって消えた行。いまの表に置き場が無いので中身ごと持つ。 */
  removed: readonly RemovedRow[];
}

/** 鍵の区切り。表に出ない制御文字なので、行 ID にも列名にも入り得ない。 */
const SEPARATOR = '\u001f';

/**
 * セルを指す鍵。行は ID、列は名前で指す。
 *
 * 行番号・列番号を鍵にすると、並べ替えや列の入れ替えで印が別のセルへずれる。
 */
export function cellKey(rowId: string, column: string): string {
  return rowId + SEPARATOR + column;
}

/** 鍵から行 ID を取り出す。列名側に区切りは入らないので、最初の区切りで切れば足りる。 */
export function rowIdOfCellKey(key: string): string {
  const at = key.indexOf(SEPARATOR);
  return at < 0 ? key : key.slice(0, at);
}

function nothing(issue: CompareIssue): SheetComparison {
  return {
    issue,
    changed: new Set(),
    added: new Set(),
    addedColumns: new Set(),
    removed: [],
  };
}

/**
 * 前の版のテキストといまの表を突き合わせる。
 *
 * @param previous 前の版の中身。その版にファイルが無いときは `null`。
 * @param current いまグリッドが持っている表。
 * @param hidden 表から外した控え行（`loadGridDoc` の返り値）。戻してから比べる。
 */
export function compareWithVersion(
  previous: string | null,
  current: IdentifiedTsv,
  hidden: readonly HiddenRow[] = [],
): SheetComparison {
  if (previous === null) return nothing('missing');
  if (!isTsvSource(previous)) return nothing('unreadable');

  const before = parseTsv(previous);
  const after = withoutRowIds(mergeHiddenRows(current, hidden));
  const diff = diffSheets(before, after);
  // いまの側は withoutRowIds が ID 列を必ず戻すので、比べられない理由は前の版にしかない。
  if (!diff.comparable) return nothing('no-row-id');

  const changed = new Set<string>();
  for (const [id, columns] of diff.changed) {
    for (const column of columns) changed.add(cellKey(id, column));
  }

  return {
    issue: null,
    changed,
    added: new Set(diff.added),
    addedColumns: new Set(diff.addedColumns),
    removed: diff.removed,
  };
}
