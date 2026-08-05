/**
 * 検証グリッドのレイアウト永続化ディレクティブ（
 * 列幅・行高・改行時の表示・寄せを変えられるようにし、それらを tsv 側に記憶する）。
 * ------------------------------------------------------------------
 * 列幅 / 行高 / 列表示モード / 列寄せを `#@ colwidth|rowheight|colmode|align` へ載せる。
 * 既存の共有パーサ（`schema-test-spec-tsv`）は `#@` 行を `doc.directives` に生文字列として
 * 収集・再出力する（round-trip 済み）ため、フォーマット契約を変えずにレイアウトを tsv へ
 * 焼ける。既存 `#@ style …`（条件付き書式）と同じ場所・同じ仕組みの追加ディレクティブ。
 *
 * 設計方針:
 * - **sparse**: 既定値と一致する列/行は出力しない（git diff を最小化・未調整ファイルは無汚染）。
 * - **行は ID で指す**: 列は途中に挿さらないので index で足りるが、行は挿さる。行インデックス
 *   のままだと 1 行足しただけで以降の行高が全部ずれる。読むときは数字キーも受けて既存
 *   ファイルと互換を保つ（ID は英字始まりなので構文だけで振り分けられる）。
 * - **他ディレクティブ非破壊**: `style` 等は温存し、レイアウト行だけを差し替える。
 * - **純ロジック**: DOM 非依存で node 環境 vitest で検査。Svelte 側は読み書きを呼ぶ薄いグルー。
 */
import { isRowId } from '@md-business/schema-test-spec-tsv';
import { MIN_COL_WIDTH } from './gridLayout';
import { MIN_ROW_HEIGHT } from './gridRowLayout';
import { COL_OVERFLOW_MODES, type ColOverflowMode } from './gridColumnMode';
import { COL_ALIGNS, type ColAlign } from './gridColumnAlign';

/** レイアウトディレクティブの種別（この 4 種だけを読み書き対象にする）。 */
const COLWIDTH = 'colwidth';
const ROWHEIGHT = 'rowheight';
const COLMODE = 'colmode';
const ALIGN = 'align';
const LAYOUT_KINDS = [COLWIDTH, ROWHEIGHT, COLMODE, ALIGN] as const;

/** 列型ごとに決まる既定レイアウト（呼び出し側が算出して渡す）。 */
export interface LayoutDefaults {
  /** 列ごとの既定幅（px・列定義の並び）。 */
  colWidths: number[];
  /** 列ごとの既定表示モード（multiline は wrap 等・列定義の並び）。 */
  colModes: ColOverflowMode[];
  /** 列ごとの既定寄せ（number は right 等・列定義の並び）。 */
  colAligns: ColAlign[];
  /** 行の既定高（px・全行共通）。 */
  rowHeight: number;
}

/** 既定へ差分を重ねた実効レイアウト（dense・描画に使う並び）。 */
export interface GridLayout {
  colWidths: number[];
  colModes: ColOverflowMode[];
  colAligns: ColAlign[];
  rowHeights: number[];
}

/** 対象ディレクティブなら本体（種別語を除いた残り）を返す。違えば null。 */
function bodyOf(directive: string, kind: string): string | null {
  if (directive === kind) return '';
  if (directive.startsWith(`${kind} `)) return directive.slice(kind.length + 1).trim();
  return null;
}

/** `0=240 2=120` 形式を `[key, rawValue]` の並びへ。key の意味は種別ごとに解く。 */
function parsePairs(body: string): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (const token of body.split(/\s+/)) {
    if (token === '') continue;
    const eq = token.indexOf('=');
    if (eq <= 0) continue;
    pairs.push([token.slice(0, eq), token.slice(eq + 1)]);
  }
  return pairs;
}

/** 列指定のキー。非負整数のみ。 */
function colIndex(key: string): number | null {
  return /^\d+$/.test(key) ? Number(key) : null;
}

/**
 * 行指定のキーを行番号へ。ID なら該当行、数字なら行インデックス（既存ファイル互換）。
 * この文書に無い ID は null（消えた行の指定を別の行へ流用しない）。
 */
