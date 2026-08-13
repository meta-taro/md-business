/**
 * 行の履歴（`git blame`）を検証シートの行へ結び付ける層。
 *
 * git が返せるのは「ファイルの何行目を、どのコミットが最後に変えたか」であって、
 * 表の何行目かではない。グリッドはマーカー行・ディレクティブ・ヘッダ行・控え行を
 * 落として並べ直すので、行番号どうしは対応しない。
 *
 * そこで**行に載っている ID を鍵にする**。ID はデータ行の末尾セルに書かれているので、
 * blame が返した行の中身から拾える。行が挿さっても消されても、ID が同じであれば
 * 同じ行を指し続ける（行番号で突き合わせるとここが崩れる）。
 */
import { isRowId } from '@md-business/schema-test-spec-tsv';

/** 1 行を最後に変えたコミット。 */
export interface RowBlameEntry {
  /** コミット hash（40 桁）。未コミットの行は 0 が並ぶ。 */
  commit: string;
  author: string;
  /** 作者日時（ミリ秒）。 */
  timeMs: number;
  /** コミットの 1 行目。 */
  summary: string;
  /** まだコミットしていない変更か。 */
  uncommitted: boolean;
}

/** 行 ID → その行を最後に変えたコミット。 */
export type RowBlame = Map<string, RowBlameEntry>;

/** `<40 桁 hash> <元行> <現行> [<行数>]` で始まる、1 行分の区切り。 */
const HEAD_PATTERN = /^([0-9a-f]{40}) \d+ \d+(?: \d+)?$/;

/** 内容行から行 ID を拾う。ID 列は末尾にあるので、後ろにあるものを採る。 */
function rowIdOf(content: string): string | null {
  const cells = content.split('\t');
  for (let i = cells.length - 1; i >= 0; i -= 1) {
    if (isRowId(cells[i] ?? '')) return cells[i] ?? null;
  }
  return null;
}

/**
 * `git blame --line-porcelain` の出力を、行 ID 別の履歴へ畳む。
 *
 * 行 ID を持たない行（マーカー・ディレクティブ・ヘッダ・ID を焼く前のファイル）は
 * 指す先が無いので載せない。載っていない行は表示側が何も出さない。
 */
export function parseRowBlame(porcelain: string): RowBlame {
  const blame: RowBlame = new Map();
  if (porcelain === '') return blame;

  let commit = '';
  let author = '';
  let timeMs = 0;
  let summary = '';

  for (const line of porcelain.split('\n')) {
    const head = HEAD_PATTERN.exec(line);
    if (head !== null) {
      commit = head[1] ?? '';
      // --line-porcelain は全行に属性を繰り返すが、同じコミットの 2 行目以降は
      // 省く実装もある。前の行の値を持ち越さないよう、区切りごとに空へ戻す。
      author = '';
      timeMs = 0;
      summary = '';
      continue;
    }
    if (line.startsWith('author ')) {
      author = line.slice('author '.length);
      continue;
    }
    if (line.startsWith('author-time ')) {
      timeMs = Number(line.slice('author-time '.length)) * 1000;
      continue;
    }
    if (line.startsWith('summary ')) {
      summary = line.slice('summary '.length);
      continue;
    }
    if (line.startsWith('\t')) {
      const id = rowIdOf(line.slice(1));
      if (id !== null && commit !== '') {
        blame.set(id, {
          commit,
          author,
          timeMs,
          summary,
          uncommitted: /^0+$/.test(commit),
        });
      }
    }
  }

  return blame;
}

/** 相対時刻の言い方（`Intl.RelativeTimeFormat` へ渡す形）。 */
export interface BlameAge {
  /** 過去なので負。1 分未満は 0。 */
  value: number;
  unit: Intl.RelativeTimeFormatUnit;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/**
 * コミット時刻から「どれくらい前か」を求める。
 *
 * コミット時刻は別の PC の時計で付くため、未来を指すことがある。「3 日後」と出すと
 * 履歴が壊れているように見えるので、未来は今として扱う。
 */
export function blameAge(timeMs: number, nowMs: number): BlameAge {
  const delta = Math.max(0, nowMs - timeMs);
  if (delta < MINUTE) return { value: 0, unit: 'minute' };
  if (delta < HOUR) return { value: -Math.floor(delta / MINUTE), unit: 'minute' };
  if (delta < DAY) return { value: -Math.floor(delta / HOUR), unit: 'hour' };
  if (delta < MONTH) return { value: -Math.floor(delta / DAY), unit: 'day' };
  if (delta < YEAR) return { value: -Math.floor(delta / MONTH), unit: 'month' };
  return { value: -Math.floor(delta / YEAR), unit: 'year' };
}

/**
 * 相対時刻を表示文字列にする。
 *
 * 言い回しは `Intl` に任せる。「3 日前」「昨日」の作り分けは言語ごとに違うので、
 * 翻訳文言を足して自前で組むと、どれかの言語で必ずおかしくなる。
 */
export function formatBlameAge(age: BlameAge, locale: string): string {
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(age.value, age.unit);
}
