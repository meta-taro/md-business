/**
 * 計算列（`#@ computed <列名> = <式>`）。
 *
 * 「値がほかから決まる列」を宣言し、人にも AI にも打たせない。現場で「実数で埋めて」の
 * 一声が集計列を潰し、そのまま提出物へ出た事故が発端。手間ではなく**間違った成果物が出る**
 * 類の欠落なので、色分けや注記ではなく書き込みそのものを塞ぐ。
 *
 * 見た目ではなく **どの値が正しいか** を決める規則なので、表示側のディレクティブ
 * （`#@ style` / `#@ colwidth` / `#@ note`）と違ってこの共有パッケージに置く。
 * グリッドと MCP の両方が同じ判定を使う必要がある。**アプリだけで守っても AI 側から潰せる**。
 *
 * 区切りに `=` を使うのは、列名に空白を含められるようにするため。
 * `#@` 行は {@link parseTsv} が `directives` へ生文字列として収集・再出力するので、
 * フォーマット契約を変えずに宣言を tsv へ焼ける。
 *
 * 設計方針:
 * - **式は既知のものだけ**: 解釈できない式は宣言ごと捨てる。塞いだのに値を出せないと、
 *   その列は編集不可のまま空で固定され、書く手段が消える。
 * - **値はファイルに書く**: 表計算へ貼ったときに空にならないようにするため。
 *   「未入力は空のまま」の規約は人が入力する欄のものであって、機械が決めた値には当たらない。
 * - **算出値と一致していれば同じ参照を返す**: 開いただけのファイルを変更扱いにしない。
 */
import type { TsvDocument } from './parse.js';

/** 計算列ディレクティブの種別語。 */
const COMPUTED_DIRECTIVE = 'computed';

/**
 * 解釈できる式。引数を取らないものだけを置いている。
 * 別ファイルを見る集計（`countIn`）はリンク定義が要るので、この段では受け付けない
 * （未知の式として捨てられる＝その列は普通の編集可能な列のまま）。
 */
export type ComputedFormula = 'rowNumber';

/** 式の表記 → 内部種別。表記は括弧まで含めて一致させる（式言語は作らない）。 */
const FORMULAS: ReadonlyMap<string, ComputedFormula> = new Map([['rowNumber()', 'rowNumber']]);

/** 1 本の `#@ computed` 行を解釈した結果。 */
export interface ComputedColumn {
  /** 対象列の位置（列定義の並び）。 */
  columnIndex: number;
  /** 値の決め方。 */
  formula: ComputedFormula;
}

/** 対象ディレクティブなら本体（種別語を除いた残り）を返す。違えば null。 */
function bodyOf(directive: string): string | null {
  if (directive === COMPUTED_DIRECTIVE) return '';
  if (directive.startsWith(`${COMPUTED_DIRECTIVE} `)) {
    return directive.slice(COMPUTED_DIRECTIVE.length + 1).trim();
  }
  return null;
}

/**
 * ディレクティブ群から計算列を読む。`computed` 以外は無視し、列定義に無い列名・
 * 未知の式・`=` を欠く行は捨てる。同じ列への重複宣言は後勝ちで 1 本に畳む。
 */
export function readComputedColumns(
  directives: readonly string[],
  columnNames: readonly string[],
): ComputedColumn[] {
  const byColumn = new Map<number, ComputedFormula>();

  for (const directive of directives) {
    const body = bodyOf(directive);
    if (body === null || body === '') continue;

    // 列名に空白を含められるよう、最初の `=` だけで切る。
    const eq = body.indexOf('=');
    if (eq <= 0) continue;

    const columnIndex = columnNames.indexOf(body.slice(0, eq).trim());
    if (columnIndex < 0) continue;

    const formula = FORMULAS.get(body.slice(eq + 1).trim());
    if (formula === undefined) continue;

    byColumn.set(columnIndex, formula);
  }

  return [...byColumn].map(([columnIndex, formula]) => ({ columnIndex, formula }));
}

/** 計算列の位置。書き込みを塞ぐ判定はこの集合で行う。 */
export function lockedColumns(computed: readonly ComputedColumn[]): ReadonlySet<number> {
  return new Set(computed.map((c) => c.columnIndex));
}

/** 1 セルぶんの算出値。 */
export function computedCellValue(formula: ComputedFormula, rowIndex: number): string {
  switch (formula) {
    case 'rowNumber':
      // 表示用の通し番号なので 1 始まり（行ヘッダの番号と揃える）。
      return String(rowIndex + 1);
  }
}

/**
 * 計算列のセルを算出値へ揃えた **新しい** ドキュメントを返す（入力は不変）。
 * 全セルが既に算出値と一致していれば、元の参照をそのまま返す。
 *
 * 貼り付け・一括編集・行の挿入削除のいずれの経路で値が入っても、最後にこれを通せば
 * 計算列は算出値へ戻る。経路ごとにガードを置くと、増えた経路から漏れる。
 */
export function applyComputed<T extends TsvDocument>(
  doc: T,
  computed: readonly ComputedColumn[],
): T {
  if (computed.length === 0) return doc;

  let changed = false;
  const rows = doc.rows.map((cells, rowIndex) => {
    let next: string[] | undefined;

    for (const { columnIndex, formula } of computed) {
      const value = computedCellValue(formula, rowIndex);
      if (cells[columnIndex] === value) continue;

      // 末尾セルが省略された短い行は、対象列まで空文字で伸ばしてから書く。
      next ??= cells.slice();
      while (next.length <= columnIndex) next.push('');
      next[columnIndex] = value;
      changed = true;
    }

    return next ?? cells;
  });

  return changed ? { ...doc, rows } : doc;
}
