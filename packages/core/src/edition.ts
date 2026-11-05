/**
 * 1 つの正本から「社内版」と「提出版」を出し分けるための本文処理。
 *
 * 社内向けの節は `::: 社内` 〜 `:::` で囲む。提出版はその囲みごと落としてから描く。
 * 見出しに印を付ける書き方は採らない。節の終わりが「次の同じ深さの見出し」になり、
 * 書いた人の意図より広く（または狭く）消える。囲みなら消える範囲が目で見える。
 *
 * 描画の前、本文の段階で処理する。プレビュー・PDF・Markdown 書き出しが同じ本文を
 * 通るので、どの出口でも同じ範囲が消える。
 */

export interface InternalBlock {
  /** 開きの行（0 始まり）。 */
  start: number;
  /** 閉じの行。閉じていなければ最終行。 */
  end: number;
  /** 閉じの `:::` があったか。 */
  closed: boolean;
}

export interface StripResult {
  text: string;
  /** 落とした囲みの数。 */
  removed: number;
  /** 閉じていない囲みがあった（文末まで落とした）。 */
  unclosed: boolean;
}

export type LeakKind = 'source-location' | 'commit-hash';

export interface SubmissionLeak {
  /** 元の本文での行（0 始まり）。 */
  line: number;
  kind: LeakKind;
  text: string;
}

const OPEN = /^:::\s*(社内|internal)\s*$/;
const CLOSE = /^:::\s*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

function linesOf(source: string): string[] {
  return source.split('\n').map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
}

/**
 * 社内の囲みを探す。コードの囲みの中は見本なので数えない。
 *
 * 閉じ忘れは文末まで続くものとして扱う。提出版で「閉じ忘れたから全部出た」より
 * 「閉じ忘れたから後ろが全部消えた」のほうが、漏れずに気づける。
 */
export function findInternalBlocks(source: string): InternalBlock[] {
  const lines = linesOf(source);
  const blocks: InternalBlock[] = [];
  let fence: string | null = null;
  let open: number | null = null;

  lines.forEach((line, index) => {
    const fenceMark = FENCE.exec(line)?.[1];
    // 囲みの中のコード例も見る。例の中の `:::` で閉じると、残りが提出版へ漏れる。
    if (fenceMark !== undefined) {
      if (fence === null) fence = fenceMark[0] ?? null;
      else if (fence === fenceMark[0]) fence = null;
      return;
    }
    if (fence !== null) return;

    if (open === null) {
      if (OPEN.test(line)) open = index;
    } else if (CLOSE.test(line)) {
      blocks.push({ start: open, end: index, closed: true });
      open = null;
    }
  });

  if (open !== null) {
    blocks.push({ start: open, end: lines.length - 1, closed: false });
  }
  return blocks;
}

/** 提出版の本文を作る。囲みは開き・閉じの行ごと落とす。 */
export function stripInternalBlocks(source: string): StripResult {
  const blocks = findInternalBlocks(source);
  if (blocks.length === 0) return { text: source, removed: 0, unclosed: false };

  const lines = source.split('\n');
  const dropped = new Set<number>();
  for (const block of blocks) {
    for (let i = block.start; i <= block.end; i += 1) dropped.add(i);
  }
  const unclosed = blocks.some((block) => !block.closed);
  const kept = lines.filter((_, index) => !dropped.has(index));
  // 文末まで落としたときは、元の本文と同じく改行で終える。
  const text = unclosed ? `${kept.join('\n')}\n` : kept.join('\n');
  return { text, removed: blocks.length, unclosed };
}

/**
 * ソースの場所。`Service.php L12` / `a.ts:40` / `b.tsx#L7` の形。
 * 拡張子は英字で始まるものだけ（`0.1.0` のような版番号を拾わない）。
 */
const SOURCE_LOCATION =
  /[\p{L}\p{N}_\-./]*[\p{L}\p{N}_-]\.[A-Za-z][A-Za-z0-9]{0,9}(?:\s+L\d+|:\d+|#L\d+)\b/gu;

/** コミットのハッシュ。数字と英字の両方を含む 7〜40 桁の 16 進。 */
const HEX_RUN = /(?<![0-9A-Za-z#])[0-9a-f]{7,40}(?![0-9A-Za-z])/g;

function looksLikeHash(run: string): boolean {
  return /[0-9]/.test(run) && /[a-f]/.test(run);
}

/**
 * 提出版に残ると困るもの（ソースの場所・コミットのハッシュ）を、社内の囲みの外から探す。
 *
 * 書き出しは止めない。用語集に正当なハッシュを載せる文書もあるので、見つけたことを
 * 知らせて判断は書いた人に任せる。
 */
export function findSubmissionLeaks(source: string): SubmissionLeak[] {
  const inside = new Set<number>();
  for (const block of findInternalBlocks(source)) {
    for (let i = block.start; i <= block.end; i += 1) inside.add(i);
  }

  const leaks: SubmissionLeak[] = [];
  linesOf(source).forEach((line, index) => {
    if (inside.has(index)) return;
    for (const match of line.matchAll(SOURCE_LOCATION)) {
      leaks.push({ line: index, kind: 'source-location', text: match[0] });
    }
    for (const match of line.matchAll(HEX_RUN)) {
      if (looksLikeHash(match[0])) {
        leaks.push({ line: index, kind: 'commit-hash', text: match[0] });
      }
    }
  });
  return leaks;
}
