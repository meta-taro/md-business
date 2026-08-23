/**
 * セルの注釈（`#@ annot <行ID>\t<列名>\t<本文>`）。
 *
 * 「この値がこうなっている理由」をセルの中に書くと、表が読めなくなる。かといって `備考` 列に
 * 寄せると、どのセルについての話なのかが落ちる。注釈はその行き場で、**セルに紐づいた本文**を
 * 表の外に持つ。
 *
 * ## 印（`#@ mark`）とは分ける
 *
 * 指し方（行 ID + 列名）は同じだが、寿命が違う。印は「ここが変わった」で、次の版で消える。
 * 注釈は「なぜこうなのか」で、値が変わらない限り残る。同じ宣言に混ぜると、印を消す操作で
 * 注釈まで消える。
 *
 * ## 区切りはタブ
 *
 * 列名に空白が入り得るので、空白では切れない（`#@ mark` が `,` で切っているのと同じ理由）。
 * 本文は自由文なので `,` でも切れない。本文は {@link escapeCell} でタブと改行を畳んであり、
 * 列名もヘッダがタブ区切りである以上タブを含み得ないので、**タブだけが必ず曖昧にならない**。
 *
 * ## 番号は持たない
 *
 * 紙に出すときの通し番号はファイルに書かない。1 件挿しただけで以降の全番号が振り直しになり、
 * 宣言ブロック全体が書き換わって差分が読めなくなる。番号は刷るときに上から振る。
 *
 * ## 知らない列名も落とさない
 *
 * 列名を打ち間違えた注釈を読み込みで黙って消すと、消えたことに気づけない。書いたとおりを
 * 保ち、引けない注釈は画面に出ないだけにする（`#@ mark` / `#@ style` と同じ扱い）。
 */
import { escapeCell, unescapeCell } from './escape.js';
import { isRowId } from './rowId.js';

/** ディレクティブの種別語。 */
const ANNOT_DIRECTIVE = 'annot';

/** 行 ID・列名・本文の区切り。 */
const FIELD_SEPARATOR = '\t';

/** セル 1 つに付いた注釈 1 件。 */
export interface CellAnnotation {
  /** 注釈を付けたセルの行 ID。 */
  id: string;
  /** 注釈を付けたセルの列名。 */
  column: string;
  /** 注釈の本文（生の文字列。改行を含み得る）。 */
  body: string;
}

/** 対象ディレクティブなら本体（種別語を除いた残り）を返す。違えば null。 */
function bodyOf(directive: string): string | null {
  if (directive === ANNOT_DIRECTIVE) return '';
  for (const separator of [FIELD_SEPARATOR, ' ']) {
    if (directive.startsWith(`${ANNOT_DIRECTIVE}${separator}`)) {
      return directive.slice(ANNOT_DIRECTIVE.length + 1);
    }
  }
  return null;
}

/**
 * `#@ annot` 行から注釈を**書いた順に**読む。
 *
 * 同じセルに 2 件あってもまとめない。別々に消せる必要があり、まとめると 1 件だけ消す操作が
 * 作れなくなる。行 ID の形をしていない指定・列名や本文が空の宣言は捨てる。
 */
export function readAnnotations(directives: readonly string[]): CellAnnotation[] {
  const annotations: CellAnnotation[] = [];

  for (const directive of directives) {
    const body = bodyOf(directive);
    if (body === null || body === '') continue;

    const fields = body.split(FIELD_SEPARATOR);
    const id = fields[0] ?? '';
    const column = (fields[1] ?? '').trim();
    // 本文にタブは入らない（書き出しで畳んである）が、外から書かれた分は繋いで拾う。
    const text = unescapeCell(fields.slice(2).join(FIELD_SEPARATOR)).trim();

    if (!isRowId(id) || column === '' || text === '') continue;
    annotations.push({ id, column, body: text });
  }

  return annotations;
}

/**
 * 注釈の宣言を書き直す。既存の `annot` 行は落として書き直し、注釈が無ければ行ごと落とす
 * （触っていないファイルに空の宣言行が生えないように）。
 */
export function setAnnotations(
  directives: readonly string[],
  annotations: readonly CellAnnotation[],
): string[] {
  const kept = directives.filter((directive) => bodyOf(directive) === null);

  for (const { id, column, body } of annotations) {
    const text = body.trim();
    if (!isRowId(id) || column.trim() === '' || text === '') continue;
    kept.push(
      [ANNOT_DIRECTIVE, id, column.trim(), escapeCell(text)].join(FIELD_SEPARATOR),
    );
  }

  return kept;
}
