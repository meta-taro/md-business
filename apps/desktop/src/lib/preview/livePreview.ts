/**
 * 出している最中の待ち受けを、アプリのプレビュー面にそのまま映すための宛先。
 *
 * 業務文書は今までどおりアプリの中で組んだものを見せる（本文の HTML は落としてある）。
 * web モードで出している間だけ、同じ中身をブラウザと同じ経路から映す。こうすると
 * CSS も JS も書いた HTML も、ブラウザで開いたときと同じものが同じ順で動く。
 * 面の中で組み直すのではなく、既に立っている待ち受けを指すだけなので、
 * 「アプリの中では動くがブラウザでは動かない」というずれ方が起きない。
 */

/** ページになる本文。 */
const MD_EXT = /\.md$/i;
/** 手で書いた読む面。置いた場所のまま出ているので、そのまま指す。 */
const HTML_EXT = /\.html?$/i;

export interface LivePreviewTarget {
  /** 待ち受けの入口。立っていなければ null。 */
  base: string | null;
  /** 出している中身が web モードか。業務文書として出しているなら false。 */
  web: boolean;
  /** 開いている文書（フォルダからの相対）。 */
  relPath: string | null;
}

/**
 * プレビュー面に映す URL。映さないときは null（呼ぶ側は今までの組み立てを出す）。
 *
 * ページにならないもの（CSS・データなど）を開いている間は入口を出す。中身をそのまま
 * 映しても読む面にならないうえ、作っている最中に見たいのは組み上がった側のほうなので。
 */
export function livePreviewUrl({ base, web, relPath }: LivePreviewTarget): string | null {
  if (base === null || !web) return null;
  const root = base.endsWith('/') ? base : `${base}/`;
  if (relPath === null) return root;
  // 区切りは円記号でも来る（この PC の書き方でそのまま渡ってくる）。
  const parts = relPath.split(/[\\/]/).filter((part) => part !== '' && part !== '.');
  // サイトの外を指すものは組み立てない。指しても待ち受けは返さないので、入口を出す。
  if (parts.length === 0 || parts.includes('..')) return root;
  const last = parts[parts.length - 1];
  const page = MD_EXT.test(last)
    ? last.replace(MD_EXT, '.html')
    : HTML_EXT.test(last)
      ? last
      : null;
  if (page === null) return root;
  const encoded = [...parts.slice(0, -1), page].map((part) => encodeURIComponent(part));
  return `${root}${encoded.join('/')}`;
}
