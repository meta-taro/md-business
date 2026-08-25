/**
 * 本文のデータの指定を読み、指した表へ差し替える。
 *
 * 差し替え先は Markdown の表。図（chart）が画像へ差し替えるのと同じで、置き換えは
 * 本文の段階で行う。後から画面へ挿す形にすると、画面には出るのに書き出すと消える。
 *
 * 生の HTML を通す組み立て（`rawHtml`）のときは、表のあとに中身をそのまま渡す囲みも
 * 添える。ページの側から数字を引けるようにするためで、通らない組み立てでは添えない
 * （添えても本文の無害化で落ちる）。
 *
 * 読めなかったときは**黙って空にしない**。理由をその位置に出し、書いた指定もそのまま
 * 残す。文言はここでは決めず、呼ぶ側の訳語に任せる（`describe`）。読み取りも外から渡す。
 */
import { parseDataTable } from '../chart/chartData';
import { blockFailure } from '../markdown/blockNote';
import { resolveRelPath } from '../workspace/relPath';
import { collectDataBlocks } from './dataBlocks';
import { parseDataSpec } from './dataSpec';
import type { DataProblemKind } from './dataSpec';
import { toDataScript, toMarkdownTable } from './dataTable';

export type DataLoadKind =
  | DataProblemKind
  /** 開いているフォルダの外を指している / 文書の置き場が分からない。 */
  | 'bad-path'
  /** 指した表を読めなかった。 */
  | 'read-failed'
  /** 見出しだけで行が無い。空の表は読める形で嘘をつくので、表にしない。 */
  | 'no-rows';

export interface DataLoadProblem {
  kind: DataLoadKind;
  /** 問題のもとになった文字列（指定名・指した場所など）。 */
  raw: string;
  /** 指定の中の行番号。分からなければ null。 */
  line: number | null;
}

export interface LoadDataOptions {
  /** 開いている文書（フォルダの起点からの相対）。分からなければ null。 */
  docPath: string | null;
  /** 表の読み取り。フォルダの起点からの相対パスを受ける。 */
  read: (path: string) => Promise<string>;
  /** 問題を 1 文にする。 */
  describe: (problem: DataLoadProblem) => string;
  /** 生の HTML がそのまま通る組み立てか。 */
  rawHtml?: boolean;
}

export async function loadDataBlocks(
  source: string,
  options: LoadDataOptions,
): Promise<Map<string, string>> {
  const blocks = collectDataBlocks(source);
  const out = new Map<string, string>();
  if (blocks.length === 0) return out;

  // 同じ表を指す囲みが並ぶことがある。読むのは 1 度でよい。
  const tables = new Map<string, Promise<string>>();
  const readOnce = (path: string): Promise<string> => {
    const found = tables.get(path);
    if (found !== undefined) return found;
    const started = options.read(path);
    tables.set(path, started);
    return started;
  };

  const refuse = (raw: string, problem: DataLoadProblem): void => {
    out.set(raw, blockFailure(options.describe(problem), raw));
  };

  for (const block of blocks) {
    const parsed = parseDataSpec(block.body);
    if (!parsed.ok) {
      refuse(block.raw, parsed.problem);
      continue;
    }

    const spec = parsed.spec;
    const path = resolveRelPath(options.docPath, spec.source);
    if (path === null) {
      refuse(block.raw, { kind: 'bad-path', raw: spec.source, line: null });
      continue;
    }

    let text: string;
    try {
      text = await readOnce(path);
    } catch {
      refuse(block.raw, { kind: 'read-failed', raw: spec.source, line: null });
      continue;
    }

    const table = parseDataTable(text);
    if (table.rows.length === 0) {
      refuse(block.raw, { kind: 'no-rows', raw: spec.source, line: null });
      continue;
    }

    const markdown = toMarkdownTable(table);
    out.set(
      block.raw,
      options.rawHtml === true ? `${markdown}\n\n${toDataScript(table, spec.source)}` : markdown,
    );
  }

  return out;
}
