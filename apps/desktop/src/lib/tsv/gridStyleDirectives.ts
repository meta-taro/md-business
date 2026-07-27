/**
 * 検証グリッドの条件付き書式ディレクティブ（`#@ style`）。
 * ------------------------------------------------------------------
 * 「結果が OK なら緑、NG なら赤」のように、**特定列のセル値で行全体に薄い背景色**を敷く。
 * 実施状況が縦に流れる検証シートでは、値を 1 件ずつ読むより色の帯で残件を掴めるほうが速い。
 *
 * 記法は `#@ style <列名> <値>=<色> …`（例 `#@ style 結果 OK=#e4f5e9 NG=#fde8e7`）。
 * 既存の共有パーサ（`schema-test-spec-tsv`）が `#@` 行を `doc.directives` へ生文字列として
 * 収集・再出力するため、フォーマット契約を変えずに書式を tsv へ焼ける。
 *
 * 設計方針:
 * - **色は hex のみ許可**: 値はインライン style のカスタムプロパティへ渡るので、任意文字列を
 *   通すと CSS を差し込まれる。`#rgb` / `#rrggbb` だけを受け、他は黙って捨てる。
 * - **壊れた指定は捨てて描画は続ける**: 手書きされる行なので、解釈できない断片で
 *   グリッド全体を落とさない（レイアウト系ディレクティブと同じ扱い）。
 * - **純ロジック**: DOM 非依存で node 環境 vitest で検査。Svelte 側は読み出しを呼ぶ薄いグルー。
 */

/** 書式ディレクティブの種別語。 */
const STYLE = 'style';

/** インライン style へ流す色として許可する形（`#rgb` / `#rrggbb`）。 */
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** 1 本の `#@ style` 行を解釈した結果。 */
export interface RowTintRule {
  /** 判定に使う列の位置（列定義の並び）。 */
  columnIndex: number;
  /** セル値 → 行背景色（hex）。 */
  colors: ReadonlyMap<string, string>;
}

/** 対象ディレクティブなら本体（種別語を除いた残り）を返す。違えば null。 */
function bodyOf(directive: string, kind: string): string | null {
  if (directive === kind) return '';
  if (directive.startsWith(`${kind} `)) return directive.slice(kind.length + 1).trim();
  return null;
}

/**
 * ディレクティブ群から行背景色ルールを読む。`style` 以外は無視し、列定義に無い列名・
 * hex でない色は捨てる。妥当な色が 1 件も残らない行はルールを作らない。
 * 同じ値の重複は後勝ち。
 */
export function readRowTints(
  directives: readonly string[],
  columnNames: readonly string[],
): RowTintRule[] {
  const rules: RowTintRule[] = [];

  for (const directive of directives) {
    const body = bodyOf(directive, STYLE);
    if (body === null || body === '') continue;

    const tokens = body.split(/\s+/).filter((token) => token !== '');
    const [columnName, ...pairs] = tokens;
    if (columnName === undefined) continue;

    const columnIndex = columnNames.indexOf(columnName);
    if (columnIndex < 0) continue;

    const colors = new Map<string, string>();
    for (const token of pairs) {
      const eq = token.indexOf('=');
      if (eq <= 0) continue;
      const color = token.slice(eq + 1);
      if (!HEX_COLOR.test(color)) continue;
      colors.set(token.slice(0, eq), color);
    }

    if (colors.size > 0) rules.push({ columnIndex, colors });
  }

  return rules;
}

/**
 * 1 行に敷く背景色を解決する。対象列が未入力・対応色なし・行が短い場合は色なし。
 * 複数ルールが当たったら後勝ち（記載順の後ろを優先）。
 */
export function rowTintOf(
  rules: readonly RowTintRule[],
  row: readonly string[],
): string | undefined {
  let tint: string | undefined;

  for (const rule of rules) {
    const value = row[rule.columnIndex];
    if (value === undefined || value === '') continue;
    const color = rule.colors.get(value);
    if (color !== undefined) tint = color;
  }

  return tint;
}
