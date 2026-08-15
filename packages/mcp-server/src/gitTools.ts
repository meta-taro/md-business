/**
 * MCP git ツール本体（status / diff / commit）。
 * -----------------------------------------------------------------------------
 * 文書ツールが DocumentStore 越しに動くのと同じで、ここは GitRunner 越しに動く。
 * プロセス起動を持たないので、引数の組み立てと出力の解釈を純ロジックとして単体
 * テストできる。実際の `git` 実行は gitRunner.ts が担う。
 *
 * push は **意図的に用意していない**。リモートへ出す操作は人が内容を確認してから
 * 実行する運用のため、エージェントから叩ける口を作らない。
 */
import { safeRelativePath } from './workspacePath.js';

/** `git` 1 回分の実行結果。ok は終了コード 0 かどうか。 */
export interface GitRunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

/** ワークスペースに紐づいた `git` 実行器。args に `git` 自体は含めない。 */
export interface GitRunner {
  run(args: string[]): Promise<GitRunResult>;
}

/** 変更ファイル 1 件の状態。デスクトップのファイル一覧と同じ分類。 */
export type GitFileState =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'untracked'
  | 'conflicted';

export interface GitFileStatus {
  /** リポジトリ root 基準の `/` 区切りパス。 */
  path: string;
  state: GitFileState;
}

export interface GitStatusSummary {
  /** 現在のブランチ（detached HEAD は null）。 */
  branch: string | null;
  /** upstream より進んでいるコミット数。 */
  ahead: number;
  /** upstream より遅れているコミット数。 */
  behind: number;
  files: GitFileStatus[];
}

/** git を呼べなかった / git が失敗したときの共通形（文書ツールの ToolError と同形）。 */
export interface GitToolError {
  ok: false;
  error: string;
}

export type GitStatusResult = ({ ok: true } & GitStatusSummary) | GitToolError;

export interface GitDiffOk {
  ok: true;
  /** 対象パス（未指定ならワークスペース全体を意味する null）。 */
  path: string | null;
  /** unified diff テキスト。差分なしは空文字列。 */
  diff: string;
  /** まだ git の管理下に無いファイルか（true なら diff は空になる）。 */
  untracked: boolean;
}

export type GitDiffResult = GitDiffOk | GitToolError;

export interface GitCommitInput {
  message: string;
  /** ステージするパス（省略で全変更）。 */
  paths?: string[];
}

export type GitCommitResult = ({ ok: true; commit: string } & GitStatusSummary) | GitToolError;

/** git が失敗したときのメッセージ。stderr が空なら stdout で代替する。 */
function reasonOf(result: GitRunResult): string {
  const detail = result.stderr.trim() || result.stdout.trim();
  return detail === '' ? 'git の実行に失敗しました' : detail;
}

/**
 * XY 2 文字（index, worktree）から状態を 1 つ選ぶ。
 * 追加・削除・リネームを優先し、残り（M / T / C など）は modified に丸める。
 */
function classifyXy(xy: string): GitFileState {
  if (xy.includes('A')) return 'added';
  if (xy.includes('D')) return 'deleted';
  if (xy.includes('R')) return 'renamed';
  return 'modified';
}

/** メタトークンを読み飛ばして path を取り出す（path 自体は空白を含みうるので分割数を固定する）。 */
function pathAfter(field: string, metaTokens: number): string | null {
  const parts = field.split(' ');
  if (parts.length <= metaTokens) return null;
  return parts.slice(metaTokens).join(' ');
}

/**
 * `git status --porcelain=v2 --branch -z` の stdout を解釈する。
 *
 * `-z` により各レコードは NUL 終端。リネーム（`2 `）だけは path の直後に変更前パスが
 * 別レコードとして続くため、1 件で 2 レコードを消費する。
 */
export function parseStatusPorcelainV2(stdout: string): GitStatusSummary {
  const summary: GitStatusSummary = { branch: null, ahead: 0, behind: 0, files: [] };
  const fields = stdout.split('\0').filter((f) => f !== '');

  for (let i = 0; i < fields.length; i += 1) {
    const field = fields[i] as string;

    if (field.startsWith('# branch.head ')) {
      const head = field.slice('# branch.head '.length);
      summary.branch = head === '(detached)' ? null : head;
      continue;
    }
    if (field.startsWith('# branch.ab ')) {
      // 形式: "+<ahead> -<behind>"
      const [a, b] = field.slice('# branch.ab '.length).split(' ');
      summary.ahead = Number.parseInt((a ?? '').replace('+', ''), 10) || 0;
      summary.behind = Number.parseInt((b ?? '').replace('-', ''), 10) || 0;
      continue;
    }
    if (field.startsWith('# ')) continue;
    // 無視ファイルは変更として扱わない。
    if (field.startsWith('! ')) continue;

    if (field.startsWith('? ')) {
      summary.files.push({ path: normalizeSep(field.slice(2)), state: 'untracked' });
      continue;
    }
    if (field.startsWith('1 ')) {
      // "1 <xy> <sub> <mH> <mI> <mW> <hH> <hI> <path>"
      const path = pathAfter(field, 8);
      const xy = field.split(' ')[1];
      if (path !== null && xy !== undefined) {
        summary.files.push({ path: normalizeSep(path), state: classifyXy(xy) });
      }
      continue;
    }
    if (field.startsWith('2 ')) {
      // "2 <xy> <sub> <mH> <mI> <mW> <hH> <hI> <Xscore> <path>" + 次レコードが変更前パス。
      const path = pathAfter(field, 9);
      const xy = field.split(' ')[1];
      if (path !== null && xy !== undefined) {
        summary.files.push({ path: normalizeSep(path), state: classifyXy(xy) });
      }
      i += 1;
      continue;
    }
    if (field.startsWith('u ')) {
      // "u <xy> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>"
      const path = pathAfter(field, 10);
      if (path !== null) {
        summary.files.push({ path: normalizeSep(path), state: 'conflicted' });
      }
    }
  }

  return summary;
}

