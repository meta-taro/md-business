/**
 * 改版の印（CriticMarkup）と、版と改版履歴の突き合わせ。
 *
 * 印は本文に `{++追加++}` `{--削除--}` `{~~前~>後~~}` と書く。Word の変更履歴の代わりに、
 * 何を足して何を消したかを相手に見せて出すためのもの。出すときに
 * 「印を見せる版」と「印を外した清書」を選ぶ。どちらも同じ正本から作る。
 *
 * 社内版・提出版とは別の軸にしている。提出版を赤入れのまま出すことも、
 * 社内版を清書で読むこともあるため。
 */

/** 印を見せるか、印を外した清書にするか。 */
export type RevisionView = 'marked' | 'clean';

export type RevisionKind = 'insert' | 'delete' | 'substitute';

export interface RevisionMark {
  kind: RevisionKind;
  /** 削除・置換で消える側。追加では空。 */
  before: string;
  /** 追加・置換で残る側。削除では空。 */
  after: string;
}

/**
 * 描画の前に本文へ埋める区切り。Markdown の記号と衝突しない私用領域の文字を使う。
 * 生の HTML は既定で落とすので、`<ins>` をそのまま本文に書き込むことはできない。
 */
export const REVISION_INS_OPEN = '\uE100';
export const REVISION_INS_CLOSE = '\uE101';
export const REVISION_DEL_OPEN = '\uE102';
export const REVISION_DEL_CLOSE = '\uE103';

const CODE_OPEN = '\uE110';
const CODE_CLOSE = '\uE111';