function rowIndex(key: string, rowIds: readonly string[]): number | null {
  if (isRowId(key)) {
    const at = rowIds.indexOf(key);
    return at >= 0 ? at : null;
  }
  return colIndex(key);
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

function isAlign(raw: string): raw is ColAlign {
  return (COL_ALIGNS as readonly string[]).includes(raw);
}

/**
 * ディレクティブ群から実効レイアウトを組む。レイアウト以外（`style` 等）は無視し、
 * 各項目は既定値を土台に妥当な指定だけ上書きする（範囲外・非数・不正モードは捨てる）。
 * 同種が複数あれば後勝ち。
 */
export function readLayout(
  directives: readonly string[],
  rowIds: readonly string[],
  defaults: LayoutDefaults,
): GridLayout {
  const colWidths = defaults.colWidths.slice();
  const colModes = defaults.colModes.slice();
  const colAligns = defaults.colAligns.slice();
  const rowHeights = rowIds.map(() => defaults.rowHeight);

  for (const directive of directives) {
    let body: string | null;
    if ((body = bodyOf(directive, COLWIDTH)) !== null) {
      for (const [key, raw] of parsePairs(body)) {
        const i = colIndex(key);
        const px = parsePx(raw, MIN_COL_WIDTH);
        if (i !== null && px !== null && i < colWidths.length) colWidths[i] = px;
      }
    } else if ((body = bodyOf(directive, ROWHEIGHT)) !== null) {
      for (const [key, raw] of parsePairs(body)) {
        const i = rowIndex(key, rowIds);
        const px = parsePx(raw, MIN_ROW_HEIGHT);
        if (i !== null && px !== null && i < rowHeights.length) rowHeights[i] = px;
      }
    } else if ((body = bodyOf(directive, COLMODE)) !== null) {
      for (const [key, raw] of parsePairs(body)) {
        const i = colIndex(key);
        if (i !== null && isMode(raw) && i < colModes.length) colModes[i] = raw;
      }
    } else if ((body = bodyOf(directive, ALIGN)) !== null) {
      for (const [key, raw] of parsePairs(body)) {
        const i = colIndex(key);
        if (i !== null && isAlign(raw) && i < colAligns.length) colAligns[i] = raw;
      }
    }
  }

  return { colWidths, colModes, colAligns, rowHeights };
}

/** 既定と異なる要素だけを `key=value` 文字列の並びへ（sparse エンコード）。 */
function sparsePairs<T>(
  values: T[],
  defaultAt: (i: number) => T,
  keyAt: (i: number) => string | undefined = (i) => String(i),
): string[] {
  const pairs: string[] = [];
  for (let i = 0; i < values.length; i++) {
    if (values[i] === defaultAt(i)) continue;
    const key = keyAt(i);
    // ID の無い行は指しようがないので落とす（並びの穴を作るより出さないほうが安全）。
    if (key === undefined) continue;
    pairs.push(`${key}=${values[i]}`);
  }
  return pairs;
}

/**
 * 実効レイアウトを sparse なレイアウトディレクティブへ書き戻す。レイアウト以外の
 * ディレクティブは元の順で温存し、レイアウト行（colwidth→rowheight→colmode→align の順）を
 * 末尾へ付け直す。差分ゼロの種別は行を出さない。
 *
 * 行高のキーは行 ID。`rowIds` は `layout.rowHeights` と同じ並び。
 */
export function writeLayoutDirectives(
  directives: readonly string[],
  layout: GridLayout,
  defaults: LayoutDefaults,
  rowIds: readonly string[],
): string[] {
  const kept = directives.filter(
    (d) => !LAYOUT_KINDS.some((kind) => bodyOf(d, kind) !== null),
  );

  const lines: string[] = [];
  const widthPairs = sparsePairs(layout.colWidths, (i) => defaults.colWidths[i]);
  if (widthPairs.length > 0) lines.push(`${COLWIDTH} ${widthPairs.join(' ')}`);

  // 行高は常に ID キーで書く。行インデックスで書かれていた既存ファイルは、
  // レイアウトを触った時点でこの形へ移る。
  const heightPairs = sparsePairs(
    layout.rowHeights,
    () => defaults.rowHeight,
    (i) => rowIds[i],
  );
  if (heightPairs.length > 0) lines.push(`${ROWHEIGHT} ${heightPairs.join(' ')}`);

  const modePairs = sparsePairs(layout.colModes, (i) => defaults.colModes[i]);
  if (modePairs.length > 0) lines.push(`${COLMODE} ${modePairs.join(' ')}`);

  const alignPairs = sparsePairs(layout.colAligns, (i) => defaults.colAligns[i]);
  if (alignPairs.length > 0) lines.push(`${ALIGN} ${alignPairs.join(' ')}`);

  return [...kept, ...lines];
}