/** Windows の git は `/` を返すが、保険として区切りを揃える。 */
function normalizeSep(path: string): string {
  return path.replace(/\\/g, '/');
}

/** 現在のブランチ・upstream との差・変更ファイル一覧を返す。 */
export async function gitStatus(git: GitRunner): Promise<GitStatusResult> {
  const result = await git.run(['status', '--porcelain=v2', '--branch', '-z']);
  if (!result.ok) return { ok: false, error: reasonOf(result) };
  return { ok: true, ...parseStatusPorcelainV2(result.stdout) };
}

/**
 * HEAD と作業ツリーの差分を unified diff で返す（ステージ済み / 未ステージを合算）。
 *
 * 未追跡ファイルは HEAD に無いので差分が出ない。その場合は untracked:true を返し、
 * 中身は read_document で読んでもらう（合成差分を組み立てるより経路が 1 本で済む）。
 */
export async function gitDiff(git: GitRunner, requestedPath?: string): Promise<GitDiffResult> {
  let target: string | null = null;
  if (requestedPath !== undefined) {
    const safe = safeRelativePath(requestedPath);
    if (!safe.ok) return { ok: false, error: safe.reason };
    target = safe.relative;
  }

  // pathspec は必ず `--` の後ろに置き、`-` で始まる名前でもオプションに化けないようにする。
  const withPath = (args: string[]): string[] => (target === null ? args : [...args, '--', target]);

  const head = await git.run(withPath(['diff', 'HEAD']));
  if (head.ok && head.stdout !== '') {
    return { ok: true, path: target, diff: head.stdout, untracked: false };
  }

  // コミットが 1 つも無いリポジトリでは HEAD が解決できない。その場合は HEAD 無しで見る。
  const plain = await git.run(withPath(['diff']));
  if (plain.ok && plain.stdout !== '') {
    return { ok: true, path: target, diff: plain.stdout, untracked: false };
  }
  if (!head.ok && !plain.ok) {
    return { ok: false, error: reasonOf(plain) };
  }
  if (target === null) {
    return { ok: true, path: null, diff: '', untracked: false };
  }

  // 差分が空。追跡済みなら「変更なし」、そうでなければ未追跡と伝える。
  const tracked = await git.run(['ls-files', '--error-unmatch', '--', target]);
  return { ok: true, path: target, diff: '', untracked: !tracked.ok };
}

/**
 * 変更をステージしてコミットする。
 *
 * - 空メッセージは git を呼ぶ前に断る（空コミットを作らない）。
 * - `--no-verify` は付けない（リポジトリ側の hook を尊重する）。
 * - push はしない。リモートへ出すのは人の操作に残す。
 */
export async function gitCommit(git: GitRunner, input: GitCommitInput): Promise<GitCommitResult> {
  const message = input.message.trim();
  if (message === '') {
    return { ok: false, error: 'コミットメッセージを指定してください' };
  }

  const safePaths: string[] = [];
  for (const path of input.paths ?? []) {
    const safe = safeRelativePath(path);
    if (!safe.ok) return { ok: false, error: safe.reason };
    safePaths.push(safe.relative);
  }

  const staged = await git.run(safePaths.length === 0 ? ['add', '-A'] : ['add', '--', ...safePaths]);
  if (!staged.ok) return { ok: false, error: reasonOf(staged) };

  // message は `-m` の次の位置引数なので、先頭が `-` でもオプション注入にならない。
  // 指定ありのときは commit にも同じパスを渡す。ステージするだけだと、利用者が別に
  // `git add` 済みの変更が同じコミットへ紛れ込む（混ざったことは後から履歴でしか分からない）。
  const commit = ['commit', '-m', message];
  if (safePaths.length > 0) commit.push('--', ...safePaths);
  const committed = await git.run(commit);
  if (!committed.ok) return { ok: false, error: reasonOf(committed) };

  const head = await git.run(['rev-parse', 'HEAD']);
  const status = await git.run(['status', '--porcelain=v2', '--branch', '-z']);
  return {
    ok: true,
    commit: head.ok ? head.stdout.trim() : '',
    ...parseStatusPorcelainV2(status.ok ? status.stdout : ''),
  };
}
