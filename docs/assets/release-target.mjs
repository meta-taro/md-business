/**
 * ダウンロードページが「どのリリースを見せるか」を決める部分。
 *
 * 既定は最新版。`?v=0.9.0` を付けると、その版を固定して見せる（古い版を配る必要が
 * 出たときのため）。検査は scripts/download-page.test.mjs にある。
 */

/** 受け取れる版の形。三つ組の数字だけに絞る。 */
const VERSION = /^v?(\d+)\.(\d+)\.(\d+)$/;

/**
 * URL のクエリから、指定された版をタグ名（`v0.9.0`）で返す。指定が無い・形が違えば null。
 *
 * ここで返した文字列はそのまま API の path に入る。形を緩めると、ダウンロード先を
 * 別のリポジトリへ向けるリンクを作れてしまうので、当てはまらないものは全て落とす。
 */
export function requestedTag(search) {
  const raw = new URLSearchParams(search).get('v');
  if (raw === null || !VERSION.test(raw)) return null;
  return raw.startsWith('v') ? raw : `v${raw}`;
}

/** 引くリリースの API URL。tag が null なら最新。 */
export function releaseApiUrl(repo, tag) {
  const base = `https://api.github.com/repos/${repo}/releases`;
  return tag === null ? `${base}/latest` : `${base}/tags/${tag}`;
}
