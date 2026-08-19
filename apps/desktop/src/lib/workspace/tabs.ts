/**
 * 開いている文書の並び（タブ）の純ロジック。
 *
 * 「どれを開く / 閉じる / 閉じたあとどれを選ぶ」の判定にはファイル入出力も DOM も
 * 要らない。ここへ出して全分岐をテストで固定し、rune ストア（`workspace.svelte.ts`）は
 * 中身の持ち替えだけを担う。
 */

/**
 * 並びを決めるのに要る分だけのタブ。中身（本文・保存状態）は呼び出し側が持つ。
 */
export interface TabRef {
  /** タブの同一性。ファイル名の変更で変わらないよう、パスとは別に持つ。 */
  id: string;
  /** ルートからの相対パス。 */
  relPath: string;
  /** 最後に選ばれたときの通し番号。大きいほど最近触った。 */
  touchSeq: number;
}

/**
 * 同時に開ける枚数。帯の幅で決まる——これ以上は 1 枚あたりが狭くなり、
 * 名前が読めないタブが並ぶだけになる。
 */
export const MAX_TABS = 12;

/** 同じファイルが既に開いていればそのタブ。同じものを 2 枚にしないために使う。 */
export function findByPath<T extends TabRef>(tabs: readonly T[], relPath: string): T | null {
  return tabs.find((t) => t.relPath === relPath) ?? null;
}

/**
 * 上限に達しているとき、新しい 1 枚のために閉じるタブ。達していなければ null。
 *
 * 選ぶのは**最後に触ってから一番経った**もの。並びの先頭ではない——左端に置いたまま
 * ずっと参照している 1 枚を、右で開いた使い捨てのために閉じることになる。
 * 選択中のタブは対象にしない（今見ているものが消える）。
 */
export function evictionTarget(
  tabs: readonly TabRef[],
  limit: number,
  activeId: string | null,
): string | null {
  if (tabs.length < limit) return null;
  const candidates = tabs.filter((t) => t.id !== activeId);
  if (candidates.length === 0) return null;
  return candidates.reduce((oldest, t) => (t.touchSeq < oldest.touchSeq ? t : oldest)).id;
}

/**
 * `closingId` を閉じたあとに選ぶタブ。閉じるのが選択中でなければ選択は動かさない。
 *
 * 選択中を閉じたときは右隣、無ければ左隣。VSCode と同じで、閉じた場所に近いものが
 * 残るほうが、続けて閉じるときに手が動かない。
 */
export function nextActiveId(
  tabs: readonly TabRef[],
  closingId: string,
  activeId: string | null,
): string | null {
  if (closingId !== activeId) return activeId;
  const at = tabs.findIndex((t) => t.id === closingId);
  if (at < 0) return activeId;
  return tabs[at + 1]?.id ?? tabs[at - 1]?.id ?? null;
}

/** `id` を外した新しい並び（入力は変えない）。 */
export function withoutTab<T extends TabRef>(tabs: readonly T[], id: string): T[] {
  return tabs.filter((t) => t.id !== id);
}

/**
 * 走査結果に残っているファイルのタブだけを残す。並びは変えない。
 * 外部で消された・改名されたファイルのタブは、開いたままにすると保存先が無い。
 */
export function keepExistingTabs<T extends TabRef>(
  tabs: readonly T[],
  filePaths: ReadonlySet<string>,
): T[] {
  return tabs.filter((t) => filePaths.has(t.relPath));
}

/**
 * 整理したあと、どのタブを手前に出すか。
 * 手前だったタブが残っていればそのまま。消えていたら最後のタブへ移る（1 枚も無ければ null）。
 */
export function survivingActiveId(tabs: readonly TabRef[], activeId: string | null): string | null {
  if (activeId === null) return null;
  if (tabs.some((t) => t.id === activeId)) return activeId;
  return tabs.at(-1)?.id ?? null;
}
