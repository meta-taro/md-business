/**
 * デスクトップアプリを起こして対象ファイルを画面に出す口。
 * -----------------------------------------------------------------------------
 * サーバー自身に画面は無い。アプリが起動していないことも、起動していても別のフォルダを
 * 開いていることもあるので、どの状態からでも同じ 1 手で辿り着けるようにする。
 *
 * 実行ファイルへ対象の絶対パスを渡して起こすだけにしてある。二重起動の抑止と、既に
 * 動いている窓へパスを渡し直す判断はアプリ側が持つ。起動しているかをここで先に当てに
 * いくと、起動直後・終了直後に必ず外れる。
 */
import { spawn as nodeSpawn } from 'node:child_process';
import { join as nodeJoin, win32 } from 'node:path';
import { existsSync } from 'node:fs';
import { safeRelativePath } from './workspacePath.js';

export type DesktopOpenResult = { ok: true; path: string } | { ok: false; error: string };

/** アプリ画面へ対象を出す口（createServer へ渡すとツールが公開される）。 */
export interface DesktopOpener {
  open(relativePath: string): Promise<DesktopOpenResult>;
}

/** 実行ファイルの探索に使う環境。テストから差し替えられるよう全て注入可能にする。 */
export interface ResolveAppPathOptions {
  env: Record<string, string | undefined>;
  platform: NodeJS.Platform;
  exists: (path: string) => boolean;
}

/** 配布時の実行ファイル名（Cargo のパッケージ名がそのまま使われる）。 */
const BINARY = 'md-business-desktop';
/** バンドル名（Windows のインストール先フォルダ名 / macOS の .app 名）。 */
const PRODUCT = 'md-business';

/** 既定のインストール先を OS ごとに並べる（先に見つかったものを使う）。 */
function candidates(env: ResolveAppPathOptions['env'], platform: NodeJS.Platform): string[] {
  const home = env['HOME'] ?? env['USERPROFILE'];
  if (platform === 'win32') {
    const dirs = [env['LOCALAPPDATA'], env['ProgramFiles'], env['ProgramFiles(x86)']];
    return dirs
      .filter((dir): dir is string => dir !== undefined && dir !== '')
      .map((dir) => win32.join(dir, PRODUCT, `${BINARY}.exe`));
  }
  if (platform === 'darwin') {
    // .app の中の実行ファイル名はバンドル名側になることもあるので、どちらも見る。
    const roots = ['/Applications', ...(home === undefined ? [] : [`${home}/Applications`])];
    return roots.flatMap((root) => [
      `${root}/${PRODUCT}.app/Contents/MacOS/${BINARY}`,
      `${root}/${PRODUCT}.app/Contents/MacOS/${PRODUCT}`,
    ]);
  }
  return [
    `/usr/bin/${BINARY}`,
    `/usr/local/bin/${BINARY}`,
    ...(home === undefined ? [] : [`${home}/.local/bin/${BINARY}`]),
  ];
}

/**
 * 実行ファイルの位置を決める。環境変数 `MD_BUSINESS_APP` が最優先。
 *
 * 環境変数の指す先が無いときに諦めず既定の場所へ落ちるのは、古い設定が残っていても
 * 動くようにするため。見つからなければ null を返し、理由は呼び出し側が組み立てる。
 */
export function resolveAppPath(options: ResolveAppPathOptions): string | null {
  const { env, platform, exists } = options;
  const override = env['MD_BUSINESS_APP'];
  if (override !== undefined && override !== '' && exists(override)) return override;
  return candidates(env, platform).find((path) => exists(path)) ?? null;
}

/** createDesktopOpener の設定。既定は実環境（node:fs / node:path / node:child_process）。 */
export interface DesktopOpenerOptions {
  /** 現在のワークスペース root。set-root で変わるので、開くたびに読み直す。 */
  getRoot: () => string;
  env?: Record<string, string | undefined>;
  platform?: NodeJS.Platform;
  exists?: (path: string) => boolean;
  join?: (...parts: string[]) => string;
  spawn?: (command: string, args: string[]) => void;
}

/** アプリを親から切り離して起こす。こちらの終了に巻き込まれないようにする。 */
function detachedSpawn(command: string, args: string[]): void {
  const child = nodeSpawn(command, args, { detached: true, stdio: 'ignore' });
  child.unref();
}

export function createDesktopOpener(options: DesktopOpenerOptions): DesktopOpener {
  const {
    getRoot,
    env = process.env,
    platform = process.platform,
    exists = existsSync,
    join = nodeJoin,
    spawn = detachedSpawn,
  } = options;

  return {
    async open(relativePath: string): Promise<DesktopOpenResult> {
      const safe = safeRelativePath(relativePath);
      if (!safe.ok) return { ok: false, error: safe.reason };

      const app = resolveAppPath({ env, platform, exists });
      if (app === null) {
        return {
          ok: false,
          error:
            'md-business デスクトップアプリの実行ファイルが見つかりませんでした。' +
            'インストール済みであれば、環境変数 MD_BUSINESS_APP に実行ファイルのパスを指定してください。',
        };
      }

      try {
        spawn(app, [join(getRoot(), safe.relative)]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false, error: `アプリの起動に失敗しました: ${message}` };
      }
      return { ok: true, path: safe.relative };
    },
  };
}
