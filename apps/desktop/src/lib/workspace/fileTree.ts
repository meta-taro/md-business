/**
 * 文書ツリーの純ロジック（DOC-SPEC-DESKTOP-2026-0001 §3.3 / §4.1）。
 *
 * Rust の scan_documents が返すフラットな相対パス配列（DocEntry[]）を、描画用の
 * 入れ子 TreeNode 群へ組み立てる。DOM・Tauri に触れないため単体テストできる。
 * 走査時の除外（.git / node_modules 等）と .md/.tsv 限定は Rust 側の責務なので、
 * ここでは「与えられたエントリを木にする」ことだけを担う。
 */

/** 走査で得た 1 ファイル。relPath はルートからの相対パスで区切りは "/" に正規化済み。 */
export interface DocEntry {
  relPath: string;
  name: string;
  ext: string;
}

export type NodeKind = 'folder' | 'file';

/** 描画用ノード。folder は children を持ち、file は ext を持つ（children は空配列）。 */
export interface TreeNode {
  name: string;
  path: string;
  kind: NodeKind;
  ext?: string;
  children: TreeNode[];
}

/** 相対パス（"docs/sub/a.md"）から DocEntry を導出する（name = 末尾, ext = 拡張子小文字）。 */
export function toDocEntry(relPath: string): DocEntry {
  const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const segments = normalized.split('/');
  const name = segments[segments.length - 1] ?? normalized;
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  return { relPath: normalized, name, ext };
}

/** フォルダ先行 → 名前昇順（localeCompare）。同 kind 内は名前で安定ソート。 */
function compareNodes(a: TreeNode, b: TreeNode): number {
  if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
  return a.name.localeCompare(b.name);
}

function sortRecursive(nodes: TreeNode[]): TreeNode[] {
  nodes.sort(compareNodes);
  for (const node of nodes) {
    if (node.kind === 'folder') sortRecursive(node.children);
  }
  return nodes;
}

/**
 * フラットな DocEntry[] を入れ子 TreeNode の森（root 直下ノードの配列）へ組み立てる。
 * 中間フォルダは自動生成・重複は 1 ノードに集約。フォルダ先行・名前昇順でソートする。
 */
export function buildTree(entries: readonly DocEntry[]): TreeNode[] {
  const roots: TreeNode[] = [];
  // path をキーに生成済みフォルダを再利用する。
  const folderIndex = new Map<string, TreeNode>();

  for (const entry of entries) {
    const relPath = entry.relPath.replace(/\\/g, '/').replace(/^\/+/, '');
    if (relPath === '') continue;
    const segments = relPath.split('/').filter((s) => s !== '');
    if (segments.length === 0) continue;

    let parentChildren = roots;
    let prefix = '';

    // 末尾以外は中間フォルダ。
    for (let i = 0; i < segments.length - 1; i += 1) {
      const seg = segments[i];
      prefix = prefix === '' ? seg : `${prefix}/${seg}`;
      let folder = folderIndex.get(prefix);
      if (!folder) {
        folder = { name: seg, path: prefix, kind: 'folder', children: [] };
        folderIndex.set(prefix, folder);
        parentChildren.push(folder);
      }
      parentChildren = folder.children;
    }

    // 末尾セグメント = ファイル。同一パスの重複は無視（先勝ち）。
    const fileName = segments[segments.length - 1];
    const filePath = prefix === '' ? fileName : `${prefix}/${fileName}`;
    const exists = parentChildren.some((n) => n.kind === 'file' && n.path === filePath);
    if (!exists) {
      parentChildren.push({
        name: fileName,
        path: filePath,
        kind: 'file',
        ext: entry.ext !== '' ? entry.ext : toDocEntry(fileName).ext,
        children: [],
      });
    }
  }

  return sortRecursive(roots);
}
