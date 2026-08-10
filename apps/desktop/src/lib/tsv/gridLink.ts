/**
 * グリッドのセルを「押せるリンク」として出してよいかの判定。
 *
 * 文字列の読み方は {@link parseCellLink} が持つ。ここが決めるのは 2 つだけ。
 *
 * 1. **どの列を見るか** — `url` 型と宣言された列だけを見る。自由文の列まで走査すると、
 *    セルを 1 つ確定するたびに行数ぶんの解析が走る。値がたまたまリンクに見えて誤爆もする。
 * 2. **受け取り手がいるか** — 表の外へ出る指し先は、受け取る親がいなければリンクにしない。
 *    押しても何も起きないリンクは、壊れているのと区別がつかない。
 *
 * {@link parseCellLink} が読める種類は、いまはすべて追える。読めるのに追えない種類を
 * 足すときは、ここで弾いてリンクの見た目から外すこと（見た目と挙動をずらさない）。
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
  if (link === null) return null;
  return canOpenElsewhere || staysInSheet(link) ? link : null;
}
