/**
 * 控え行（`#@ hidden <id> …`）。
 *
 * 文言を書き直したとき、元の文言の行を残すか消すかを毎回悩む状態をやめるための仕組み。
 * 行はファイルに残したまま、グリッドには出さない。表計算の非表示行に相当する。
 *
 * 指定は **行 ID だけ**を受ける。行インデックスで指すと 1 行挿さった時点で別の行が
 * 控え扱いになり、悩みが増える（`#@ rowheight` が抱えていたのと同じ壊れ方）。
 *
 * 扱い方は行 ID 列（{@link withRowIds}）と同じで、**読み込みで doc から抜き、保存で戻す**。
 * 抜いてしまえば、グリッドの選択・移動・貼り付け・検証は行インデックスのまま無改修で動く。
 *
 * 戻す位置は「直前の可視行の ID」で覚える。控えは書き直した行の隣にあることに意味があり、
 * 末尾へまとめると、どの行の控えなのかが読み手に分からなくなる。
 *
 * 抜き差しそのものは {@link splitRowsById} / {@link mergeHiddenRows} で、抜く行を
 * 何で決めるかとは切り離してある（画面の都合で外す絞り込みが同じ作法に乗る）。
 */
import { isRowId } from './rowId.js';
import type { IdentifiedTsv } from './rowId.js';

/** 控え行を宣言するディレクティブ（`#@ hidden <id> …`）。 */
const HIDDEN_DIRECTIVE = 'hidden';

/**
 * doc から抜いて預かる行。保存時に {@link mergeHiddenRows} で元の位置へ戻す。
 *
 * 控え（`#@ hidden`）だけでなく、画面の都合で外した行（絞り込み）も同じ形で預かる。
 */
export interface HiddenRow {
  /** 控え行の行 ID。 */
  id: string;
  /** 控え行のセル（ID 列を除いた並び）。 */
  cells: readonly string[];
  /** 戻す位置＝直前の可視行の ID。先頭にあった控えは null。 */
  afterId: string | null;
}

/** 対象ディレクティブなら本体（種別語を除いた残り）を返す。違えば null。 */
function bodyOf(directive: string): string | null {
  if (directive === HIDDEN_DIRECTIVE) return '';
  if (directive.startsWith(`${HIDDEN_DIRECTIVE} `)) {
    return directive.slice(HIDDEN_DIRECTIVE.length + 1).trim();
  }
  return null;
}

/**
 * `#@ hidden` 行から控え行の ID を記載順に読む。
 *
 * 複数行あれば足し合わせる（後勝ちにすると、長くなった行を手で 2 本に割った時点で
 * 控えが消える）。ID の形をしていないトークンは捨てる。
 */
export function readHiddenIds(directives: readonly string[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const directive of directives) {
    const body = bodyOf(directive);
    if (body === null || body === '') continue;

    for (const token of body.split(/\s+/)) {
      if (!isRowId(token) || seen.has(token)) continue;
      seen.add(token);
      ids.push(token);
    }
  }

  return ids;
}

/**
 * 控え行の宣言を書き直す。既存の `hidden` 行は 1 本にまとめ、控えが無ければ行ごと落とす
 * （触っていないファイルに空の宣言行が生えないように）。
 */
export function setHiddenIds(directives: readonly string[], ids: readonly string[]): string[] {
  const kept = directives.filter((directive) => bodyOf(directive) === null);
  return ids.length > 0 ? [...kept, `${HIDDEN_DIRECTIVE} ${ids.join(' ')}`] : kept;
}

/**
 * 渡された行 ID の行を doc から抜く。戻すのは {@link mergeHiddenRows}。
 *
 * 抜く行を何で決めるかは呼ぶ側に任せる。控えはファイルの宣言で決まるが、絞り込みは
 * 画面の都合で決まる。**決め方が違っても抜き差しの作法は 1 つ**にしておかないと、
 * 戻し方が食い違ったときに行が黙って消える。
 *
 * 文書に無い ID の指定は何も起こさない。
 */
export function splitRowsById(
  doc: IdentifiedTsv,
  ids: ReadonlySet<string>,
): { doc: IdentifiedTsv; taken: HiddenRow[] } {
  if (ids.size === 0) {
    return { doc, taken: [] };
  }

  const rows: string[][] = [];
  const rowIds: string[] = [];
  const taken: HiddenRow[] = [];
  let afterId: string | null = null;

  doc.rows.forEach((cells, i) => {
    const id = doc.rowIds[i] ?? '';
    if (ids.has(id)) {
      taken.push({ id, cells, afterId });
      return;
    }
    rows.push(cells);
    rowIds.push(id);
    afterId = id;
  });

  return { doc: { ...doc, rows, rowIds }, taken };
}

/**
 * 読み込み時に控え行を doc から抜く。
 *
 * `#@ hidden` の宣言はディレクティブに残す。抜いた事実の正本はファイル側の宣言であり、
 * 落とすと保存で書き戻せなくなる。
 */
export function splitHiddenRows(doc: IdentifiedTsv): { doc: IdentifiedTsv; hidden: HiddenRow[] } {
  const { doc: visible, taken } = splitRowsById(doc, new Set(readHiddenIds(doc.directives)));
  return { doc: visible, hidden: taken };
}

/**
 * 保存時に控え行を元の位置（直前だった可視行の後ろ）へ戻す。
 *
 * 戻す先の行が消えていたら末尾へ回す。控えは「消していいか悩まない」ための機能なので、
 * 行き場を失ったからといって黙って落とすのがいちばんまずい壊れ方になる。
 */
export function mergeHiddenRows(
  doc: IdentifiedTsv,
  hidden: readonly HiddenRow[],
): IdentifiedTsv {
  if (hidden.length === 0) {
    return doc;
  }

  const visible = new Set(doc.rowIds);
  const rows: string[][] = [];
  const rowIds: string[] = [];

  const emit = (predicate: (row: HiddenRow) => boolean): void => {
    for (const row of hidden) {
      if (!predicate(row)) continue;
      rows.push(row.cells.slice());
      rowIds.push(row.id);
    }
  };

  emit((row) => row.afterId === null);

  doc.rows.forEach((cells, i) => {
    const id = doc.rowIds[i] ?? '';
    rows.push(cells);
    rowIds.push(id);
    emit((row) => row.afterId === id);
  });

  // 戻す先が消えた控え（afterId が可視行に無い）。null 扱いの先頭挿入と重複しないよう
  // afterId !== null で絞る。
  emit((row) => row.afterId !== null && !visible.has(row.afterId));

  return { ...doc, rows, rowIds };
}
