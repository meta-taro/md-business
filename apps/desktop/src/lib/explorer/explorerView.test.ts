import { describe, expect, it } from "vitest";
import { parseExplorerView } from "./explorerView";

describe("parseExplorerView", () => {
  it("保存値を表示の種類に戻す。知らない値はツリー", () => {
    expect(parseExplorerView("grid")).toBe("grid");
    expect(parseExplorerView("tree")).toBe("tree");
    expect(parseExplorerView(null)).toBe("tree");
    expect(parseExplorerView("x")).toBe("tree");
  });
});
