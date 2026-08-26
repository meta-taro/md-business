/**
 * ブラウザ表示の判断（純ロジック・IPC なし）。
 *
 * サーバーの出し入れは browserPreviewController、待ち受けは Rust 側。ここにあるのは
 * 「変化を受けて組み直すか」「表示をやめるか」だけ。コントローラから切り離してあるのは、
 * この判断を Tauri を起動せずに確かめられるようにするため（siteExport.ts と同じ切り方）。
 */

import type { FileChangeEvent } from '$lib/workspace/watchLogic';

/** 書き出し先。ここの変化は自分が書いた結果なので、受けて組み直すと堂々巡りになる。 */
const OUTPUT_DIR = 'dist/';

/** 組み直すかの判断に要るものだけ。 */
export type SiteWatchInput = Pick<FileChangeEvent, 'relPath' | 'scope' | 'kind'>;

/**
 * その変化でサイトを組み直すか。
 *
 * ページになる `.md` だけでなく、CSS・JS・データも同じフォルダから出しているので、
 * どれが変わっても読み直させる。**ここで種類を見分けない**のは、見分けた表が
 * サーバー側の表と食い違うと、直したのに窓が古いまま——という、最も気づきにくい
 * 止まり方をするため。どちらに効くかは送り側が決めて `scope` に載せてくる。
 *
 * サイトにしか出ない部品（HTML / CSS / JS）は、web モードで出している間だけ数える。
 * 業務文書として出しているときは集めていないので、組み直しても同じものが出る＝
 * 見ている人には、何も変えていないのに窓が瞬いたようにしか映らない。
 *
 * 宣言そのものは数えない。それが何を意味するかは、宣言を読み直す側が決める。
 */
export function affectsSite(change: SiteWatchInput, servingWeb: boolean): boolean {
  if (change.relPath.startsWith(OUTPUT_DIR)) return false;
  if (change.scope === 'config') return false;
  return change.scope === 'tree' || servingWeb;
}

/**
 * 組み直さずに、その場で新しくできるか。
 *
 * サイトにしか出ない部品は、待ち受けが中身を覚えずに要求のたびに元を読む。だから
 * **書き換わっただけ**なら、版を進めれば次の読み直しで新しいものが出る。組み直すと
 * 本文から作るページまで作り直すので、CSS を 1 行直すたびに全文を描き直すことになる。
 *
 * 増えた・消えたときは在り処を覚え直さないと出せないので、組み直しへ回す。
 */
export function canRefreshInPlace(change: SiteWatchInput): boolean {
  return change.scope === 'site' && change.kind === 'modified';
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
