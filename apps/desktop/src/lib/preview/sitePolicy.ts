import { parseProjectConfig } from '@md-business/core';

/**
 * 下見の待ち受けへ渡す、そのプロジェクトが求めている実行範囲。
 *
 * これは宣言の写しであって許可ではない。宣言はプロジェクトの中にあるので、
 * 中身を書いた側が自由に書ける。実際に動かすかを決めるのは、この PC に置いてある同意で、
 * その突き合わせは受け取った側（Rust）で行う。
 */
export interface SitePolicy {
  /** プロジェクトが書いた script を動かすか。 */
  scripts: boolean;
  /** プロジェクト自身のファイル以外に、script を取り寄せてよい置き先。 */
  scriptOrigins: string[];
}

/**
 * 宣言の中身から実行範囲を組み立てる。
 *
 * 読めない宣言は `parseProjectConfig` の側で「何も動かさない」へ落ちる。
 * ここで汲み取り直さない。
 *
 * @param source `md-business.yml` の中身。ファイルが無ければ空文字。
 */
export function sitePolicyFrom(source: string): SitePolicy {
  const { config } = parseProjectConfig(source);
  return { scripts: config.mode === 'web', scriptOrigins: config.scriptOrigins };
}

/**
 * 出す前に何をするか。
 *
 * `consent` は失敗ではない。人がこの PC で 1 回押せば出せる、という途中の状態を指す。
 */
export type PreviewStart =
  | { kind: 'go'; policy: SitePolicy }
  | { kind: 'consent'; policy: SitePolicy };

/**
 * 宣言と同意を突き合わせて、そのまま出せるか、先に尋ねるかを決める。
 *
 * ここで通したものが最後の関門ではない。受け取った側（Rust）が同じ突き合わせをもう一度する。
 * こちらは尋ねる用事があるかを見るだけで、画面から届いた「許可済み」が動かす根拠にはならない。
 */
export function planStart(policy: SitePolicy, trusted: boolean): PreviewStart {
  if (policy.scripts && !trusted) return { kind: 'consent', policy };
  return { kind: 'go', policy };
}

/**
 * 書き出す前に何をするか。
 *
 * `consent` は失敗ではない。人がこの PC で 1 回押せば出せる、という途中の状態を指す。
 */
export type SiteWriteStart =
  | { kind: 'go'; rawHtml: boolean }
  | { kind: 'consent'; policy: SitePolicy };

/**
 * 書き出しでも同じ突き合わせを通す。
 *
 * 見たものと出すものを揃えるため。ここで黙って script 抜きへ倒すと、ブラウザで確かめた
 * ページと出来上がったフォルダの中身が別のものになる。違いは開くまで出ないので、
 * 配ってから気づくことになる。
 */
export function planWrite(policy: SitePolicy, trusted: boolean): SiteWriteStart {
  const step = planStart(policy, trusted);
  if (step.kind === 'consent') return step;
  return { kind: 'go', rawHtml: policy.scripts && trusted };
}

/**
 * アプリが宣言を書き換えられるか。
 *
 * `locked` は、人かエージェントが自分で書いた宣言があるということ。
 * そこへアプリから足し引きすると、書いた行や覚え書きを黙って崩すことになる。
 * 同じ判断を書き込む側（Rust）もしている。ここは押せるかを決めるだけ。
 */
export type WebModeToggle = 'declare' | 'withdraw' | 'locked';

/** @param source `md-business.yml` の中身。ファイルが無ければ空文字。 */
export function webModeToggle(source: string): WebModeToggle {
  const body = source.trim();
  if (body === '') return 'declare';
  if (body === 'mode: web') return 'withdraw';
  return 'locked';
}
