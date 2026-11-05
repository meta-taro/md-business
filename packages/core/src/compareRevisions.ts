/**
 * 2 つの版を突き合わせて、改版の印（CriticMarkup）を付けた本文を作る。
 *
 * 出した印は `markRevisions` を通る普通の印なので、下線・取り消し線・余白の縦線・
 * PDF の印刷は「印を見せる版」と同じ経路で出る。比較のために別の描き方を持たない。
 *
 * 行で突き合わせてから、対になった行の中を文字で突き合わせる。Markdown の記号
 * （強調・リンク・コード）をまたぐ変更は、片側だけ記号を消すと描画が崩れるので、
 * 行の中身ごと置き換えとして見せる。コードの中は印が効かないので、新しい版をそのまま出す。
 */
import { acceptRevisions } from './revisions.js';


const FENCE = /^ {0,3}(`{3,}|~{3,})/;
/** 行頭の構造（見出し・箇条・引用）。印はこの後ろに付ける。 */
const PREFIX = /^(?:\s*(?:#{1,6}\s+|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+|>\s?))*\s*/;
const TABLE_ROW = /^\s*\|/;
const TABLE_RULE = /^\s*\|?\s*:?-{2,}/;
/** 片側だけ消すと描画が崩れる記号。変更がこれを含めば行ごと置き換える。 */
const SYNTAX = /[*_`[\]()<>\\|{}~!]/;
/** これより短い一致は、前後の変更とまとめて 1 つの置き換えにする（細切れの印は読めない）。 */
const MERGE_GAP = 2;
/** 文字の突き合わせにかける上限（長さの積）。超えたら行ごと置き換える。 */
const CHAR_DIFF_LIMIT = 4_000_000;

function lcsOps<T>(a: T[], b: T[], same: (x: T, y: T) => boolean): Array<{ type: 'same' | 'del' | 'ins'; a?: T; b?: T }> {
  const n = a.length;
  const m = b.length;
  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] = same(a[i]!, b[j]!)
        ? table[(i + 1) * width + j + 1]! + 1
        : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!);
    }
  }
  const ops: Array<{ type: 'same' | 'del' | 'ins'; a?: T; b?: T }> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (same(a[i]!, b[j]!)) {
      ops.push({ type: 'same', a: a[i]!, b: b[j]! });
      i++;
      j++;
    } else if (table[(i + 1) * width + j]! >= table[i * width + j + 1]!) {
      ops.push({ type: 'del', a: a[i++]! });
    } else {
      ops.push({ type: 'ins', b: b[j++]! });
    }
  }
  while (i < n) ops.push({ type: 'del', a: a[i++]! });
  while (j < m) ops.push({ type: 'ins', b: b[j++]! });
  return ops;
}

function mark(before: string, after: string): string {
  if (before === '' && after === '') return '';
  if (before === '') return `{++${after}++}`;
  if (after === '') return `{--${before}--}`;
  return `{~~${before}~>${after}~~}`;
}

/** 文字で突き合わせる。記号をまたぐ変更があれば null（呼ぶ側が行ごと置き換える）。 */
function diffChars(before: string, after: string): string | null {
  if (before.length * after.length > CHAR_DIFF_LIMIT) return null;
  const ops = lcsOps([...before], [...after], (x, y) => x === y);

  // 変更のかたまりと一致のかたまりを交互に並べる。
  type Run = { same: boolean; before: string; after: string };
  const runs: Run[] = [];
  for (const op of ops) {
    const same = op.type === 'same';
    let last = runs[runs.length - 1];
    if (last === undefined || last.same !== same) {
      last = { same, before: '', after: '' };
      runs.push(last);
    }
    if (op.a !== undefined) last.before += op.a;
    if (op.b !== undefined) last.after += op.b;
  }

  // 変更に挟まれた短い一致は、両隣の変更にまとめる。
  const merged: Run[] = [];
  for (let k = 0; k < runs.length; k++) {
    const run = runs[k]!;
    const prev = merged[merged.length - 1];
    const next = runs[k + 1];
    if (run.same && prev && !prev.same && next && !next.same && [...run.before].length <= MERGE_GAP) {
      prev.before += run.before + next.before;
      prev.after += run.after + next.after;
      k++;
      continue;
    }
    if (!run.same && prev && !prev.same) {
      prev.before += run.before;
      prev.after += run.after;
      continue;
    }
    merged.push({ ...run });
  }

  let out = '';
  for (const run of merged) {
    if (run.same) {
      out += run.after;
      continue;
    }
    if (SYNTAX.test(run.before) || SYNTAX.test(run.after)) return null;
    out += mark(run.before, run.after);
  }
  return out;
}

function splitPrefix(line: string): [string, string] {
  const prefix = PREFIX.exec(line)?.[0] ?? '';
  return [prefix, line.slice(prefix.length)];
}

