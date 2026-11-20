/**
 * 原本のページの区切り（`<div class="page">p.19</div>`）で本を割るときの純関数。
 *
 * 段組みで割ると、ページの中身は窓の大きさで次のページへ流れていく。紙の教材を写した文書では
 * それが困る（「3 ページの問題は 3 ページに」ないと、原本と突き合わせられない）。
 * 区切りがある文書では区切りを 1 ページとし、はみ出す分は流さずに縮めて収める。
 */

/** 中身の高さを枠に収める倍率（1 以下）。寸法が取れないときは縮めない。 */
export function fitScale(contentHeight: number, boxHeight: number): number {
  if (contentHeight <= 0 || boxHeight <= 0) return 1;
  return Math.min(1, boxHeight / contentHeight);
}

/** 打たれた番号を比べられる形にする（全角を半角に・大文字を小文字に・空白と「p.」を落とす）。 */
function normalize(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/^p\.?(?=\d)/, '');
}

/**
 * 「p.19」「19」などの指定から、開くページ（0 始まり）を引く。見つからなければ null。
 *
 * 区切りのある文書では原本の番号だけを見る。通し番号へ落とすと、原本に無い番号を打ったとき
 * 別のページが開き、合っているように見えてしまう。
 */
export function findPage(
  query: string,
  labels: readonly string[],
  total: number
): number | null {
  const wanted = normalize(query);
  if (wanted === '') return null;
  if (labels.length > 0) {
    const index = labels.findIndex((label) => normalize(label) === wanted);
    return index >= 0 ? index : null;
  }
  if (!/^\d+$/.test(wanted)) return null;
  const n = Number(wanted);
  return n >= 1 && n <= total ? n - 1 : null;
}

/** ページ表示（「p.18–p.19 · 12–13 / 40」）。原本の番号が無いページは通し番号だけ。 */
export function sheetLabel(
  page: number,
  perView: 1 | 2,
  labels: readonly string[]
): string {
  const total = labels.length;
  const last = Math.min(page + perView, total) - 1;
  const seq =
    last === page
      ? `${page + 1} / ${total}`
      : `${page + 1}–${last + 1} / ${total}`;
  const names = labels.slice(page, last + 1).filter((name) => name !== '');
  return names.length === 0 ? seq : `${names.join('–')} · ${seq}`;
}
