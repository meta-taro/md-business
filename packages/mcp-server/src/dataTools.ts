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

export interface ReadDataOk {
  ok: true;
  /** 正規化済み相対パス。 */
  path: string;
  /** 拡張子から決めた形式。 */
  format: DataFormat;
  /** 読み取った木。JSON の根は名前を持たない。 */
  root: DataTreeNode;
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
  return { ok: true, path: safe.relative, format: result.format, root: result.root };
}
