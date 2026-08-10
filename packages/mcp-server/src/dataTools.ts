/**
 * データファイル（JSON / XML）用の MCP ツール本体。
 * -----------------------------------------------------------------------------
 * 経理で扱う書類は JSON / XML で届くことが多い（請求書の交換形式、口座明細、
 * 申告データ、会計サービスの書き出し）。これらは md-business の正本ではないので
 * **読むだけ**にとどめ、書き戻す口は用意しない。正本は Markdown / TSV のまま。
 *
 * 判定とパースは @md-business/data-tree が持つ。デスクトップ（WebView）と MCP（Node）で
 * 同じ木が出るのは、両方がこの 1 つの実装を通るから。Node には DOMParser が無いので、
 * 環境ごとに別のパーサを当てると「アプリでは読めるのに MCP では読めない」が起きる。
 *
 * fs には触れず DocumentStore 越しに動くので、純ロジックとして単体テストできる。
 */
import {
  readDataFile,
  type DataFormat,
  type DataProblem,
  type DataProblemKind,
  type DataTreeNode,
} from '@md-business/data-tree';
import { safeRelativePath } from './workspacePath.js';
import type { DocumentStore } from './store.js';
import type { ToolError } from './tools.js';

/**
 * 読めなかった理由の見出し。
 *
 * data-tree が返す説明文は英語なので（ライブラリ側の言語。ajv の検証メッセージが
 * そのまま出るのと同じ）、日本語の見出しを前に置いて、何の種類の拒否かだけは
 * 読まなくても分かるようにする。
 */
const PROBLEM_LABEL: Record<DataProblemKind, string> = {
  size: 'ファイルが大きすぎます',
  syntax: '構文エラー',
  depth: '入れ子が深すぎます',
  nodes: '要素が多すぎます',
  doctype: 'DTD 宣言があります',
  entity: '解決できない実体参照があります',
  unsupported: '扱わない拡張子です',
};

function describeProblem(problem: DataProblem): string {
  const where = problem.line === undefined ? '' : `・${problem.line} 行目`;
  return `${PROBLEM_LABEL[problem.kind]}${where}: ${problem.message}`;
}

/**
 * 返した部分木の 1 節。
 *
 * `omittedChildren` は深さで切ったときにだけ付く。子を黙って落とすと、子が無いのか
 * 返さなかったのかが区別できない。何個隠れているかまで言えば、読み手は続きを取りに来られる。
 */
export interface DataNodeSlice extends DataTreeNode {
  children: DataNodeSlice[];
  /** 深さで切ったため返さなかった直下の子の数。切っていなければ付かない。 */
  omittedChildren?: number;
}

/** 既定の深さ。木を丸ごと返すと大きいファイルほど 1 回の応答がそのまま膨らむ。 */
export const READ_DATA_DEFAULT_DEPTH = 2;

export interface ReadDataOptions {
  /**
   * 読む位置。根からたどる子の名前を並べる。省略すると根。
   * XML の根要素は含めない（`Invoice/ID` なら `['ID']`）。
   * 同じ名前の兄弟が並ぶ場所は `行#1` のように 0 始まりの番号で選ぶ。
   */
  at?: string[];
  /** 返す世代数。0 は指した節だけ、-1 は下をすべて。省略時は 2。 */
  depth?: number;
}

export interface ReadDataOk {
  ok: true;
  /** 正規化済み相対パス。 */
  path: string;
  /** 拡張子から決めた形式。 */
  format: DataFormat;
  /** 実際に読んだ位置（根なら空）。 */
  at: string[];
  /** 返した部分木の根。JSON のファイル全体を指したときは名前を持たない。 */
  root: DataNodeSlice;
}

/** 見つからなかったときに、その場所にある名前を挙げる。長い一覧は頭だけ。 */
function listNames(node: DataTreeNode, limit = 20): string {
  const names = node.children.map((c) => c.name);
  const shown = names.slice(0, limit).join(' / ');
  return names.length > limit ? `${shown} ほか ${names.length - limit} 件` : shown;
}

