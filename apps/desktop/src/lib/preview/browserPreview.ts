/**
 * ブラウザ表示の判断（純ロジック・IPC なし）。
 *
 * サーバーの出し入れは browserPreviewController、待ち受けは Rust 側。ここにあるのは
 * 「変化を受けて組み直すか」「表示をやめるか」だけ。コントローラから切り離してあるのは、
 * この判断を Tauri を起動せずに確かめられるようにするため（siteExport.ts と同じ切り方）。
 */

/** 書き出し先。ここの変化は自分が書いた結果なので、受けて組み直すと堂々巡りになる。 */
const OUTPUT_DIR = 'dist/';

/**
 * その相対パスの変化でサイトを組み直すか。
 *
 * ページになる `.md` だけでなく、CSS・JS・データも同じフォルダから出しているので、
 * どれが変わっても読み直させる。**種類で絞らない**のは、絞った表がサーバー側の表と
 * 食い違うと、直したのに窓が古いまま——という、最も気づきにくい止まり方をするため。
 * 出してよいかを決めるのは常にサーバー側で、ここは「動きがあったか」しか見ない。
 */
export function affectsSite(relPath: string): boolean {
  return !relPath.startsWith(OUTPUT_DIR);
}

/**
 * 開いているフォルダが変わったとき、立っているサーバーを畳むか。
 *
 * 畳まないと、別のフォルダを開いた後も前のフォルダの中身が同じ URL で出続ける。
 */
export function shouldStop(servingRoot: string, currentRoot: string | null): boolean {
  return servingRoot !== currentRoot;
}

/** ライブを立てるかを考えた切っ掛け。 */
export type LiveTrigger =
  /** フォルダを開いた（人がそのフォルダを選んだ）。 */
  | 'opened'
  /** 同じフォルダを取り直した（開き直し・再走査）。 */
  | 'rescanned'
  /** 宣言そのものが書き換わった。 */
  | 'declared';

export interface AutoLiveInput {
  trigger: LiveTrigger;
  /** 開いているフォルダが web モードを宣言しているか。 */
  declaredWeb: boolean;
  /** この PC でそのフォルダを許してあるか。 */
  trusted: boolean;
  /** もう待ち受けが立っているか。 */
  serving: boolean;
}

/**
 * 押さずにライブを立てるか。
 *
 * 同意はこの PC でそのフォルダに 1 回押したもので、「次からは黙って出してよい」と重なる。
 * だから同意済みのフォルダを開いた時だけ立てる。まだ同意が無いフォルダで自動に尋ねない
 * （開いただけで許可を訊く窓が出ると、読むだけのつもりの人にまで押させることになる）。
 *
 * 切っ掛けを見ているのは、宣言がプロジェクトの中にあって書いた側から置けるため。
 * 置かれた瞬間に立てる形にすると、ファイルを 1 つ置くだけで手元にポートが開く。
 * 取り直しでも立てない。押して畳んだ人の手を、再走査のたびに元へ戻すことになる。
 */
export function shouldAutoLive({
  trigger,
  declaredWeb,
  trusted,
  serving,
}: AutoLiveInput): boolean {
  if (trigger !== 'opened') return false;
  if (serving) return false;
  return declaredWeb && trusted;
}
