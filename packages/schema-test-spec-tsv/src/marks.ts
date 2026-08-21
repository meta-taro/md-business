/**
 * 手で付けるセルの印（`#@ mark <行ID> <列名>,…`）。
 *
 * 直した箇所の赤字は、ふだんは前の版との突き合わせ（`diffSheets`）が出す。人が手で
 * 塗ると塗り忘れた行が「変えていない行」として相手へ渡るからで、そこは変えない。
 *
 * ここが引き受けるのは、その突き合わせに落ちない例外だけ。
 *
 * - 比べる前の版がまだ無い（新しく起こしたシートを最初に出す）
 * - 値は前の版と同じだが、指しているものが変わった（参照先の仕様が別物になった）
 * - 相手の求めで、直していない箇所にも印が要る
 *
 * 逃げ道なので、**印は消せる**ことを同じだけ大事にする。手で付けた印は突き合わせと違って
 * 版が進んでも勝手に消えない。消し方が無いと、去年の赤字が残ったまま提出され続ける。
 *
 * ## 行は ID で指す
 *
 * 行番号で指すと 1 行挿した時点で別のセルが赤くなる（`#@ rowheight` が抱えていた壊れ方）。
 *
 * ## 知らない列名も落とさない
 *
 * 列名を打ち間違えた印を読み込みで黙って消すと、消えたことに気づけない。書いたとおりを
 * 保ち、引けない印は画面に出ないだけにする（`#@ style` と同じ扱い）。
 */
import { isRowId } from './rowId.js';

/** ディレクティブの種別語。 */
const MARK_DIRECTIVE = 'mark';

/** 列名の区切り。列名自体に空白が入り得るので、空白では切らない。 */
const COLUMN_SEPARATOR = ',';

/** 対象ディレクティブなら本体（種別語を除いた残り）を返す。違えば null。 */
function bodyOf(directive: string): string | null {
  if (directive === MARK_DIRECTIVE) return '';
  if (directive.startsWith(`${MARK_DIRECTIVE} `)) {
    return directive.slice(MARK_DIRECTIVE.length + 1).trim();
  }
  return null;
}

/**
 * `#@ mark` 行から印を記載順に読む。行 ID ごとに列名の並びを返す。
 *
 * 同じ行が 2 本あれば足し合わせる（後勝ちにすると、手で 1 本足した時点で前の印が消える）。
 * 行 ID の形をしていない指定と、列名が 1 つも無い宣言は捨てる。
 */
export function readMarks(directives: readonly string[]): Map<string, string[]> {
  const marks = new Map<string, string[]>();

  for (const directive of directives) {
    const body = bodyOf(directive);
    if (body === null || body === '') continue;

    const at = body.search(/\s/);
    if (at < 0) continue;
    const id = body.slice(0, at);
    if (!isRowId(id)) continue;

    const columns = marks.get(id) ?? [];
    for (const name of body
      .slice(at + 1)
      .split(COLUMN_SEPARATOR)
      .map((part) => part.trim())) {
      if (name === '' || columns.includes(name)) continue;
      columns.push(name);
    }
    if (columns.length > 0) marks.set(id, columns);
  }

  return marks;
}

/**
 * 印の宣言を書き直す。既存の `mark` 行は落として書き直し、印が無ければ行ごと落とす
 * （触っていないファイルに空の宣言行が生えないように）。
 */
export function setMarks(
  directives: readonly string[],
  marks: ReadonlyMap<string, readonly string[]>,
): string[] {
  const kept = directives.filter((directive) => bodyOf(directive) === null);

  for (const [id, columns] of marks) {
    if (!isRowId(id) || columns.length === 0) continue;
    kept.push(`${MARK_DIRECTIVE} ${id} ${columns.join(COLUMN_SEPARATOR)}`);
  }

  return kept;
}