function describeAt(segments: string[]): string {
  return segments.length === 0 ? '根' : segments.join('/');
}

/**
 * 名前で子を 1 つ選ぶ。
 *
 * まず名前そのもので照合し、一致が無いときだけ末尾の `#番号` を添字として読む。
 * この順にしておくと、`品目#1` という名前のキーが実在しても添字と誤読されない。
 */
function selectChild(
  node: DataTreeNode,
  segment: string,
  walked: string[],
): { ok: true; child: DataTreeNode } | ToolError {
  const exact = node.children.filter((c) => c.name === segment);
  if (exact.length === 1) return { ok: true, child: exact[0]! };
  if (exact.length > 1) {
    return {
      ok: false,
      error: `${describeAt(walked)} の「${segment}」は ${exact.length} 個あります。${segment}#0 〜 ${segment}#${exact.length - 1} のように番号で選んでください。`,
    };
  }

  const indexed = /^(.*)#(\d+)$/.exec(segment);
  if (indexed) {
    const name = indexed[1]!;
    const same = node.children.filter((c) => c.name === name);
    const picked = same[Number(indexed[2])];
    if (picked) return { ok: true, child: picked };
    if (same.length > 0) {
      return {
        ok: false,
        error: `${describeAt(walked)} の「${name}」は ${same.length} 個です（0 〜 ${same.length - 1}）。`,
      };
    }
  }

  return {
    ok: false,
    error: `${describeAt(walked)} に「${segment}」はありません。ここにあるのは: ${listNames(node)}`,
  };
}

function resolveAt(root: DataTreeNode, at: string[]): { ok: true; node: DataTreeNode } | ToolError {
  let node = root;
  const walked: string[] = [];
  for (const segment of at) {
    const picked = selectChild(node, segment, walked);
    if (!picked.ok) return picked;
    node = picked.child;
    walked.push(segment);
  }
  return { ok: true, node };
}

/** 深さで切って写す。負の深さは制限なし。 */
function sliceNode(node: DataTreeNode, depth: number): DataNodeSlice {
  const out: DataNodeSlice = { name: node.name, children: [] };
  if (node.value !== undefined) out.value = node.value;
  if (node.valueType !== undefined) out.valueType = node.valueType;
  if (node.attributes !== undefined) out.attributes = node.attributes;

  if (depth === 0) {
    if (node.children.length > 0) out.omittedChildren = node.children.length;
    return out;
  }
  out.children = node.children.map((child) => sliceNode(child, depth < 0 ? -1 : depth - 1));
  return out;
}

/**
 * ワークスペースの JSON / XML を木構造として読む。
 *
 * 越境パスと不在は data-tree へ渡す前に弾く。読めなかったときは黙って空の木を返さず、
 * 理由を述べて失敗する（空のファイルを読んだのか拒んだのかが区別できないと、その差が
 * 一番効くのは入力が信用できないとき）。
 */
export async function readData(
  store: DocumentStore,
  requestedPath: string,
  options: ReadDataOptions = {},
): Promise<ReadDataOk | ToolError> {
  const safe = safeRelativePath(requestedPath);
  if (!safe.ok) return { ok: false, error: safe.reason };
  if (!(await store.exists(safe.relative))) {
    return { ok: false, error: `ファイルが見つかりません: ${safe.relative}` };
  }
  const src = await store.read(safe.relative);
  const result = readDataFile(safe.relative, src);
  if (!result.ok) {
    return { ok: false, error: describeProblem(result.problem) };
  }

  const depth = options.depth ?? READ_DATA_DEFAULT_DEPTH;
  if (!Number.isInteger(depth)) {
    return { ok: false, error: `depth は整数で指定してください: ${String(options.depth)}` };
  }
  const at = options.at ?? [];
  const found = resolveAt(result.root, at);
  if (!found.ok) return found;

  return {
    ok: true,
    path: safe.relative,
    format: result.format,
    at,
    root: sliceNode(found.node, depth),
  };
}
