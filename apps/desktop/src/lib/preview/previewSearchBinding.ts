/**
 * プレビュー iframe 側の検索バインド（DOM 依存・実機検証層）。
 *
 * 共通 SearchBar（search ストア）から driven される。プレビューは `<iframe srcdoc>`＝
 * 親と same-origin なので、親から `contentDocument` を直接走査できる（scrollSync と同じ経路）。
 * よって検索そのものはメッセージ往復せず親側で完結し、純ロジック（buildSearchRegex /
 * findMatches / stepMatchIndex＝単体テスト済み）をエディターと同じく再利用する。
 *
 * ハイライトは CSS Custom Highlight API（`CSS.highlights` + `Range`）で行い、プレビュー
 * DOM を書き換えない（scrollSync のテキストノード走査や srcdoc 再生成と干渉しないため）。
 * Highlight API 非対応の WebView では静かに劣化する（件数・移動・スクロールは効く）。
 *
 * テキストノード単位でマッチを求めるため、要素をまたぐ文字列（例: `<strong>` 境界）には
 * ヒットしない。プレビュー検索の実用上は許容する割り切り。
 *
 * 装飾・スクロールは iframe 依存のため単体テストは持たず、pnpm build / tauri dev で実機検証する。
 */
import {
  buildSearchRegex,
  findMatches,
  stepMatchIndex,
  type SearchOptions,
} from '$lib/search/searchLogic';
import type { SearchBinding } from '$lib/search/search.svelte';

// CSS.highlights のハイライト名（全マッチ／現在マッチ）。iframe ドキュメント単位で登録する。
const HL_ALL = 'md-search-match';
const HL_CURRENT = 'md-search-current';

// 注入する ::highlight スタイル。iframe は app の tokens.css を継承しないため具体値で指定し、
// ライト/ダーク双方で読めるアクセント系にする（全マッチ＝淡い地／現在＝濃く反転）。
const HIGHLIGHT_STYLE = `
:root::highlight(${HL_ALL}) { background-color: rgba(91, 91, 214, 0.30); }
:root::highlight(${HL_CURRENT}) { background-color: #5b5bd6; color: #ffffff; }
`;

// lib.dom に無い環境も想定し、Highlight API を最小 interface で narrow（any 回避）。
interface HighlightRegistryLike {
  set(name: string, highlight: object): void;
  delete(name: string): void;
}
type HighlightCtor = new (...ranges: Range[]) => object;
interface HighlightGlobals {
  Highlight?: HighlightCtor;
  CSS?: { highlights?: HighlightRegistryLike };
}

/** テキストノード内のマッチ 1 件（node と node 内オフセット）。 */
interface DomMatch {
  node: Text;
  start: number;
  end: number;
}

/**
 * プレビュー iframe を共通検索ストアへ橋渡しする SearchBinding を生成する。
 * @param getFrame 現在のプレビュー iframe を返すゲッター（srcdoc 再生成で contentDocument が
 *   差し替わるため、実行のたびに最新を取り直す）
 * @param report 件数・現在位置（0 始まり）をストアへ返すコールバック（search.report）
 */
export function createPreviewSearchBinding(
  getFrame: () => HTMLIFrameElement | undefined,
  report: (count: number, current: number) => void,
): SearchBinding {
  let matches: DomMatch[] = [];
  let current = -1;

  function frameDoc(): Document | undefined {
    return getFrame()?.contentDocument ?? undefined;
  }

  function highlightRegistry(): { ctor: HighlightCtor; registry: HighlightRegistryLike } | null {
    const win = getFrame()?.contentWindow;
    if (!win) return null;
    const g = win as unknown as HighlightGlobals;
    const ctor = g.Highlight;
    const registry = g.CSS?.highlights;
    if (!ctor || !registry) return null; // Highlight API 非対応＝ハイライトなしで劣化
    return { ctor, registry };
  }

  // iframe ドキュメントへ ::highlight スタイルを 1 回だけ注入（srcdoc 再生成で消えるので都度確認）。
  function ensureStyle(doc: Document): void {
    if (doc.getElementById('md-search-highlight-style')) return;
    const style = doc.createElement('style');
    style.id = 'md-search-highlight-style';
    style.textContent = HIGHLIGHT_STYLE;
    doc.head.appendChild(style);
  }

  // 現在のプレビュー本文からマッチ範囲を集める（テキストノード単位）。
  function collect(regex: RegExp | null): void {
    matches = [];
    const doc = frameDoc();
    if (!doc || !doc.body || regex === null) return;
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = node.nodeValue ?? '';
      if (text === '') continue;
      for (const r of findMatches(text, regex)) {
        matches.push({ node: node as Text, start: r.start, end: r.end });
      }
    }
  }

  // マッチ 1 件を iframe ドキュメントの Range に変換する。
  function rangeOf(doc: Document, m: DomMatch): Range {
    const range = doc.createRange();
    range.setStart(m.node, m.start);
    range.setEnd(m.node, m.end);
    return range;
  }

  // 全マッチ／現在マッチを CSS.highlights へ登録し直す。
  function paint(): void {
    const doc = frameDoc();
    const hl = highlightRegistry();
    if (!doc) return;
    if (!hl) return;
    hl.registry.delete(HL_ALL);
    hl.registry.delete(HL_CURRENT);
    if (matches.length === 0) return;
    ensureStyle(doc);
    const others: Range[] = [];
    let currentRange: Range | null = null;
    matches.forEach((m, i) => {
      const range = rangeOf(doc, m);
      if (i === current) currentRange = range;
      else others.push(range);
    });
    if (others.length > 0) hl.registry.set(HL_ALL, new hl.ctor(...others));
    if (currentRange) hl.registry.set(HL_CURRENT, new hl.ctor(currentRange));
  }

  // 現在マッチを画面中央付近へスクロールする（プログラム scroll＝scrollSync の追従とは独立）。
  function scrollToCurrent(): void {
    if (current < 0 || current >= matches.length) return;
    const doc = frameDoc();
    const win = getFrame()?.contentWindow;
    const scroller = doc?.scrollingElement;
    if (!doc || !win || !scroller) return;
    const rect = rangeOf(doc, matches[current]).getBoundingClientRect();
    const target = scroller.scrollTop + rect.top - win.innerHeight / 2;
    win.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  }

  function clearHighlights(): void {
    const hl = highlightRegistry();
    if (!hl) return;
    hl.registry.delete(HL_ALL);
    hl.registry.delete(HL_CURRENT);
  }

  return {
    run(query: string, options: SearchOptions): void {
      const regex = buildSearchRegex(query, options);
      collect(regex);
      current = matches.length > 0 ? 0 : -1;
      paint();
      scrollToCurrent();
      report(matches.length, current);
    },
    step(direction: 1 | -1): void {
      if (matches.length === 0) return;
      current = stepMatchIndex(current, matches.length, direction);
      paint();
      scrollToCurrent();
      report(matches.length, current);
    },
    clear(): void {
      matches = [];
      current = -1;
      clearHighlights();
    },
  };
}