const MARK = /\{\+\+([\s\S]*?)\+\+\}|\{--([\s\S]*?)--\}|\{~~([\s\S]*?)~>([\s\S]*?)~~\}/g;
const BLANK_LINE = /\n[ \t]*\n/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const CODE_SPAN = /(`+)[\s\S]*?\1/g;
const CODE_PLACEHOLDER = /(\d+)/g;

function toMark(match: RegExpExecArray | string[]): RevisionMark | null {
  const [whole = '', ins, del, before, after] = match;
  // 段落を越える印は閉じ忘れとみなす。拾うと後ろの段落まで消えたり下線が付いたりする。
  if (BLANK_LINE.test(whole)) return null;
  if (ins !== undefined) return { kind: 'insert', before: '', after: ins };
  if (del !== undefined) return { kind: 'delete', before: del, after: '' };
  return { kind: 'substitute', before: before ?? '', after: after ?? '' };
}

/**
 * コードの外だけに `transform` を当てる。コードの中の `{++` は書き方の見本なので印にしない。
 * インラインコードは一旦退避してから戻す。印の中にコードを書くこともあるため、
 * コードの所で区切ってしまうと、その印が拾えなくなる。
 */
function outsideCode(source: string, transform: (text: string) => string): string {
  const lines = source.split('\n');
  const out: string[] = [];
  let chunk: string[] = [];
  let fence: string | null = null;

  const flush = (): void => {
    if (chunk.length === 0) return;
    const codes: string[] = [];
    const hidden = chunk.join('\n').replace(CODE_SPAN, (code) => {
      codes.push(code);
      return `${CODE_OPEN}${codes.length - 1}${CODE_CLOSE}`;
    });
    const restored = transform(hidden).replace(
      CODE_PLACEHOLDER,
      (_, index: string) => codes[Number(index)] ?? '',
    );
    out.push(restored);
    chunk = [];
  };

  for (const line of lines) {
    const fenceMark = FENCE.exec(line)?.[1];
    if (fenceMark !== undefined && (fence === null || fence === fenceMark[0])) {
      if (fence === null) {
        flush();
        fence = fenceMark[0] ?? null;
      } else {
        fence = null;
      }
      out.push(line);
      continue;
    }
    if (fence !== null) out.push(line);
    else chunk.push(line);
  }
  flush();
  return out.join('\n');
}

function replaceMarks(source: string, render: (mark: RevisionMark) => string): string {
  return outsideCode(source, (text) =>
    text.replace(MARK, (...args: string[]) => {
      const mark = toMark(args);
      return mark === null ? args[0]! : render(mark);
    }),
  );
}

/** 本文にある印を前から順に返す（コードの中は除く）。 */
export function findRevisionMarks(source: string): RevisionMark[] {
  const marks: RevisionMark[] = [];
  replaceMarks(source, (mark) => {
    marks.push(mark);
    return '';
  });
  return marks;
}

/** 印が 1 つでもあるか。無い文書では「印を見せる / 清書」の切り替えを出さない。 */
export function hasRevisionMarks(source: string): boolean {
  return findRevisionMarks(source).length > 0;
}

/** 清書にする。追加は残し、削除は消し、置換は後ろを採る。 */
export function acceptRevisions(source: string): string {
  return replaceMarks(source, (mark) => mark.after);
}

/** 印を見せる版のために、印を描画用の区切りへ置き換える。 */
export function markRevisions(source: string): string {
  return replaceMarks(source, (mark) => {
    const del = mark.before === '' ? '' : `${REVISION_DEL_OPEN}${mark.before}${REVISION_DEL_CLOSE}`;
    const ins = mark.after === '' ? '' : `${REVISION_INS_OPEN}${mark.after}${REVISION_INS_CLOSE}`;
    return del + ins;
  });
}

const HISTORY_HEADING =
  /^ {0,3}#{1,6}\s+(?:[\d.]+\s*)?(改版履歴|改訂履歴|変更履歴|版履歴|revision history|change history|change log|changelog)\s*#*\s*$/i;
const VERSION_HEADER = /^(版|バージョン|改版|改訂|版数|version|ver\.?|rev\.?|revision)$/i;
const TABLE_ROW = /^\s*\|/;
const TABLE_RULE = /^\s*\|?\s*:?-{2,}/;

function cellsOf(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function normalizeVersion(value: string): string {
  return value
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/^v(?=\d)/i, '')
    .replace(/\s+/g, '');
}

/** 改版履歴の表に書かれている版を集める。表が無ければ null。 */
function historyVersions(body: string): string[] | null {
  const lines = body.split('\n').map((line) => line.replace(/\r$/, ''));
  let fence: string | null = null;
  let inSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const fenceMark = FENCE.exec(line)?.[1];
    if (fenceMark !== undefined) {
      if (fence === null) fence = fenceMark[0] ?? null;
      else if (fence === fenceMark[0]) fence = null;
      continue;
    }
    if (fence !== null) continue;

    if (HISTORY_HEADING.test(line)) {
      inSection = true;
      continue;
    }
    if (!inSection) continue;
    // 履歴の見出しの後、表より先に次の見出しが来たら、その節には表が無い。
    if (/^ {0,3}#{1,6}\s/.test(line)) {
      inSection = false;
      continue;
    }
    if (!TABLE_ROW.test(line) || !TABLE_RULE.test(lines[i + 1] ?? '')) continue;

    const header = cellsOf(line);
    const found = header.findIndex((cell) => VERSION_HEADER.test(cell));
    const column = found === -1 ? 0 : found;
    const versions: string[] = [];
    for (let j = i + 2; j < lines.length && TABLE_ROW.test(lines[j]!); j++) {
      const cell = cellsOf(lines[j]!)[column];
      if (cell !== undefined && cell !== '') versions.push(normalizeVersion(cell));
    }
    return versions;
  }
  return null;
}

function versionOf(frontmatter: Record<string, unknown>): string | null {
  for (const key of ['version', '版', 'バージョン']) {
    const value = frontmatter[key];
    if (typeof value === 'string' && value.trim() !== '') return value;
    if (typeof value === 'number') return String(value);
  }
  return null;
}

/**
 * frontmatter の版が改版履歴の表に載っているかを見る。
 *
 * 版だけ上げて履歴を書き忘れると、提出先からは「何が変わったか分からない版」に見える。
 * 書き出しは止めない。履歴の表を持たない文書・版の無い文書には何も言わない。
 */
export function revisionHistoryWarnings(
  frontmatter: Record<string, unknown>,
  body: string,
): string[] {
  const version = versionOf(frontmatter);
  if (version === null) return [];
  const versions = historyVersions(body);
  if (versions === null) return [];
  if (versions.includes(normalizeVersion(version))) return [];
  return [`版 ${version} が改版履歴の表にありません。版を上げたら、履歴にその版の行を足してください。`];
}
