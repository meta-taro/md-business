/**
 * 作業ログをワークスペースの中へ残す。
 * -----------------------------------------------------------------------------
 * 今まで entry は `onLog` を通って画面（MCP タブ）へ流れるだけで、どこにも残らなかった。
 * アプリを閉じれば消える。ここは**残す側**で、画面へ流す経路は変えない（足すだけ）。
 *
 * **書けなくてもツールの実行は止めない。** ログが書けないことで業務が止まるのは筋が違う。
 * 例外は全部ここで受け、外へは出さない。
 *
 * ファイルの読み書きは外から受ける（`LogFs`）。素の node のままテストできる形にしておく。
 */
import { logDay, logDayName, encodeLogLine, planRetention } from './logFile.js';
import { parseLogConfig, type LogConfig } from './logConfig.js';
import {
  appendFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { gzipSync } from 'node:zlib';
import type { ToolLogEntry } from './toolLog.js';

/** ログを置くための最小の口。 */
export interface LogFs {
  /** 無ければ null。 */
  readText: (path: string) => string | null;
  ensureDir: (path: string) => void;
  append: (path: string, text: string) => void;
  writeText: (path: string, text: string) => void;
  /** 直下の名前だけ。無ければ空。 */
  list: (path: string) => string[];
  /** 畳んで移す。 */
  archive: (from: string, to: string) => void;
  remove: (path: string) => void;
}

export interface CreateLogSinkOptions {
  /** 今開いているワークスペース。切り替わるので、書くたびに読み直す。 */
  getRoot: () => string;
  fs: LogFs;
  /** 設定が壊れていたときなどの断り。渡さなければ黙る。 */
  warn?: (message: string) => void;
}

/** ワークスペース 1 つ分の、読み直さなくてよい情報。 */
interface Prepared {
  config: LogConfig;
  dir: string;
}

const HOME = '.md-business';
const IGNORE = 'logs/\n';

export function createLogSink(options: CreateLogSinkOptions): (entry: ToolLogEntry) => void {
  const { fs, warn } = options;
  let prepared: Prepared | null = null;
  let preparedRoot: string | null = null;

  function prepare(root: string): Prepared {
    const home = `${root}/${HOME}`;
    const read = parseLogConfig(fs.readText(`${home}/config.json`));
    if (read.problem !== undefined) warn?.(read.problem);
    const ready: Prepared = { config: read.config, dir: `${home}/logs` };
    if (!ready.config.enabled) return ready;

    fs.ensureDir(ready.dir);
    // 設定は Git に乗せ、ログは乗せない。触ったファイルのパスと失敗理由がそのまま
    // 業務文書のリポジトリへ毎回 diff として乗るのは、中身の面でも量の面でも困る。
    if (fs.readText(`${home}/.gitignore`) === null) fs.writeText(`${home}/.gitignore`, IGNORE);
    return ready;
  }

  /** 期限を過ぎた分の始末。ここで転んでも、その日の書き込みまで巻き込まない。 */
  function sweep(ready: Prepared, ts: number): void {
    const plan = planRetention(fs.list(ready.dir), logDay(ts), {
      retentionDays: ready.config.retentionDays,
      onExpire: ready.config.onExpire,
    });
    if (plan.archive.length > 0) fs.ensureDir(`${ready.dir}/archive`);
    for (const name of plan.archive) fs.archive(`${ready.dir}/${name}`, `${ready.dir}/archive/${name}.gz`);
    for (const name of plan.delete) fs.remove(`${ready.dir}/${name}`);
  }

  return (entry: ToolLogEntry): void => {
    try {
      const root = options.getRoot();
      if (prepared === null || preparedRoot !== root) {
        preparedRoot = root;
        prepared = prepare(root);
        if (prepared.config.enabled) {
          try {
            sweep(prepared, entry.ts);
          } catch {
            // 畳めないこと自体は、今日のログを書かない理由にならない。
          }
        }
      }
      if (!prepared.config.enabled) return;
      fs.append(`${prepared.dir}/${logDayName(entry.ts)}`, encodeLogLine(entry));
    } catch {
      // ここから外へは出さない。
    }
  };
}

/** 実際のファイルへ書く口。書き込みは同期で行う（1 行ずつで、量は小さい）。 */
export function nodeLogFs(): LogFs {
  return {
    readText: (path) => {
      try {
        return readFileSync(path, 'utf8');
      } catch {
        return null;
      }
    },
    ensureDir: (path) => mkdirSync(path, { recursive: true }),
    append: (path, text) => appendFileSync(path, text, 'utf8'),
    writeText: (path, text) => writeFileSync(path, text, 'utf8'),
    list: (path) => {
      try {
        return readdirSync(path);
      } catch {
        return [];
      }
    },
    archive: (from, to) => {
      // 先に畳んだものを置いてから消す。逆にすると、途中で落ちたときログが消えるだけになる。
      writeFileSync(to, gzipSync(readFileSync(from)));
      unlinkSync(from);
    },
    remove: (path) => unlinkSync(path),
  };
}
