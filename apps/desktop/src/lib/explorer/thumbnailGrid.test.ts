import { describe, expect, it } from "vitest";
import { buildTree, toDocEntry } from "../workspace/fileTree";
import {
  LruCache,
  THUMBNAIL_RENDERER,
  cardKind,
  folderTrail,
  gridItems,
  thumbnailCacheKey,
} from "./thumbnailGrid";

const tree = buildTree(
  ["a.md", "docs/b.tsv", "docs/c.png", "docs/sub/d.md", "z.svg"].map(toDocEntry)
);

describe("cardKind", () => {
  it("拡張子で絵の出し方を決める", () => {
    expect(cardKind("x/a.md")).toBe("document");
    expect(cardKind("a.tsv")).toBe("document");
    expect(cardKind("a.PNG")).toBe("image");
    expect(cardKind("a.svg")).toBe("image");
    expect(cardKind("a.txt")).toBe("none");
  });
});

describe("gridItems", () => {
  it("フォルダの直下だけを、フォルダを先にして並べる", () => {
    expect(gridItems(tree, "", false).map((i) => i.path)).toEqual([
      "docs",
      "a.md",
      "z.svg",
    ]);
    expect(gridItems(tree, "docs", false).map((i) => [i.path, i.kind])).toEqual(
      [
        ["docs/sub", "folder"],
        ["docs/b.tsv", "document"],
        ["docs/c.png", "image"],
      ]
    );
  });

  it("無くなったフォルダを指していたら一番上を出す", () => {
    expect(gridItems(tree, "gone", false).map((i) => i.path)).toEqual([
      "docs",
      "a.md",
      "z.svg",
    ]);
  });

  it("絞り込み中は階層を外してファイルだけを並べる", () => {
    expect(gridItems(tree, "docs", true).map((i) => i.path)).toEqual([
      "a.md",
      "docs/b.tsv",
      "docs/c.png",
      "docs/sub/d.md",
      "z.svg",
    ]);
  });
});

describe("folderTrail", () => {
  it("一番上から今いるフォルダまでの道筋", () => {
    expect(folderTrail("")).toEqual([]);
    expect(folderTrail("docs/sub")).toEqual([
      { name: "docs", path: "docs" },
      { name: "sub", path: "docs/sub" },
    ]);
  });
});

describe("thumbnailCacheKey", () => {
  it("中身・テーマが違えば別の鍵、同じなら同じ鍵", () => {
    const a = thumbnailCacheKey("a.md", "# x", "light");
    expect(thumbnailCacheKey("b.md", "# x", "light")).toBe(a);
    expect(thumbnailCacheKey("a.md", "# y", "light")).not.toBe(a);
    expect(thumbnailCacheKey("a.md", "# x", "dark")).not.toBe(a);
    expect(thumbnailCacheKey("a.tsv", "# x", "light")).not.toBe(a);
    expect(THUMBNAIL_RENDERER).toMatch(/^desktop-preview@/);
  });
});

describe("LruCache", () => {
  it("上限を超えたら一番使っていないものから捨てる", () => {
    const c = new LruCache<number>(2);
    c.set("a", 1);
    c.set("b", 2);
    expect(c.get("a")).toBe(1);
    c.set("c", 3);
    expect(c.get("b")).toBeUndefined();
    expect(c.get("a")).toBe(1);
    expect(c.get("c")).toBe(3);
    expect(c.size).toBe(2);
  });

  it("同じ鍵の上書きで数は増えない", () => {
    const c = new LruCache<number>(2);
    c.set("a", 1);
    c.set("a", 2);
    expect(c.get("a")).toBe(2);
    expect(c.size).toBe(1);
  });

  it("上限 0 以下は 1 として扱う", () => {
    const c = new LruCache<number>(0);
    c.set("a", 1);
    expect(c.get("a")).toBe(1);
  });
});
