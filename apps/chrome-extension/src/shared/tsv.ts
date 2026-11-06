/**
 * 検証シート（カスタム TSV）を読み取り専用の表として描く。
 *
 * TSV は frontmatter で見分ける Markdown ではないので、プラグインの登録簿には載せず、
 * 1 行目の印で先に振り分ける。版面の HTML と CSS は renderer-pdf の検証シート用を
 * そのまま使う（デスクトップの下見・PDF と同じ見た目にするため）。
 *
 * 拡張は見るだけなので、行 ID の列と控えの行（`#@ hidden`）はここで外す。
 * 表に出していないものが刷り上がりにだけ現れると、消したはずのものが渡した先で見える。
 */
import {
  applyComputed,
  parseTsv,
  readComputedColumns,
  splitHiddenRows,
  withRowIds,
} from '@md-business/schema-test-spec-tsv';
import {
  renderTestSpecTsvBody,
  type TestSpecTsvOrientation,
  type TestSpecTsvPrintDoc,
  type TestSpecTsvPrintRow,
} from '@md-business/renderer-pdf';

export const TEST_SPEC_TSV_PLUGIN_ID = 'test-spec-tsv';
export const TEST_SPEC_TSV_STYLES_HREF = 'styles/test-spec-tsv.css';

const MAGIC = '#! md-business:test-spec-tsv/v1';
const FALLBACK_TITLE = '検証シート';
const TITLE_KEYS = ['タイトル', 'Title', 'title'];
const NUMBER_KEYS = ['文書番号', 'Document No.', 'documentNumber'];
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * `#@ style` が無いシートでも結果の帯は読めるようにする既定色。
 * 雛形の宣言と同じ色にしておき、宣言の有無で見え方が変わらないようにする。
 */
const DEFAULT_RESULT_COLUMN = '結果';
const DEFAULT_RESULT_TINTS: ReadonlyMap<string, string> = new Map([
  ['OK', '#e7f6ec'],
  ['NG', '#fcebec'],
  ['保留', '#fdf3e2'],
]);

/** 開いてよいファイル名か（Markdown と検証シート）。 */
export function isOpenableFileName(name: string): boolean {
  return /\.(md|markdown|tsv)$/i.test(name);
}

/** 1 行目が検証シートの印か。BOM と行末の `\r` は見ない。 */
export function isTestSpecTsv(source: string): boolean {
  const firstLine = stripBom(source).split('\n', 1)[0] ?? '';
  return firstLine.replace(/\r$/, '').startsWith(MAGIC);
}

export interface RenderedTsv {
  bodyHtml: string;
  documentTitle: string;
  pdfFileName: string;
}

export interface RenderTestSpecTsvOptions {
  /** 用紙の向き。省略で横。 */
  orientation?: TestSpecTsvOrientation;
}

/** 検証シートを表の HTML にする。純関数（DOM を触らない）。 */
export function renderTestSpecTsv(
  source: string,
  options: RenderTestSpecTsvOptions = {},
): RenderedTsv {
  const parsed = parseTsv(stripBom(source).replace(/\r\n/g, '\n'));
  // withRowIds が ID 列を外す。持ち回りの rowIds は表に出さないのでここで捨てる。
  const { doc } = splitHiddenRows(withRowIds(parsed));
  const names = doc.columns.map((column) => column.name);
  const healed = applyComputed(doc, readComputedColumns(doc.directives, names));

  const tints = readRowTints(doc.directives, names);
  const rows: TestSpecTsvPrintRow[] = healed.rows.map((cells) => {
    const tint = rowTintOf(tints, cells);
    return tint === undefined ? { cells } : { cells, tint };
  });

  const titleKey = TITLE_KEYS.find((key) => (doc.meta[key] ?? '') !== '');
  const title = titleKey === undefined ? FALLBACK_TITLE : (doc.meta[titleKey] as string);
  const meta = Object.entries(doc.meta)
    .filter(([key, value]) => key !== titleKey && value !== '')
    .map(([key, value]) => ({ key, value }));

  const printDoc: TestSpecTsvPrintDoc = {
    title,
    meta,
    notes: readNotes(doc.directives),
    columns: names.map((name) => ({ name })),
    rows,
    ...(options.orientation === undefined ? {} : { orientation: options.orientation }),
  };

  const numberKey = NUMBER_KEYS.find((key) => (doc.meta[key] ?? '') !== '');
  return {
    bodyHtml: renderTestSpecTsvBody(printDoc),
    documentTitle: title,
    pdfFileName: numberKey === undefined ? title : `${doc.meta[numberKey]}_${title}`,
  };
}

function stripBom(source: string): string {
  return source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
}

/** 種別語に続く本体を返す。違う種別なら null。 */
function bodyOf(directive: string, kind: string): string | null {
  if (directive === kind) return '';
  if (directive.startsWith(`${kind} `)) return directive.slice(kind.length + 1).trim();
  return null;
}

function readNotes(directives: readonly string[]): string[] {
  return directives
    .map((directive) => bodyOf(directive, 'note'))
    .filter((body): body is string => body !== null && body !== '');
}

interface RowTintRule {
  columnIndex: number;
  colors: ReadonlyMap<string, string>;
}

/** `#@ style <列名> <値>=<色> …` を読む。宣言が 1 本も無ければ結果列の既定色を使う。 */
function readRowTints(directives: readonly string[], names: readonly string[]): RowTintRule[] {
  const rules: RowTintRule[] = [];
  let declared = false;
  for (const directive of directives) {
    const body = bodyOf(directive, 'style');
    if (body === null || body === '') continue;
    declared = true;
    const [columnName, ...pairs] = body.split(/\s+/).filter((token) => token !== '');
    const columnIndex = columnName === undefined ? -1 : names.indexOf(columnName);
    if (columnIndex < 0) continue;
    const colors = new Map<string, string>();
    for (const pair of pairs) {
      const eq = pair.indexOf('=');
      if (eq <= 0) continue;
      const color = pair.slice(eq + 1);
      if (HEX_COLOR.test(color)) colors.set(pair.slice(0, eq), color);
    }
    if (colors.size > 0) rules.push({ columnIndex, colors });
  }
  if (!declared) {
    const columnIndex = names.indexOf(DEFAULT_RESULT_COLUMN);
    if (columnIndex >= 0) rules.push({ columnIndex, colors: DEFAULT_RESULT_TINTS });
  }
  return rules;
}

/** 後に書いた宣言が勝つ。 */
function rowTintOf(rules: readonly RowTintRule[], row: readonly string[]): string | undefined {
  let tint: string | undefined;
  for (const rule of rules) {
    const value = row[rule.columnIndex];
    if (value === undefined || value === '') continue;
    tint = rule.colors.get(value) ?? tint;
  }
  return tint;
}
