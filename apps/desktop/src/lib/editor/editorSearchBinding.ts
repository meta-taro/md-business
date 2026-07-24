/**
 * CodeMirror エディター側の検索バインド（DOM 依存・実機検証層）。
 *
 * 共通 SearchBar（search ストア）から driven される。純ロジック（buildSearchRegex /
 * findMatches / stepMatchIndex）でマッチ範囲を求め、CodeMirror の StateField 装飾で
 * 全マッチをハイライト、現在マッチを選択してスクロールする。CodeMirror 既定の検索
 * パネル（basicSetup 同梱）は使わず、Mod+F を横取りして共通バーへ寄せる（markdownEditor.ts）。
 *
 * 装飾・選択・スクロールは EditorView 依存のため単体テストは持たず、pnpm build /
 * tauri dev で実機検証する。マッチ計算・前後移動の分岐は searchLogic の単体テスト済み。
 */
import { EditorView, Decoration, type DecorationSet } from '@codemirror/view';
import { StateEffect, StateField } from '@codemirror/state';
import {
  buildSearchRegex,
  findMatches,
  stepMatchIndex,
  type MatchRange,
  type SearchOptions,
} from '$lib/search/searchLogic';
import type { SearchBinding } from '$lib/search/search.svelte';

// 装飾更新の効果。全マッチ範囲と現在インデックス（-1=無し）を運ぶ。
const setSearchHighlight = StateEffect.define<{ ranges: MatchRange[]; current: number }>();

const matchMark = Decoration.mark({ class: 'cm-search-match' });
const currentMark = Decoration.mark({ class: 'cm-search-match cm-search-match-current' });

function buildDecorations(ranges: MatchRange[], current: number): DecorationSet {
  if (ranges.length === 0) return Decoration.none;
  const decos = ranges.map((r, i) =>
    (i === current ? currentMark : matchMark).range(r.start, r.end),
  );
  return Decoration.set(decos, true);
}

/** 検索ハイライト装飾フィールド。markdownEditor の拡張に含める。 */
export const searchHighlightField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(value, tr) {
    // ドキュメント変更に追従して装飾位置を写像（古い装飾のズレを防ぐ）。
    let next = value.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setSearchHighlight)) {
        next = buildDecorations(effect.value.ranges, effect.value.current);
      }
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/**
 * EditorView を共通検索ストアへ橋渡しする SearchBinding を生成する。
 * @param view 対象の CodeMirror EditorView
 * @param report 件数・現在位置（0 始まり）をストアへ返すコールバック（search.report）
 */
export function createEditorSearchBinding(
  view: EditorView,
  report: (count: number, current: number) => void,
): SearchBinding {
  let ranges: MatchRange[] = [];
  let current = -1;

  // 現在マッチを選択してスクロール表示し、装飾を貼り直す。
  function apply(): void {
    const effects = [setSearchHighlight.of({ ranges, current })];
    if (current >= 0 && current < ranges.length) {
      const r = ranges[current];
      view.dispatch({
        selection: { anchor: r.start, head: r.end },
        effects: [...effects, EditorView.scrollIntoView(r.start, { y: 'center' })],
      });
    } else {
      view.dispatch({ effects });
    }
  }

  return {
    run(query: string, options: SearchOptions): void {
      const regex = buildSearchRegex(query, options);
      ranges = findMatches(view.state.doc.toString(), regex);
      current = ranges.length > 0 ? 0 : -1;
      apply();
      report(ranges.length, current);
    },
    step(direction: 1 | -1): void {
      if (ranges.length === 0) return;
      current = stepMatchIndex(current, ranges.length, direction);
      apply();
      report(ranges.length, current);
    },
    clear(): void {
      ranges = [];
      current = -1;
      view.dispatch({ effects: [setSearchHighlight.of({ ranges, current })] });
    },
  };
}
