// 検索の UI 状態ストア（Svelte 5 runes）。エディターとプレビューで 1 本の SearchBar を共有し、
// クエリ・オプション・件数・現在位置・開閉・対象（editor/preview）を保持する。
//
// 実際のハイライト／スクロールは対象ごとに異なる（CodeMirror API ⇔ iframe 内 find）。
// そこでバインド層（editor / preview）が SearchBinding を register し、ストアは
// クエリ変更・前後移動をアクティブなバインドへ委譲する。結果（件数・現在位置）は
// report() でストアへ返す（プレビューは postMessage 経由で非同期に返るため、戻り値でなく
// report のプッシュ型にして editor/preview の同期・非同期差を吸収する）。

import { DEFAULT_SEARCH_OPTIONS, type SearchOptions } from './searchLogic';

/** 検索対象。エディター（左）とプレビュー（右 iframe）。 */
export type SearchTarget = 'editor' | 'preview';

/** バインド層が実装する検索操作。結果は search.report() でストアへ返す。 */
export interface SearchBinding {
  /** クエリ／オプションで検索を実行しハイライトする。結果は report() で返す。 */
  run(query: string, options: SearchOptions): void;
  /** 前（-1）／次（+1）のマッチへ移動する。結果は report() で返す。 */
  step(direction: 1 | -1): void;
  /** 検索終了時にハイライトを消す。 */
  clear(): void;
}

const FALLBACK_TARGET: SearchTarget = 'editor';

let open = $state(false);
let query = $state('');
let options = $state<SearchOptions>({ ...DEFAULT_SEARCH_OPTIONS });
let count = $state(0);
let current = $state(-1); // 0 始まり。マッチ無しは -1。
let target = $state<SearchTarget>(FALLBACK_TARGET);

// 対象ごとのバインド。登録されていない対象では検索は no-op（件数 0）。
const bindings: Partial<Record<SearchTarget, SearchBinding>> = {};

function activeBinding(): SearchBinding | undefined {
  return bindings[target];
}

// アクティブバインドで再検索を実行（未登録なら件数リセット）。
function rerun(): void {
  const binding = activeBinding();
  if (!binding) {
    count = 0;
    current = -1;
    return;
  }
  binding.run(query, options);
}

export const search = {
  get open(): boolean {
    return open;
  },
  get query(): string {
    return query;
  },
  get options(): SearchOptions {
    return options;
  },
  get count(): number {
    return count;
  },
  /** 表示用の 1 始まり現在位置（マッチ無しは 0）。 */
  get current(): number {
    return current;
  },
  get target(): SearchTarget {
    return target;
  },

  /** バインド層（エディター／プレビュー）が自分の検索操作を登録する。 */
  register(t: SearchTarget, binding: SearchBinding): void {
    bindings[t] = binding;
    // 開いている対象のバインドが（再マウント等で）差し替わったら即再検索。
    if (open && t === target) binding.run(query, options);
  },

  /** バインド層の破棄時に登録解除（アクティブ対象なら件数もクリア）。 */
  unregister(t: SearchTarget): void {
    delete bindings[t];
    if (t === target) {
      count = 0;
      current = -1;
    }
  },

  /** 指定対象で検索バーを開く（既に開いていれば対象だけ切替えて再検索）。 */
  openFor(t: SearchTarget): void {
    target = t;
    open = true;
    rerun();
  },

  /** 検索バーを閉じ、アクティブ対象のハイライトを消す。 */
  close(): void {
    if (!open) return;
    open = false;
    activeBinding()?.clear();
    count = 0;
    current = -1;
  },

  /** クエリ更新 → 即再検索。 */
  setQuery(next: string): void {
    query = next;
    rerun();
  },

  /** オプション（caseSensitive/regex/wholeWord）をトグル → 再検索。 */
  toggleOption(key: keyof SearchOptions): void {
    options = { ...options, [key]: !options[key] };
    rerun();
  },

  /** 次のマッチへ。 */
  next(): void {
    activeBinding()?.step(1);
  },

  /** 前のマッチへ。 */
  prev(): void {
    activeBinding()?.step(-1);
  },

  /** バインド層が検索／移動の結果（件数・現在 0 始まり位置）をストアへ返す。 */
  report(matchCount: number, currentIndex: number): void {
    count = matchCount;
    current = currentIndex;
  },
};
