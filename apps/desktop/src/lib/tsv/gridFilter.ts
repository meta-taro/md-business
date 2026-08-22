/**
 * 絞り込み — 表から外す行を決める（DOM 非依存の純ロジック）。
 *
 * 決めるのは **外す側の行 ID** で、残す側ではない。残す側で持つと、絞り込み中に足した行が
 * 生まれた瞬間に消える。外す側なら、後から足した行は外れていないので見えたままになる。
 *
 * 返した集合は押した時点のもので、そのまま持ち続ける。当たっている行を都度数え直すと、
 * `結果` を NG から OK へ直した瞬間にその行が目の前から消える。直している最中の行が消えるのは、
 * どう説明しても事故に見える。
 *
 * 渡す doc は既に外した分を抜いた表なので、返り値はいま見えている行の中からさらに外す分になる。
 * 呼び出し側で既存の集合へ足せば、押すたびに絞り込みが深くなる。
 */
import type { IdentifiedTsv } from '@md-business/schema-test-spec-tsv';
import { findGridMatches } from './gridSearch';

/**
 * 探した言葉がどのセルにも当たらない行の ID。
 *
 * 当たりの判定は検索窓と同じ {@link findGridMatches} に任せる。ここで別に組むと、
 * 「探すと出るのに絞ると消える」行が出る。
 *
 * 言葉が無い（regex が null）ときは何も外さない。1 行も当たらないときは全行外れる。
 */
export function unmatchedRowIds(doc: IdentifiedTsv, regex: RegExp | null): Set<string> {
  if (regex === null) return new Set();

  const matched = new Set<number>();
  for (const match of findGridMatches(doc, regex)) matched.add(match.row);

  const excluded = new Set<string>();
  doc.rowIds.forEach((id, row) => {
    if (!matched.has(row)) excluded.add(id);
  });
  return excluded;
}

/**
 * 指定した列の値が渡された値と違う行の ID。
 *
 * 前後の空白は落として比べる。表計算を通ったセルには空白が付くことがあり、見た目が同じ値を
 * 別扱いにすると、集めたはずの行が絞った表から抜け落ちる。
 *
 * 空の値も値として扱う（まだ結果を入れていない行だけを集める使い方があるため）。
 * 宣言されていない列を指したときは何も外さない。
 */
export function unlikeRowIds(doc: IdentifiedTsv, column: number, value: string): Set<string> {
  if (column < 0 || column >= doc.columns.length) return new Set();

  const want = value.trim();
  const excluded = new Set<string>();
  doc.rowIds.forEach((id, row) => {
    if ((doc.rows[row]?.[column] ?? '').trim() !== want) excluded.add(id);
  });
  return excluded;
}
