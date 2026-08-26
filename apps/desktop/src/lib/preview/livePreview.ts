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

/** サイトの部品を開いている面に何を出すか。 */
export type SitePartView =
  /** プロジェクトが自分で動かしている待ち受けを映す。 */
  | { kind: 'dev'; url: string }
  /** その待ち受けを宣言しているのに、まだ応えていない。 */
  | { kind: 'dev-down'; url: string }
  /** アプリが立てた待ち受けをそのまま映す。 */
  | { kind: 'live'; url: string }
  /** 待ち受けを立てる口を出す。 */
  | { kind: 'start' }
  /** web モードの宣言から先に要る。 */
  | { kind: 'declare' };

export interface SitePartInput {
  /** アプリが立てた待ち受けの、いま開いているファイルに当たる先。 */
  liveUrl: string | null;
  /** プロジェクトが宣言した、自前の待ち受けの在り処。 */
  devServer: string | null;
  /** その在り処が応えているか。 */
  devAnswering: boolean;
  /** 開いているフォルダが web モードを名乗っているか。 */
  declaredWeb: boolean;
}

/**
 * 手で書いた HTML や CSS を開いたときに出すもの。
 *
 * 立っている待ち受けがあれば、そこへ向ける。面の中で組み直すと、ブラウザで開いた窓と
 * 別物になり、どちらが本当かを確かめる先が 2 つになる。立っていないときに断り書きだけを
 * 出すと、見る手立てが別の窓しか無いように読めるので、立てる口を出す。
 *
 * 自前の待ち受けを宣言しているフォルダでは、そちらが先。Astro や Vite のように
 * ページを組み上げてから出すものは、アプリが同じ中身を組み直せない。応えていないときに
 * 手元の待ち受けへすり替えないのも同じ理由で、宣言した在り処と違うものが黙って映ると、
 * 直す先が分からなくなる。
 */
export function sitePartView(input: SitePartInput): SitePartView {
  const { liveUrl, devServer, devAnswering, declaredWeb } = input;
  if (devServer !== null) {
    return devAnswering ? { kind: 'dev', url: devServer } : { kind: 'dev-down', url: devServer };
  }
  if (liveUrl !== null) return { kind: 'live', url: liveUrl };
  return declaredWeb ? { kind: 'start' } : { kind: 'declare' };
}
