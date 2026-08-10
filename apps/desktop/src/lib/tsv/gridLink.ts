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
 * 表の中で完結する指し先か。ここが false のものは、表の外（別のファイル・ブラウザ）へ
 * 出るので、受け取り手が要る。
 */
function staysInSheet(link: CellLink): boolean {
  return link.kind === 'row' && link.path === null;
}

/**
 * いま追える指し先か。
 *
 * 移動の実装を足すたびにここへ 1 つ加える。判定を 1 箇所に集めてあるので、
 * 「解釈はできるのに追えない」種類が増えても、リンクの見た目と挙動がずれない。
 */
function followable(link: CellLink): boolean {
  return link.kind === 'external' || staysInSheet(link);
}

/**
 * セルの値を、いま追えるリンクとして読む。読めなければ null。
 *
 * @param kind その列のウィジェット種別（列が無いセルは undefined）
 * @param value セルの値
 * @param canOpenElsewhere 表の外へ出る指し先を受け取る相手がいるか
 */
export function followableLink(
  kind: CellWidgetKind | undefined,
  value: string,
  canOpenElsewhere: boolean,
): CellLink | null {
  if (kind !== 'url') return null;
  const link = parseCellLink(value);
  if (link === null || !followable(link)) return null;
  return canOpenElsewhere || staysInSheet(link) ? link : null;
}
