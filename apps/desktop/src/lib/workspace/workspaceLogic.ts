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
 * 改名の前後で、開いていたファイルの relPath を付け替える。
 *
 * 改名したのがそのファイル自身でも、それを含むフォルダでも、開いているのは同じ中身なので
 * 新しいパスで開き直せるようにする。区切りまで含めて前方一致を見るのは、`旧` の改名で
 * `旧フォルダ/…` まで巻き込まないため。
 */
export function remapRenamedPath(
  activePath: string | null,
  oldPath: string,
  newPath: string,
): string | null {
  if (activePath === null) return null;
  if (activePath === oldPath) return newPath;
  const prefix = `${oldPath}/`;
  return activePath.startsWith(prefix) ? `${newPath}/${activePath.slice(prefix.length)}` : activePath;
}

/**
 * 照合キーへ揃える（表示名は変えず、突き合わせのときだけ使う）。
 *
 * NFKC で互換文字を畳むと、見た目が同じで内部表現が違うものが一致するようになる。
 * 日本語のファイル名では次の 3 つが実際に起きる。
 * - 濁点の合成揺れ（走査結果が `タ` + 濁点で返る環境がある）
 * - IME を on にしたまま打った全角英数（`ＡＰＩ` と `API`）
 * - 半角カナ（`ｼﾌﾄ` と `シフト`）
 */
function foldForMatch(text: string): string {
  return text.normalize('NFKC').toLowerCase();
}

/**
 * ツリーをクエリで絞り込む（エクスプローラーのフィルタ検索）。
 * ファイル名 or パスにクエリ（大文字小文字・全半角・濁点の合成を無視）を含むファイルを残し、
 * その祖先フォルダも文脈として保持する。フォルダ名自体がマッチした場合は配下を丸ごと残す。
 * 空・空白のみのクエリは元のツリーを **同一参照のまま** 返す（呼び出し側で通常表示に分岐
 * しやすくする）。入力ツリーは破壊せず、絞り込んだフォルダは children を差し替えた新ノードを返す。
 */
export function filterTree(tree: readonly TreeNode[], query: string): TreeNode[] {
  const q = foldForMatch(query.trim());
  if (q === '') return tree as TreeNode[];
  const walk = (nodes: readonly TreeNode[]): TreeNode[] => {
    const out: TreeNode[] = [];
    for (const node of nodes) {
      const selfMatch =
        foldForMatch(node.name).includes(q) || foldForMatch(node.path).includes(q);
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
 * フィルタ入力の Escape でクエリを消すべきか。
 *
 * 日本語入力では Escape が「変換の取り消し」に割り当たっているため、変換中
 * （`KeyboardEvent.isComposing`）の Escape で消してしまうと、確定前の候補を戻そうとした
 * だけで入力欄ごと空になる。変換中は IME に譲り、確定後の Escape だけをクリアに使う。
 */
export function shouldClearFilter(key: string, isComposing: boolean, query: string): boolean {
  return key === 'Escape' && !isComposing && query !== '';
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

/** 十字キー操作の結果。何も起きない場合は null。 */
export type TreeKeyAction =
  | { kind: 'move'; index: number }
  | { kind: 'expand'; path: string }
  | { kind: 'collapse'; path: string };

/** 十字キー操作の判断材料。 */
export interface TreeKeyContext {
  /** 画面に出ている行（平坦化済み）。 */
  rows: readonly VisibleRow[];
  /** いま選択されている行の位置。 */
  index: number;
  /** 展開中のフォルダ path。 */
  expanded: ReadonlySet<string>;
  /** 開閉を許すか。絞り込み中は全展開の一時ツリーなので移動だけにする。 */
  toggleable: boolean;
}

/**
 * 十字キー・Home・End が起こす操作を決める。
 *
 * 上下は行送り、左右はフォルダの開閉と階層移動に割り当てる（ファイルツリーの一般的な作法）。
 * 端では止め、押しっぱなしで先頭・末尾を巻き込まないようにする。
 * Enter / Space は行が button なので既定動作に任せ、ここでは扱わない。
 */
export function decideTreeKey(key: string, ctx: TreeKeyContext): TreeKeyAction | null {
  const { rows, expanded, toggleable } = ctx;
  if (rows.length === 0) return null;
  // 走査後に行数が変わると選択位置が浮くことがある。まず先頭へ寄せて操作可能に戻す。
  if (ctx.index < 0 || ctx.index >= rows.length) {
    return key.startsWith('Arrow') || key === 'Home' || key === 'End'
      ? { kind: 'move', index: 0 }
      : null;
  }

  const index = ctx.index;
  const row = rows[index];
  const move = (to: number): TreeKeyAction | null => (to === index ? null : { kind: 'move', index: to });

  switch (key) {
    case 'ArrowDown':
      return move(Math.min(index + 1, rows.length - 1));
    case 'ArrowUp':
      return move(Math.max(index - 1, 0));
    case 'Home':
      return move(0);
    case 'End':
      return move(rows.length - 1);
    case 'ArrowRight': {
      if (row.node.kind !== 'folder') return null;
      if (!expanded.has(row.node.path)) {
        return toggleable ? { kind: 'expand', path: row.node.path } : null;
      }
      // 展開済みなら最初の子へ入る。子が無ければ次の行は同階層以上なので動かさない。
      const next = rows[index + 1];
      return next !== undefined && next.depth > row.depth ? move(index + 1) : null;
    }
    case 'ArrowLeft': {
      if (toggleable && row.node.kind === 'folder' && expanded.has(row.node.path)) {
        return { kind: 'collapse', path: row.node.path };
      }
      // それ以外は親フォルダへ戻る（手前に向かって最初に見つかる浅い行）。
      for (let i = index - 1; i >= 0; i -= 1) {
        if (rows[i].depth < row.depth) return move(i);
      }
      return null;
    }
    default:
      return null;
  }
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
