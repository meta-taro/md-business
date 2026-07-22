/**
 * 文書ツリー描画の純ロジック（DOC-SPEC-DESKTOP-2026-0001 §3.3 / §6.2）。
 *
 * 展開状態（フォルダ path の集合）と `buildTree` の結果から、描画用の可視行列を導く。
 * rune ストア（`workspace.svelte.ts`）はこれらを呼ぶだけの薄い層にし、遷移ロジックは
 * ここで単体テストする（vitest は素の node 環境で `.svelte.ts` を評価できないため・§7.3）。
 */

import type { TreeNode } from './fileTree';

/** 描画用の可視行。`depth` はインデント段数（ルート直下 = 0）。 */
export interface VisibleRow {
  node: TreeNode;
  depth: number;
}

/** 第 1 階層のフォルダ path 集合（初回描画で展開する・設計書 §6.2）。 */
export function initialExpandedPaths(tree: readonly TreeNode[]): string[] {
  return tree.filter((n) => n.kind === 'folder').map((n) => n.path);
}

/** `path` の展開状態をトグルした新しい集合を返す（入力は破壊しない）。 */
export function toggleExpanded(expanded: ReadonlySet<string>, path: string): Set<string> {
  const next = new Set(expanded);
  if (next.has(path)) {
    next.delete(path);
  } else {
    next.add(path);
  }
  return next;
}

/**
 * 未保存編集（dirty）判定。ファイル未オープン（`activePath === null`）は seed テンプレ
 * を編集しているだけで保存対象がないため、常に false。オープン中は編集中本文（source）が
 * 直近ディスク内容（savedSource）と異なるときだけ true。
 */
export function computeDirty(
  activePath: string | null,
  source: string,
  savedSource: string,
): boolean {
  if (activePath === null) return false;
  return source !== savedSource;
}

/**
 * ブランチ切替後、直前に開いていたファイルを開き直すべきか。
 * 新ツリーのファイルパス集合に同じ relPath が在れば true（内容を読み直す）。
 * 無ければ false（新ブランチにファイルが無い＝選択解除のまま read エラーを避ける）。
 */
export function shouldReopenFile(
  prevActivePath: string | null,
  filePaths: readonly string[],
): boolean {
  return prevActivePath !== null && filePaths.includes(prevActivePath);
}

/**
 * 展開集合に従い可視ノードを深さ優先で平坦化する。
 * フォルダはその `path` が `expanded` に含まれる時だけ children を辿る。
 */
export function flattenVisible(
  tree: readonly TreeNode[],
  expanded: ReadonlySet<string>,
): VisibleRow[] {
  const rows: VisibleRow[] = [];
  const walk = (nodes: readonly TreeNode[], depth: number): void => {
    for (const node of nodes) {
      rows.push({ node, depth });
      if (node.kind === 'folder' && expanded.has(node.path)) {
        walk(node.children, depth + 1);
      }
    }
  };
  walk(tree, 0);
  return rows;
}
