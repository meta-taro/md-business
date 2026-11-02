/**
 * サムネイル格子の純ロジック。並べるもの・キャッシュの鍵・キャッシュの捨て方を持つ。
 * DOM と Tauri に触れないので単体テストできる。
 */
import { contentHash, fileKind, thumbnailKey } from "@md-business/explorer";
import type { TreeNode } from "../workspace/fileTree";
import { isImagePath } from "../workspace/imageFile";

/**
 * 鍵に入れる描画の版。プレビューの見た目を変えたら上げる（古い絵を出さないため）。
 * キャッシュはメモリにしか置かないので、上げ忘れても再起動で消える。
 */
export const THUMBNAIL_RENDERER = "desktop-preview@1";

/** document = プレビューを縮めて見せる / image = 画像そのもの / none = 絵を出さない */
export type CardKind = "document" | "image" | "none";

export interface GridItem {
  path: string;
  name: string;
  kind: "folder" | CardKind;
}

export function cardKind(path: string): CardKind {
  if (isImagePath(path)) return "image";
  const kind = fileKind(path);
  return kind === "markdown" || kind === "tsv" ? "document" : "none";
}

function toItem(node: TreeNode): GridItem {
  return {
    path: node.path,
    name: node.name,
    kind: node.kind === "folder" ? "folder" : cardKind(node.path),
  };
}

function findFolder(nodes: readonly TreeNode[], path: string): TreeNode | null {
  for (const node of nodes) {
    if (node.kind !== "folder") continue;
    if (node.path === path) return node;
    if (path.startsWith(`${node.path}/`))
      return findFolder(node.children, path);
  }
  return null;
}

function collectFiles(nodes: readonly TreeNode[], out: TreeNode[]): TreeNode[] {
  for (const node of nodes) {
    if (node.kind === "folder") collectFiles(node.children, out);
    else out.push(node);
  }
  return out;
}

const collator = new Intl.Collator("ja");

/**
 * 格子に並べるもの。ふだんは `folder` の直下（ツリーと同じ並び）。
 * 絞り込み中は当たったファイルがあちこちの階層に散るので、階層を外してパス順に並べる
 * （フォルダを辿らせると、当たったものが見えない）。
 */
export function gridItems(
  tree: readonly TreeNode[],
  folder: string,
  filtering: boolean
): GridItem[] {
  if (filtering) {
    return collectFiles(tree, [])
      .sort((a, b) => collator.compare(a.path, b.path))
      .map(toItem);
  }
  const nodes =
    folder === "" ? tree : findFolder(tree, folder)?.children ?? tree;
  return nodes.map(toItem);
}

export interface TrailStep {
  name: string;
  path: string;
}

/** 一番上から `folder` までの道筋（一番上そのものは含めない）。 */
export function folderTrail(folder: string): TrailStep[] {
  if (folder === "") return [];
  const parts = folder.split("/");
  return parts.map((name, i) => ({
    name,
    path: parts.slice(0, i + 1).join("/"),
  }));
}

/** 中身とテーマで決まる鍵。場所は入れない（同じ中身の複製や改名で描き直さない）。 */
export function thumbnailCacheKey(
  path: string,
  content: string,
  theme: string
): string {
  return thumbnailKey({
    kind: fileKind(path),
    hash: contentHash(content),
    renderer: THUMBNAIL_RENDERER,
    theme,
  });
}

/** 上限つきのキャッシュ。上限を超えたら一番長く使っていないものから捨てる。 */
export class LruCache<V> {
  readonly #max: number;
  readonly #map = new Map<string, V>();

  constructor(max: number) {
    this.#max = Math.max(1, Math.floor(max));
  }

  get size(): number {
    return this.#map.size;
  }

  get(key: string): V | undefined {
    const value = this.#map.get(key);
    if (value === undefined) return undefined;
    // Map は入れた順を保つので、入れ直せば「最近使った」側へ回る
    this.#map.delete(key);
    this.#map.set(key, value);
    return value;
  }

  set(key: string, value: V): void {
    this.#map.delete(key);
    this.#map.set(key, value);
    while (this.#map.size > this.#max) {
      const oldest = this.#map.keys().next().value;
      if (oldest === undefined) break;
      this.#map.delete(oldest);
    }
  }
}
