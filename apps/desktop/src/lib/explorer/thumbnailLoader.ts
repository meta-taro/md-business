/**
 * サムネイルの読み込み。格子を開いたときに初めて読まれる（起動時には読まない）。
 *
 * 文書はプレビューと同じ経路で描き、縮めて見せる。描いた結果は中身とテーマの鍵で
 * 覚えておき、同じ中身なら描き直さない。画像は読んだものをそのまま見せる。
 * 読み込みは同時に数本までに絞る（大きなフォルダで一度に全部読みに行かない）。
 */
import { invoke } from "@tauri-apps/api/core";
import type { PreviewTheme } from "$lib/preview/previewDocument";
import { LruCache, cardKind, thumbnailCacheKey } from "./thumbnailGrid";

export type Thumbnail =
  | { type: "document"; srcdoc: string }
  | { type: "image"; src: string }
  | { type: "none" };

const MAX_CONCURRENT = 3;
const documents = new LruCache<Thumbnail>(120);
// 画像は data URL が大きいので少なめに持つ。中身の指紋を取るには全部読むことになり、
// それは表示と同じ手間なので、場所と走査の回で覚える（保存・外部の変更で読み直す）。
const images = new LruCache<Thumbnail>(40);

let running = 0;
const waiting: (() => void)[] = [];

async function slot<T>(task: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT)
    await new Promise<void>((resolve) => waiting.push(resolve));
  running += 1;
  try {
    return await task();
  } finally {
    running -= 1;
    waiting.shift()?.();
  }
}

async function loadDocument(
  root: string,
  path: string,
  theme: PreviewTheme
): Promise<Thumbnail> {
  const source = await invoke<string>("read_document", { root, relPath: path });
  const key = thumbnailCacheKey(path, source, theme);
  const cached = documents.get(key);
  if (cached !== undefined) return cached;
  const { renderPreview } = await import("$lib/preview/renderPreview");
  const result = await renderPreview(source, { theme, shortcuts: false });
  const thumbnail: Thumbnail = result.ok
    ? { type: "document", srcdoc: result.srcdoc }
    : { type: "none" };
  documents.set(key, thumbnail);
  return thumbnail;
}

async function loadImage(
  root: string,
  path: string,
  generation: number
): Promise<Thumbnail> {
  const key = `${generation}\u0000${path}`;
  const cached = images.get(key);
  if (cached !== undefined) return cached;
  const image = await invoke<{ dataUrl: string }>("read_image", {
    root,
    relPath: path,
  });
  const thumbnail: Thumbnail = { type: "image", src: image.dataUrl };
  images.set(key, thumbnail);
  return thumbnail;
}

export interface ThumbnailRequest {
  root: string;
  path: string;
  theme: PreviewTheme;
  /** 走査の回。画像の覚えを、保存や外部の変更のあとで使わないため */
  generation: number;
}

/** 読めなかったものは絵なし（カードは名前だけで出す）。 */
export function loadThumbnail(request: ThumbnailRequest): Promise<Thumbnail> {
  const kind = cardKind(request.path);
  if (kind === "none") return Promise.resolve({ type: "none" });
  return slot(() =>
    kind === "image"
      ? loadImage(request.root, request.path, request.generation)
      : loadDocument(request.root, request.path, request.theme)
  ).catch((): Thumbnail => ({ type: "none" }));
}
