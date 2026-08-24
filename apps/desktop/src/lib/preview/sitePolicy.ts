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
