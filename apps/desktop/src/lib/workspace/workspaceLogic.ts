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
 * ツリーをクエリで絞り込む（エクスプローラーのフィルタ検索）。
 * ファイル名 or パスにクエリ（大文字小文字無視）を含むファイルを残し、その祖先フォルダも
 * 文脈として保持する。フォルダ名自体がマッチした場合は配下を丸ごと残す。空・空白のみの
 * クエリは元のツリーを **同一参照のまま** 返す（呼び出し側で通常表示に分岐しやすくする）。
 * 入力ツリーは破壊せず、絞り込んだフォルダは children を差し替えた新ノードを返す。
 */
export function filterTree(tree: readonly TreeNode[], query: string): TreeNode[] {
  const q = query.trim().toLowerCase();
  if (q === '') return tree as TreeNode[];
  const walk = (nodes: readonly TreeNode[]): TreeNode[] => {
    const out: TreeNode[] = [];
    for (const node of nodes) {
      const selfMatch =
        node.name.toLowerCase().includes(q) || node.path.toLowerCase().includes(q);
      if (node.kind === 'folder') {
        if (selfMatch) {
          // フォルダ名がヒット → 配下すべてを残す（元ノードをそのまま参照）。
          out.push(node);
        } else {
          const kids = walk(node.children);
          if (kids.length > 0) out.push({ ...node, children: kids });
        }
      } else if (selfMatch) {
        out.push(node);
      }
    }
    return out;
  };
  return walk(tree);
}

/**
 * ツリー内の全フォルダ path を深さ優先で列挙する（ファイルは含めない）。
 * 絞り込み表示では「全フォルダ展開」で使う（マッチした深い階層を漏れなく見せる）。
 */
export function collectFolderPaths(tree: readonly TreeNode[]): string[] {
  const paths: string[] = [];
  const walk = (nodes: readonly TreeNode[]): void => {
    for (const node of nodes) {
      if (node.kind === 'folder') {
        paths.push(node.path);
        walk(node.children);
      }
    }
  };
  walk(tree);
  return paths;
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