/** 表の行を `|` で区切る（`\|` は区切りにしない）。区切りの外の空白は残す。 */
function splitCells(row: string): string[] {
  return row.split(/(?<!\\)\|/);
}

function markCell(cell: string, wrap: (content: string) => string): string {
  const content = cell.trim();
  if (content === '') return cell;
  const start = cell.indexOf(content);
  return cell.slice(0, start) + wrap(content) + cell.slice(start + content.length);
}

function isTableRow(line: string): boolean {
  return TABLE_ROW.test(line) && !TABLE_RULE.test(line);
}

/** 片側にしか無い行。表の行はセルごとに印を付けないと列が崩れる。 */
function markWholeLine(line: string, kind: 'ins' | 'del'): string {
  const wrap = (content: string): string => (kind === 'ins' ? mark('', content) : mark(content, ''));
  if (isTableRow(line)) {
    const cells = splitCells(line);
    return cells.map((cell, k) => (k === 0 || k === cells.length - 1 ? cell : markCell(cell, wrap))).join('|');
  }
  const [prefix, content] = splitPrefix(line);
  return content.trim() === '' ? line : prefix + wrap(content);
}

function substituteContent(before: string, after: string): string {
  const [, beforeContent] = splitPrefix(before);
  const [prefix, afterContent] = splitPrefix(after);
  return prefix + (diffChars(beforeContent, afterContent) ?? mark(beforeContent, afterContent));
}

/** 対になった 2 行。 */
function markPair(before: string, after: string): string {
  if (isTableRow(before) && isTableRow(after)) {
    const a = splitCells(before);
    const b = splitCells(after);
    if (a.length === b.length) {
      return b
        .map((cell, k) => {
          const old = a[k]!.trim();
          const now = cell.trim();
          if (old === now || k === 0 || k === b.length - 1) return cell;
          // 空にしたセルは、消した中身を取り消しとして見せる。
          if (now === '') return ` ${mark(old, '')} `;
          return markCell(cell, () => diffChars(old, now) ?? mark(old, now));
        })
        .join('|');
    }
  }
  const [beforePrefix] = splitPrefix(before);
  const [afterPrefix] = splitPrefix(after);
  if (beforePrefix.trim() !== afterPrefix.trim()) {
    // 見出しの深さや箇条の種類が変わった。記号は新しい側を採り、中身ごと置き換える。
    const [, beforeContent] = splitPrefix(before);
    const [, afterContent] = splitPrefix(after);
    return afterPrefix + mark(beforeContent, afterContent);
  }
  return substituteContent(before, after);
}

/** 各行がコードの囲みの中（区切りの行を含む）か。 */
function codeLines(lines: string[]): boolean[] {
  let fence: string | null = null;
  return lines.map((line) => {
    const fenceMark = FENCE.exec(line)?.[1];
    if (fenceMark !== undefined && (fence === null || fence === fenceMark[0])) {
      fence = fence === null ? (fenceMark[0] ?? null) : null;
      return true;
    }
    return fence !== null;
  });
}

type Line = { text: string; code: boolean };

/**
 * 旧い版の本文と新しい版の本文から、変わった所に印を付けた本文を返す。
 * 返すのは新しい版の並びで、消えた行は消えた位置に取り消しとして残る。
 * 印が残っている版は、清書にしてから比べる（印どうしを比べても意味が無い）。
 */
export function compareRevisions(before: string, after: string): string {
  const toLines = (source: string): Line[] => {
    const texts = acceptRevisions(source.replace(/\r\n?/g, '\n')).split('\n');
    const code = codeLines(texts);
    return texts.map((text, k) => ({ text, code: code[k]! }));
  };
  const ops = lcsOps(toLines(before), toLines(after), (x, y) => x.text === y.text);

  const out: string[] = [];
  let dels: Line[] = [];
  let ins: Line[] = [];

  const flush = (): void => {
    const prose = (line: Line): boolean => !line.code && line.text.trim() !== '';
    const oldLines = dels.filter(prose);
    let paired = 0;
    const emitted: string[] = [];
    for (const line of ins) {
      if (!prose(line)) {
        emitted.push(line.text);
        continue;
      }
      const old = oldLines[paired];
      if (old !== undefined) {
        paired++;
        emitted.push(markPair(old.text, line.text));
      } else {
        emitted.push(markWholeLine(line.text, 'ins'));
      }
    }
    // 対にならなかった消えた行は、置き換えの前に取り消しとして見せる。
    const removed = oldLines.slice(paired).map((line) => markWholeLine(line.text, 'del'));
    out.push(...removed, ...emitted);
    dels = [];
    ins = [];
  };

  for (const op of ops) {
    if (op.type === 'same') {
      flush();
      out.push(op.b!.text);
    } else if (op.type === 'del') {
      dels.push(op.a!);
    } else {
      ins.push(op.b!);
    }
  }
  flush();
  return out.join('\n');
}
