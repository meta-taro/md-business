/**
 * 検証グリッドのレイアウト永続化ディレクティブ（Issue 010・
 * 列幅・行高・改行時の表示を変えられるようにし、それらを tsv 側に記憶する）。
 * ------------------------------------------------------------------
 * 列幅 / 行高 / 列表示モードを `#@ colwidth|rowheight|colmode` ディレクティブへ載せる。
 * 既存の共有パーサ（`schema-test-spec-tsv`）は `#@` 行を `doc.directives` に生文字列として
 * 収集・再出力する（round-trip 済み）ため、フォーマット契約を変えずにレイアウトを tsv へ
 * 焼ける。既存 `#@ style …`（条件付き書式）と同じ場所・同じ仕組みの追加ディレクティブ。
 *
 * 設計方針:
 * - **sparse**: 既定値と一致する列/行は出力しない（git diff を最小化・未調整ファイルは無汚染）。
 * - **他ディレクティブ非破壊**: `style` 等は温存し、レイアウト行だけを差し替える。
 * - **純ロジック**: DOM 非依存で node 環境 vitest で検査。Svelte 側は読み書きを呼ぶ薄いグルー。
 */
import { MIN_COL_WIDTH } from './gridLayout';
import { MIN_ROW_HEIGHT } from './gridRowLayout';
import { COL_OVERFLOW_MODES, type ColOverflowMode } from './gridColumnMode';

/** レイアウトディレクティブの種別（この 3 種だけを読み書き対象にする）。 */
const COLWIDTH = 'colwidth';
const ROWHEIGHT = 'rowheight';
const COLMODE = 'colmode';
const LAYOUT_KINDS = [COLWIDTH, ROWHEIGHT, COLMODE] as const;

/** 列型ごとに決まる既定レイアウト（呼び出し側が算出して渡す）。 */
export interface LayoutDefaults {
  /** 列ごとの既定幅（px・列定義の並び）。 */
  colWidths: number[];
  /** 列ごとの既定表示モード（multiline は wrap 等・列定義の並び）。 */
  colModes: ColOverflowMode[];
  /** 行の既定高（px・全行共通）。 */
  rowHeight: number;
}

/** 既定へ差分を重ねた実効レイアウト（dense・描画に使う並び）。 */
export interface GridLayout {
  colWidths: number[];
  colModes: ColOverflowMode[];
  rowHeights: number[];
}

/** 対象ディレクティブなら本体（種別語を除いた残り）を返す。違えば null。 */
function bodyOf(directive: string, kind: string): string | null {
  if (directive === kind) return '';
  if (directive.startsWith(`${kind} `)) return directive.slice(kind.length + 1).trim();
  return null;
}

/** `0=240 2=120` 形式を `[index, rawValue]` の並びへ。index が非負整数の組だけ通す。 */
function parsePairs(body: string): Array<[number, string]> {
  const pairs: Array<[number, string]> = [];
  for (const token of body.split(/\s+/)) {
    if (token === '') continue;
    const eq = token.indexOf('=');
    if (eq <= 0) continue;
    const key = token.slice(0, eq);
    if (!/^\d+$/.test(key)) continue;
    pairs.push([Number(key), token.slice(eq + 1)]);
  }
  return pairs;
}

/** 妥当な px 値（整数・下限以上）なら数値、でなければ null。 */
function parsePx(raw: string, min: number): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return value >= min ? value : null;
}

function isMode(raw: string): raw is ColOverflowMode {
  return (COL_OVERFLOW_MODES as readonly string[]).includes(raw);
}

/**
 * ディレクティブ群から実効レイアウトを組む。レイアウト以外（`style` 等）は無視し、
 * 各項目は既定値を土台に妥当な指定だけ上書きする（範囲外・非数・不正モードは捨てる）。
 * 同種が複数あれば後勝ち。
 */
export function readLayout(
  directives: readonly string[],
  rowCount: number,
  defaults: LayoutDefaults,
): GridLayout {
  const colWidths = defaults.colWidths.slice();
  const colModes = defaults.colModes.slice();
  const rowHeights = Array.from({ length: Math.max(0, rowCount) }, () => defaults.rowHeight);

  for (const directive of directives) {
    let body: string | null;
    if ((body = bodyOf(directive, COLWIDTH)) !== null) {
      for (const [i, raw] of parsePairs(body)) {
        const px = parsePx(raw, MIN_COL_WIDTH);
        if (px !== null && i < colWidths.length) colWidths[i] = px;
      }
    } else if ((body = bodyOf(directive, ROWHEIGHT)) !== null) {
      for (const [i, raw] of parsePairs(body)) {
        const px = parsePx(raw, MIN_ROW_HEIGHT);
        if (px !== null && i < rowHeights.length) rowHeights[i] = px;
      }
    } else if ((body = bodyOf(directive, COLMODE)) !== null) {
      for (const [i, raw] of parsePairs(body)) {
        if (isMode(raw) && i < colModes.length) colModes[i] = raw;
      }
    }
  }

  return { colWidths, colModes, rowHeights };
}

/** 既定と異なる要素だけを `index=value` 文字列の並びへ（sparse エンコード）。 */
function sparsePairs<T>(values: T[], defaultAt: (i: number) => T): string[] {
  const pairs: string[] = [];
  for (let i = 0; i < values.length; i++) {
    if (values[i] !== defaultAt(i)) pairs.push(`${i}=${values[i]}`);
  }
  return pairs;
}

/**
 * 実効レイアウトを sparse なレイアウトディレクティブへ書き戻す。レイアウト以外の
 * ディレクティブは元の順で温存し、レイアウト行（colwidth→rowheight→colmode の順）を
 * 末尾へ付け直す。差分ゼロの種別は行を出さない。
 */
export function writeLayoutDirectives(
  directives: readonly string[],
  layout: GridLayout,
  defaults: LayoutDefaults,
): string[] {
  const kept = directives.filter(
    (d) => !LAYOUT_KINDS.some((kind) => bodyOf(d, kind) !== null),
  );

  const lines: string[] = [];
  const widthPairs = sparsePairs(layout.colWidths, (i) => defaults.colWidths[i]);
  if (widthPairs.length > 0) lines.push(`${COLWIDTH} ${widthPairs.join(' ')}`);

  const heightPairs = sparsePairs(layout.rowHeights, () => defaults.rowHeight);
  if (heightPairs.length > 0) lines.push(`${ROWHEIGHT} ${heightPairs.join(' ')}`);

  const modePairs = sparsePairs(layout.colModes, (i) => defaults.colModes[i]);
  if (modePairs.length > 0) lines.push(`${COLMODE} ${modePairs.join(' ')}`);

  return [...kept, ...lines];
}
