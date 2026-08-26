/**
 * 「このフォルダで、プロジェクトの JavaScript は動くのか」を組み立てる純ロジック。
 *
 * 答えは 2 つの独立した事実からできている。
 *
 * - **宣言**（`md-business.yml`）: プロジェクトが何を求めているか。リポジトリの中にあり、
 *   clone すれば誰でも書き換えられるので、これ自体は許可ではない。
 * - **同意**: この PC で人が 1 回押したかどうか。アプリだけが持っていて、
 *   プロジェクト側からは書けない。
 *
 * 止めているのは常に後者で、ここはそれを言葉にするだけ。宣言を読み替えて動く側へ
 * 倒す道は作らない。読めない宣言は「script を動かさない」側に落ちる。
 */

import {
  parseProjectConfig,
  webModeToggle,
  PROJECT_CONFIG_FILENAME,
  WEB_MODE_DECLARATION,
  type ProjectConfigProblem,
  type ProjectMode,
} from '@md-business/core';

/** アプリが答えた、この PC でのフォルダの扱い。 */
export interface TrustAnswer {
  /** 尋ねたフォルダ。 */
  path: string;
  /** この PC で人が許可を押してあるか。 */
  trusted: boolean;
}

/**
 * いまの状態。
 *
 * `awaiting-consent` は失敗ではない。人がアプリで 1 回押せば `ready` になる、
 * という途中の状態を指す。失敗として返すと、依頼元は「このフォルダでは無理だ」と
 * 受け取って別の道を探し始める。
 */
export type WebModeState = 'document' | 'awaiting-consent' | 'ready';

export interface WebModeStatus {
  state: WebModeState;
  /** 宣言されているモード。 */
  mode: ProjectMode;
  /** 宣言されている script の置き先（web モードのときだけ中身が入る）。 */
  scriptOrigins: string[];
  trusted: boolean;
  /** 尋ねたフォルダ。 */
  path: string;
  /** 宣言のうち、読めずに落とした点。 */
  problems: ProjectConfigProblem[];
  /** そのまま人に見せられる説明。次に何をすれば通るかを含む。 */
  summary: string;
}

/**
 * アプリが返した答えを検査して読み取る。形が違えば null。
 *
 * 読めないときに「許可済み」へ倒すと、誰も押していない許可で script が動くことになる。
 * ここは黙って補わない。
 */
export function parseTrustAnswer(data: unknown): TrustAnswer | null {
  if (typeof data !== 'object' || data === null) return null;
  const row = data as Record<string, unknown>;
  const path = row['path'];
  const trusted = row['trusted'];
  if (typeof path !== 'string' || typeof trusted !== 'boolean') return null;
  return { path, trusted };
}

function summarize(state: WebModeState, origins: string[]): string {
  switch (state) {
    case 'document':
      return (
        `このフォルダは document モードです（プロジェクトの JavaScript は動きません）。` +
        `動かすなら ${PROJECT_CONFIG_FILENAME} に mode: web を書いたうえで、` +
        `利用者がアプリでこのフォルダを許可する必要があります。`
      );
    case 'awaiting-consent':
      return (
        `${PROJECT_CONFIG_FILENAME} で web モードが宣言されていますが、この PC ではまだ許可されていません。` +
        `利用者がアプリでこのフォルダを開き、確認の表示で許可すると動くようになります。` +
        (origins.length === 0
          ? ''
          : `許可すると、プロジェクトのファイルに加えて ${origins.join(' / ')} からも script を読み込みます。`)
      );
    case 'ready':
      return (
        `web モードが宣言され、この PC でも許可されています。プロジェクトの JavaScript が動きます。` +
        (origins.length === 0 ? '' : `読み込み先: ${origins.join(' / ')}`)
      );
  }
}

/**
 * 宣言と同意を突き合わせて、いまの状態を組み立てる。
 *
 * @param source  `md-business.yml` の中身。ファイルが無ければ空文字。
 * @param trust   アプリが答えた、この PC での扱い
 */
export function describeWebMode(source: string, trust: TrustAnswer): WebModeStatus {
  const { config, problems } = parseProjectConfig(source);
  // 宣言が document なら、許可があってもここで終わる。許可はフォルダに与えたもので、
  // モードを引き上げる力は持たない。
  const state: WebModeState =
    config.mode !== 'web' ? 'document' : trust.trusted ? 'ready' : 'awaiting-consent';
  return {
    state,
    mode: config.mode,
    scriptOrigins: config.scriptOrigins,
    trusted: trust.trusted,
    path: trust.path,
    problems,
    summary: summarize(state, config.scriptOrigins),
  };
}

/**
 * 宣言を書くよう頼まれたときに、何をしてよいか。
 *
 * `already` は失敗ではない。求められているものが既にそこにあるだけで、
 * 次にすること（人が許可する）は `write` と変わらない。
 */
export type DeclarePlan =
  | { kind: 'write' }
  | { kind: 'already' }
  | { kind: 'refuse'; error: string };

/**
 * 宣言を書き足してよいかを決める。
 *
 * 書けるのは、宣言がまだ無いときだけ。既にある宣言は、書いた人のもの。
 * 読めない宣言も同じ扱いにする。読めないものを置き換えてよいことにすると、
 * 壊れた宣言がある日 web モードに化けて、誰も書いた覚えのない宣言が残る。
 *
 * @param source `md-business.yml` の中身。ファイルが無ければ空文字。
 */
export function planDeclareWebMode(source: string): DeclarePlan {
  const { config } = parseProjectConfig(source);
  // 置き先を添えてあるなど、こちらが書ける形でなくても、web モードなら用は足りている。
  if (config.mode === 'web') return { kind: 'already' };
  if (webModeToggle(source) === 'declare') return { kind: 'write' };
  return {
    kind: 'refuse',
    error:
      `${PROJECT_CONFIG_FILENAME} には既に別の宣言が書かれているので、書き換えませんでした。` +
      `上書きすると、書いた人が決めたことや覚え書きが黙って消えます。` +
      `web モードにするなら、この宣言を人が直してください。`,
  };
}

/** 宣言を書いた（または既にあった）あとの説明。次に人が何をすれば動くかで終える。 */
export function declareSummary(changed: boolean): string {
  return (
    (changed
      ? `${PROJECT_CONFIG_FILENAME} に web モードを宣言しました。`
      : `${PROJECT_CONFIG_FILENAME} では既に web モードが宣言されています。`) +
    `これはプロジェクトが求めているものを書いただけで、実行の許可ではありません。` +
    `動かすには、利用者がアプリでこのフォルダを開き、確認の表示で 1 回許可する必要があります。` +
    `許可を与える口はこちらにはありません。`
  );
}

/** 書き込む中身。宣言の本文は 1 か所（core）にしか無い。 */
export const WEB_MODE_DECLARATION_TEXT = WEB_MODE_DECLARATION;
