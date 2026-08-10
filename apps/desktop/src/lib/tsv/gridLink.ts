/**
 * グリッドのセルを「押せるリンク」として出してよいかの判定。
 *
 * 文字列の読み方は {@link parseCellLink} が持つ。ここが決めるのは 2 つだけ。
 *
 * 1. **どの列を見るか** — `url` 型と宣言された列だけを見る。自由文の列まで走査すると、
 *    セルを 1 つ確定するたびに行数ぶんの解析が走る。値がたまたまリンクに見えて誤爆もする。
 * 2. **いま追える指し先か** — 移動をまだ実装していない指し先は、リンクの見た目にしない。
 *    押しても何も起きないリンクは、壊れているのと区別がつかない。
 */
import { parseCellLink, type CellLink } from '@md-business/schema-test-spec-tsv';
import type { CellWidgetKind } from './gridModel';

/**
 * いま画面から追える指し先。
 *
 * 移動の実装を足すたびにここへ 1 つ加える。判定を 1 箇所に集めてあるので、
 * 「解釈はできるのに追えない」種類が増えても、リンクの見た目と挙動がずれない。
 */
const FOLLOWABLE = new Set<CellLink['kind']>(['external']);

/**
 * セルの値を、いま追えるリンクとして読む。読めなければ null。
 *
 * @param kind その列のウィジェット種別（列が無いセルは undefined）
 * @param value セルの値
 */
export function followableLink(kind: CellWidgetKind | undefined, value: string): CellLink | null {
  if (kind !== 'url') return null;
  const link = parseCellLink(value);
  if (link === null) return null;
  return FOLLOWABLE.has(link.kind) ? link : null;
}
