/**
 * 「出す」を押す前の下見を組み立てる純ロジック。
 *
 * Rust が返すのは git が持っている事実だけで、出せるか止めるかの判断はここでする。
 * 断る理由の文言はここに置かない（画面の言葉が 4 つあるので、呼び出し側で引く）。
 */
import type { GitStatus } from './gitStatus';

/** Rust `publish_survey` の戻り（serde camelCase）。 */
export interface PublishSurvey {
  status: GitStatus;
  /** 置き先の URL。git が持っているものそのまま。 */
  remote: string | null;
  /** このブランチに送り先が決まっているか。 */
  hasUpstream: boolean;
  /** 前回出したところから積んである commit の見出し（新しい順）。 */
  pending: string[];
  /** 出したあと走っているところを見に行く URL。分からない置き先では null。 */
  runsUrl: string | null;
}

/** 下見の結果。ready 以外は押させない。 */
export type PublishPlan =
  /** git の管理下でない。 */
  | { kind: 'no-repo' }
  /** 置き先が決まっていない。 */
  | { kind: 'no-remote' }
  /** どのブランチにも乗っていない。 */
  | { kind: 'detached' }
  /** 突き合わせが終わっていない。 */
  | { kind: 'conflicted'; paths: string[] }
  /** 置き先の方が進んでいる。 */
  | { kind: 'behind'; behind: number }
  /** 出すものが無い。 */
  | { kind: 'nothing' }
  /** 出せる。paths は commit する分、pending は commit 済みで未送信の分。 */
  | {
      kind: 'ready';
      branch: string;
      remote: string;
      paths: string[];
      pending: string[];
      hasUpstream: boolean;
      runsUrl: string | null;
    };

/**
 * 下見を決める。止める理由がある方を先に見て、最後に ready を返す。
 *
 * 押した後に置き先へ断られるより、押す前に理由を出したほうが直せる。
 */
export function planPublish(survey: PublishSurvey): PublishPlan {
  const { status } = survey;
  if (!status.isRepo) return { kind: 'no-repo' };
  if (status.branch === null) return { kind: 'detached' };
  if (survey.remote === null) return { kind: 'no-remote' };

  // 目印の行が入ったまま出ると、出た先では壊れた本文として置かれる。
  const conflicted = status.files.filter((file) => file.state === 'conflicted');
  if (conflicted.length > 0) {
    return { kind: 'conflicted', paths: conflicted.map((file) => file.relPath) };
  }

  // 置き先の方が進んでいると push は断られる。先に取り込む必要がある。
  if (status.behind > 0) return { kind: 'behind', behind: status.behind };

  const paths = status.files.map((file) => file.relPath);
  if (paths.length === 0 && survey.pending.length === 0) return { kind: 'nothing' };

  return {
    kind: 'ready',
    branch: status.branch,
    remote: survey.remote,
    paths,
    pending: survey.pending,
    hasUpstream: survey.hasUpstream,
    runsUrl: survey.runsUrl,
  };
}
