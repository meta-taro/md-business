/**
 * 行の安定 ID。
 *
 * `No.` は行を 1 本挿すと以降が全部ずれるため、行を指す手段にならない。行の高さ
 * （`#@ rowheight`）も同じ理由でずれる。そこで不変の ID を持ち、`No.` は採番結果を
 * 表示するだけに降ろす。
 *
 * 置き場所は **データ行の末尾セル**。ディレクティブ側に行順で ID を並べる形にすると、
 * アプリの外（MCP 経由の追記・手編集）で行が挿さったときに、誰も気づかないまま
 * ID と行の対応が入れ替わる。行に載っていればその壊れ方をしない。
 *
 * 末尾に置くのは、
 *   - 先頭だと既存の列インデックス参照（`colwidth` / `colmode` / `align` / `group`）が
 *     すべて 1 つずれる。
 *   - 先頭だと ID の無い行を手で足したとき、1 列目の値を ID と誤読する。末尾なら
 *     「セルが足りない行」として素直に採番へ倒せる。
 * の 2 点による。
 *
 * 表としては見せない。読み込みで doc から抜き、保存で戻す。抜いてしまえば、レイアウト・
 * 条件付き書式・クリップボード・検証はいまの列インデックスのまま無改修で動く。
 */
import type { TsvDocument } from './parse.js';
import type { ParsedHeader } from './types.js';

/** ID 列の既定の列名。`#@ rowid` が無いファイルはこの名前で ID 列を探す。 */
export const ROW_ID_COLUMN = '_id';

/** ID 列を宣言するディレクティブ（`#@ rowid <列名>`）。 */
const ROW_ID_DIRECTIVE = 'rowid';

/**
 * ID の形式。`r` + 16 進 12 桁（48 bit）。
 *
 * 先頭を英字にしているのは、`#@ rowheight <key>=<px>` の key が「行インデックス
 * （数字のみ）」か「ID」かを構文だけで判別できるようにするため。数字だけの ID を
 * 許すと、まれに両方に読める key ができてしまう。
 */
const ROW_ID_PATTERN = /^r[0-9a-f]{12}$/;

/**
 * 行 ID の形かどうか。
 *
 * `#@ rowheight <key>=<px>` の key は、既存ファイルの行インデックス（数字のみ）と
 * ID が混ざる。振り分けの判断をこの 1 箇所に置く。
 */
export function isRowId(value: string): boolean {
  return ROW_ID_PATTERN.test(value);
}

/** 新しい行 ID を作る。 */
export function generateRowId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return `r${hex}`;
}

/**
 * ID 列を分離した検証シート。グリッド・MCP はこの形で扱う。
 *
 * ID を別の入れ物にせず doc そのものに載せているのは、行を増減させる操作
 * （貼り付け・複製・削除・空行の刈り取り）がグリッドの各所に散っているため。
 * doc と別に持つと、それぞれの呼び出し側が ID の並びを追随させる必要があり、
 * 1 箇所でも漏れると ID が別の行を指したまま保存される。
 */
export interface IdentifiedTsv extends TsvDocument {
  /** `rows` と同じ長さ・同じ並びの行 ID。 */
  rowIds: readonly string[];
  /** 書き戻すときの ID 列名。 */
  idColumn: string;
}

/** `#@ rowid <列名>` の宣言を読む。複数あれば後勝ち。無ければ null。 */
function declaredIdColumn(directives: readonly string[]): string | null {
  let name: string | null = null;
  for (const directive of directives) {
    if (directive.startsWith(`${ROW_ID_DIRECTIVE} `)) {
      // 列名に空白を含められるよう、種別語の後ろは全部を名前として取る。
      const rest = directive.slice(ROW_ID_DIRECTIVE.length + 1).trim();
      if (rest !== '') name = rest;
    }
  }
  return name;
}

