/**
 * 版間の差分。
 *
 * 提出様式では直した箇所を赤字にする慣習があり、いまは人が手で塗っている。塗る作業が
 * 残っている限り、塗り忘れた行は「変えていない行」として相手へ渡る。行に安定した ID が
 * あり、前の版がファイルとして残っているなら、**どこが変わったかは突き合わせで出せる**。
 * 人に申告させない。
 *
 * ここは突き合わせだけを引き受ける純関数で、どの版と比べるか（git のどのコミットか）も、
 * 出てきた差分をどう見せるかも扱わない。前者は呼ぶ側の都合で変わり、後者は
 * `#@ style` と同じ「意味から色を導く」層に属する。
 */
import type { TsvDocument } from './parse.js';
import { hasRowIdColumn, withRowIds } from './rowId.js';

/** 古い版にあって、いまの版から消えた行。 */
export interface RemovedRow {
  id: string;
  /** 列名 → 値。消えた行はいまの表に置き場が無いので、中身ごと持って出る。 */
  cells: Record<string, string>;
}

/** 突き合わせられなかった理由。比べられたときは空。 */
export type SheetDiffReason = '' | '古い版に行 ID がない' | 'いまの版に行 ID がない';

/** 2 つの版の差。 */
export interface SheetDiff {
  /** 突き合わせられたか。false のとき、以下はすべて空。 */
  comparable: boolean;
  reason: SheetDiffReason;
  /** 行 ID → 値が変わった列名。変わっていない行は載らない。 */
  changed: ReadonlyMap<string, ReadonlySet<string>>;
  /** いまの版にだけある行 ID（いまの版の並び順）。 */
  added: readonly string[];
  /** 古い版にだけある行（古い版の並び順）。 */
  removed: readonly RemovedRow[];
  /** いまの版で増えた列名。 */
  addedColumns: readonly string[];
  /** いまの版で消えた列名。 */
  removedColumns: readonly string[];
}

function incomparable(reason: SheetDiffReason): SheetDiff {
  return {
    comparable: false,
    reason,
    changed: new Map(),
    added: [],
    removed: [],
    addedColumns: [],
    removedColumns: [],
  };
}

/**
 * 列名 → 列の位置。
 *
 * 同じ名前の列が 2 つある表では先に出たほうを採る。名前で指す仕組み（`#@ style` /
 * `#@ count in` / 列リンク）が既にすべてそう振る舞うので、ここだけ別の解釈をしない。
 */
function indexByName(columns: readonly { name: string }[]): Map<string, number> {
  const index = new Map<string, number>();
  columns.forEach((column, at) => {
    if (!index.has(column.name)) index.set(column.name, at);
  });
  return index;
}

/**
 * 古い版といまの版を突き合わせて、変わったセル・増えた行・消えた行を返す。
 *
 * 突き合わせの鍵は**行 ID だけ**。行番号で当てると、1 行挿しただけで以降が全部
 * 「変わった」になり、赤字が全面に出て意味が消える。どちらかの版が ID を持たない場合は
 * 行番号へ落とさず、比べられないと返す（嘘の赤字は直す先を誤らせる）。
 *
 * 列は名前で突き合わせる。型注記（`結果:enum(OK|NG)`）は {@link TsvDocument} の時点で
 * 名前と分かれているので、選べる値が増えただけの列は同じ列として扱われる。
 *
 * 控え行（`#@ hidden`）を対象から外すかどうかは呼ぶ側が決める。外して渡せば差分にも出ない。
 */
export function diffSheets(before: TsvDocument, after: TsvDocument): SheetDiff {
  if (!hasRowIdColumn(before)) return incomparable('古い版に行 ID がない');
  if (!hasRowIdColumn(after)) return incomparable('いまの版に行 ID がない');

  const old = withRowIds(before);
  const now = withRowIds(after);

  const oldAt = indexByName(old.columns);
  const nowAt = indexByName(now.columns);

  const addedColumns = now.columns.map((c) => c.name).filter((name) => !oldAt.has(name));
  const removedColumns = old.columns.map((c) => c.name).filter((name) => !nowAt.has(name));
  // 両方にある列だけを比べる。増えた列のセルまで数えると全行が変わったことになり、
  // 「その列が新しい」という情報が行の差分に埋もれる。
  const shared = now.columns.map((c) => c.name).filter((name) => oldAt.has(name));

  const oldRowAt = new Map<string, number>();
  old.rowIds.forEach((id, at) => oldRowAt.set(id, at));

  const changed = new Map<string, ReadonlySet<string>>();
  const added: string[] = [];
  const matched = new Set<string>();

  now.rowIds.forEach((id, at) => {
    const was = oldRowAt.get(id);
    if (was === undefined) {
      added.push(id);
      return;
    }
    matched.add(id);

    const oldCells = old.rows[was] ?? [];
    const nowCells = now.rows[at] ?? [];
    const names = new Set<string>();
    for (const name of shared) {
      // 末尾のセルが無い行は空欄と同じ。行の長さの違いを差分にしない。
      const a = oldCells[oldAt.get(name) ?? -1] ?? '';
      const b = nowCells[nowAt.get(name) ?? -1] ?? '';
      if (a !== b) names.add(name);
    }
    if (names.size > 0) changed.set(id, names);
  });

  const removed: RemovedRow[] = [];
  old.rowIds.forEach((id, at) => {
    if (matched.has(id)) return;
    const cells = old.rows[at] ?? [];
    const record: Record<string, string> = {};
    old.columns.forEach((column, c) => {
      record[column.name] = cells[c] ?? '';
    });
    removed.push({ id, cells: record });
  });

  return { comparable: true, reason: '', changed, added, removed, addedColumns, removedColumns };
}
