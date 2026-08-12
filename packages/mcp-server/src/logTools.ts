/**
 * ログ調査ツール本体（search_lines / read_lines）。
 * -----------------------------------------------------------------------------
 * 巨大なログを丸ごとモデルへ渡さず、必要な行だけを取り出すための層。設計上の要は 3 つ。
 *
 * 1. **全文をメモリに載せない**。store.lines で 1 行ずつ流し、読み終えた行は捨てる
 * 2. **返す量に上限を持ち、切ったら切ったと返す**。黙って切ると、受け取った AI は
 *    全部見た前提で結論を出す。上限に達した時点で読むのをやめるので、truncated は
 *    「まだ先にあるかもしれない」の意味（多めに立つ側へ倒す）
 * 3. **返す直前に必ず伏せ字をかける**。この層を通らない戻り値を作らない
 */
import { safeRelativePath } from './workspacePath.js';
import { maskSecrets } from './maskSecrets.js';
import { addCounts, clamp, type MaskCounts } from './toolLimits.js';
import type { DocumentStore } from './store.js';
import type { ToolError } from './tools.js';

/** 既定と上限。呼び出し側が大きな値を指定しても、ここで頭を押さえる。 */
const MAX_MATCHES_DEFAULT = 100;
const MAX_MATCHES_CEILING = 1000;
const MAX_LINES_DEFAULT = 500;
const MAX_LINES_CEILING = 5000;
const CONTEXT_CEILING = 20;
const MAX_LINE_LENGTH_DEFAULT = 2000;
const MAX_LINE_LENGTH_CEILING = 20000;

/**
 * 利用者の正規表現を当てる文字数の上限。
 *
 * 1 行が数 MB になるログ（整形されていない JSON など）に後戻りの多い正規表現を当てると、
 * 1 行で固まる。ここで入力長を有界にしておく。伏せ字は行全体にかけるので、この窓は
 * 「探す範囲」であって「隠す範囲」ではない。
 */
const MATCH_WINDOW = 100_000;

export interface SearchLinesInput {
  /** ワークスペース相対パス。 */
  path: string;
  /** 正規表現（JavaScript の構文）。 */
  pattern: string;
  /** 大文字小文字を無視するか。 */
  ignoreCase?: boolean;
  /** 一致行の前を何行付けるか（既定 0・上限 20）。 */
  before?: number;
  /** 一致行の後を何行付けるか（既定 0・上限 20）。 */
  after?: number;
  /** 返す一致の上限（既定 100・上限 1000）。 */
  maxMatches?: number;
  /** 1 行あたりの文字数上限（既定 2000・上限 20000）。 */
  maxLineLength?: number;
}

export interface SearchMatch {
  /** 1 始まりの行番号。 */
  line: number;
  /** 伏せ字済みの行（上限を超える分は切る）。 */
  text: string;
  /** 直前の行（古い順）。要求しなければ空。 */
  before: string[];
  /** 直後の行（新しい順）。要求しなければ空。 */
  after: string[];
}

export interface SearchLinesOk {
  ok: true;
  path: string;
  matches: SearchMatch[];
  /** 上限で読むのをやめたか（先にまだあるかもしれない）。 */
  truncated: boolean;
  /** 長さの上限で切った行数。 */
  truncatedLines: number;
  /** 読んだ行数。 */
  scannedLines: number;
  /** 伏せた件数（種別ごと）。 */
  masked: MaskCounts;
}

/** 行を伏せ字にし、長すぎれば切る。切ったかどうかも返す。 */
function present(
  raw: string,
  maxLineLength: number,
  counts: MaskCounts,
): { text: string; cut: boolean } {
  const masked = maskSecrets(raw);
  addCounts(counts, masked.counts);
  if (masked.text.length <= maxLineLength) return { text: masked.text, cut: false };
  return { text: masked.text.slice(0, maxLineLength), cut: true };
}

/**
 * 正規表現に一致する行を、前後の行つきで返す。
 */
