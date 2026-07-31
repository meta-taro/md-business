/**
 * GitRunner の本番実装 — `git` を子プロセスとして実行する。
 * -----------------------------------------------------------------------------
 * シェルは介さず引数配列のまま渡す（クオート解釈が入らないので、空白や記号を含む
 * パスでも壊れない・シェル注入の余地も無い）。git が入っていない環境や非リポジトリでも
 * 例外は投げず ok:false として返し、ツール側が理由を提示する。
 */
import { execFile } from 'node:child_process';
import type { GitRunner, GitRunResult } from './gitTools.js';

/** 応答が返らない git を待ち続けないための上限。 */
const TIMEOUT_MS = 15_000;
/** 差分は大きくなりうるが、青天井に読み込まない。 */
const MAX_BUFFER = 8 * 1024 * 1024;

/** 実際に子プロセスを起動する部分（テストで差し替えられるよう分けてある）。 */
export type GitExec = (args: string[]) => Promise<GitRunResult>;

/** `git -C <root> --no-optional-locks <args...>` の引数列を組む。 */
export function buildGitArgs(root: string, args: string[]): string[] {
  // --no-optional-locks: index.lock を作らない＝アプリや人の git 操作と競合しない。
  return ['-C', root, '--no-optional-locks', ...args];
}

const defaultExec: GitExec = (args) =>
  new Promise((resolve) => {
    execFile(
      'git',
      args,
      { encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          // git 未導入（spawn 失敗）も非 0 終了も、呼び出し側からは同じ「失敗」で足りる。
          resolve({ ok: false, stdout, stderr: stderr || error.message });
          return;
        }
        resolve({ ok: true, stdout, stderr });
      },
    );
  });

/**
 * ワークスペース root を都度読み直す GitRunner を作る。
 * root は set-root で切り替わるため、生成時の値を固定しない。
 */
export function createGitRunner(getRoot: () => string, exec: GitExec = defaultExec): GitRunner {
  return {
    run: (args) => exec(buildGitArgs(getRoot(), args)),
  };
}