/**
 * ID 列の位置と名前を決める。
 *
 * 宣言があればそれに従う。宣言が無くても末尾列が既定名なら ID 列とみなす
 * （手編集で `#@ rowid` 行だけ落ちたときに、ID がただの文字列列へ化けるのを防ぐ）。
 */
function locateIdColumn(doc: TsvDocument): { index: number; name: string } {
  const declared = declaredIdColumn(doc.directives);
  if (declared !== null) {
    return { index: doc.columns.findIndex((column) => column.name === declared), name: declared };
  }

  const last = doc.columns.length - 1;
  if (doc.columns[last]?.name === ROW_ID_COLUMN) {
    return { index: last, name: ROW_ID_COLUMN };
  }
  return { index: -1, name: ROW_ID_COLUMN };
}

/**
 * この検証シートが ID 列をファイルに持っているか。
 *
 * {@link withRowIds} は ID 列の無いファイルにも採番して返すので、返ってきた ID だけでは
 * 「ファイルに焼かれた ID」か「その場限りの採番」かを区別できない。ID 列を持たない
 * ファイルへ書き込むとき、ID 列ごと足すか、いまの体裁のまま残すかの判断に使う。
 */
export function hasRowIdColumn(doc: TsvDocument): boolean {
  return locateIdColumn(doc).index >= 0;
}

/**
 * 読み込み時に ID 列を doc から抜き、行 ID の並びとして取り出す。
 *
 * 形式に合わない値・重複した値は採番し直す。別ツールが書いた値をそのまま信用せず、
 * また同じ ID が 2 行を指す状態を残さない（ファイルをまたいだ参照が成立しなくなる）。
 * ID 列が無いファイルは全行を採番する（ファイルへ焼くのは保存時）。
 *
 * @param newId 採番方法の差し替え（既定は {@link generateRowId}）。
 */
export function withRowIds(doc: TsvDocument, newId: () => string = generateRowId): IdentifiedTsv {
  const { index, name } = locateIdColumn(doc);

  const rowIds: string[] = [];
  const taken = new Set<string>();
  const rows = doc.rows.map((cells) => {
    let id = index >= 0 ? (cells[index] ?? '') : '';
    if (!ROW_ID_PATTERN.test(id) || taken.has(id)) {
      do {
        id = newId();
      } while (taken.has(id));
    }
    taken.add(id);
    rowIds.push(id);

    if (index < 0 || index >= cells.length) return cells;
    const next = cells.slice();
    next.splice(index, 1);
    return next;
  });

  const columns = index >= 0 ? doc.columns.filter((_, i) => i !== index) : doc.columns;

  return { ...doc, columns, rows, rowIds, idColumn: name };
}

/**
 * 保存時に ID 列を末尾へ戻す。
 *
 * 宣言はディレクティブの先頭に置く。レイアウト系（`colwidth` 等）は書き戻しのたびに
 * 末尾へ付け直されるため、宣言を先頭に固定しておくと保存のたびに並びが揺れない。
 *
 * 持ち回り用の `rowIds` / `idColumn` は返り値から落とす。書き出し経路に居残ると
 * シリアライザや MCP の出力へ紛れ込む。
 */
export function withoutRowIds(identified: IdentifiedTsv): TsvDocument {
  const { rowIds, idColumn, ...doc } = identified;
  const index = doc.columns.length;
  const header: ParsedHeader = { name: idColumn, type: 'text', required: false };

  const rows = doc.rows.map((cells, i) => {
    const next = cells.slice();
    // ID の位置がずれないよう、足りない末尾セルは空で埋めてから差し込む。
    while (next.length < index) {
      next.push('');
    }
    next.splice(index, 0, rowIds[i] ?? generateRowId());
    return next;
  });

  const directives = [
    `${ROW_ID_DIRECTIVE} ${idColumn}`,
    ...doc.directives.filter((directive) => !directive.startsWith(`${ROW_ID_DIRECTIVE} `)),
  ];

  return { ...doc, directives, columns: [...doc.columns, header], rows };
}