export async function searchLines(
  store: DocumentStore,
  input: SearchLinesInput,
): Promise<SearchLinesOk | ToolError> {
  const safe = safeRelativePath(input.path);
  if (!safe.ok) return { ok: false, error: safe.reason };

  let matcher: RegExp;
  try {
    matcher = new RegExp(input.pattern, input.ignoreCase ? 'i' : '');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `正規表現が不正です: ${reason}` };
  }

  const before = clamp(input.before, 0, 0, CONTEXT_CEILING);
  const after = clamp(input.after, 0, 0, CONTEXT_CEILING);
  const maxMatches = clamp(input.maxMatches, MAX_MATCHES_DEFAULT, 1, MAX_MATCHES_CEILING);
  const maxLineLength = clamp(
    input.maxLineLength,
    MAX_LINE_LENGTH_DEFAULT,
    1,
    MAX_LINE_LENGTH_CEILING,
  );

  const masked: MaskCounts = {};
  const matches: SearchMatch[] = [];
  /** 直前の行（伏せ字済み）。before の分だけ持ち回す。 */
  const recent: string[] = [];
  /** 後続行をまだ待っている一致。 */
  let awaiting: SearchMatch[] = [];
  let truncatedLines = 0;
  let scannedLines = 0;
  let truncated = false;

  try {
    for await (const raw of store.lines(safe.relative)) {
      scannedLines += 1;
      const shown = present(raw, maxLineLength, masked);
      if (shown.cut) truncatedLines += 1;

      // 先に後続待ちを埋める。自分自身が次の一致でも、後続としては先に数える。
      if (awaiting.length > 0) {
        for (const pending of awaiting) pending.after.push(shown.text);
        awaiting = awaiting.filter((pending) => pending.after.length < after);
      }

      const window = raw.length > MATCH_WINDOW ? raw.slice(0, MATCH_WINDOW) : raw;
      if (matcher.test(window)) {
        if (matches.length >= maxMatches) {
          truncated = true;
          break;
        }
        const match: SearchMatch = {
          line: scannedLines,
          text: shown.text,
          before: before > 0 ? [...recent] : [],
          after: [],
        };
        matches.push(match);
        if (after > 0) awaiting.push(match);
      }

      if (before > 0) {
        recent.push(shown.text);
        if (recent.length > before) recent.shift();
      }
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `ファイルを読めません: ${reason}` };
  }

  return {
    ok: true,
    path: safe.relative,
    matches,
    truncated,
    truncatedLines,
    scannedLines,
    masked,
  };
}

export interface ReadLinesInput {
  /** ワークスペース相対パス。 */
  path: string;
  /** 開始行（1 始まり・この行を含む）。 */
  from: number;
  /** 終了行（この行を含む）。 */
  to: number;
  /** 返す行数の上限（既定 500・上限 5000）。 */
  maxLines?: number;
  /** 1 行あたりの文字数上限（既定 2000・上限 20000）。 */
  maxLineLength?: number;
}

export interface ReadLinesOk {
  ok: true;
  path: string;
  /** 実際に返し始めた行番号。 */
  from: number;
  lines: { line: number; text: string }[];
  /** 上限で切ったか（要求した範囲の途中で止めた）。 */
  truncated: boolean;
  /** 長さの上限で切った行数。 */
  truncatedLines: number;
  masked: MaskCounts;
}

/**
 * 行範囲をそのまま返す。search_lines で見つけた箇所の周辺を読むための道具。
 */
export async function readLines(
  store: DocumentStore,
  input: ReadLinesInput,
): Promise<ReadLinesOk | ToolError> {
  const safe = safeRelativePath(input.path);
  if (!safe.ok) return { ok: false, error: safe.reason };
  if (!Number.isInteger(input.from) || input.from < 1) {
    return { ok: false, error: `開始行は 1 以上の整数で指定してください: ${input.from}` };
  }
  if (!Number.isInteger(input.to) || input.to < input.from) {
    return { ok: false, error: `終了行は開始行以上で指定してください: ${input.to}` };
  }

  const maxLines = clamp(input.maxLines, MAX_LINES_DEFAULT, 1, MAX_LINES_CEILING);
  const maxLineLength = clamp(
    input.maxLineLength,
    MAX_LINE_LENGTH_DEFAULT,
    1,
    MAX_LINE_LENGTH_CEILING,
  );

  const masked: MaskCounts = {};
  const lines: { line: number; text: string }[] = [];
  let truncatedLines = 0;
  let truncated = false;
  let lineNumber = 0;

  try {
    for await (const raw of store.lines(safe.relative)) {
      lineNumber += 1;
      if (lineNumber < input.from) continue;
      if (lineNumber > input.to) break;
      if (lines.length >= maxLines) {
        truncated = true;
        break;
      }
      const shown = present(raw, maxLineLength, masked);
      if (shown.cut) truncatedLines += 1;
      lines.push({ line: lineNumber, text: shown.text });
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `ファイルを読めません: ${reason}` };
  }

  return {
    ok: true,
    path: safe.relative,
    from: input.from,
    lines,
    truncated,
    truncatedLines,
    masked,
  };
}
