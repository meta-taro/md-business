// ファイル情報（右クリック →「ファイル情報」）の表示用純ロジック。
// 値そのものは Rust 側（file_stat / file_digest / git_file_state）が測って返す。
// ここは測った値の見せ方だけを決める。DOM に依存しないので単体テストできる。
import type { MessageKey } from '$lib/i18n/messages';
import type { Locale } from '$lib/i18n/locales';

/** 文字コード。BOM と UTF-8 妥当性で判定できるものだけを持ち、推測はしない。 */
export type FileEncoding = 'utf8' | 'utf8Bom' | 'utf16Le' | 'utf16Be' | 'unknown';

/** 改行コード。2 種類以上混ざっていれば mixed、改行が 1 つも無ければ none。 */
export type LineEnding = 'lf' | 'crlf' | 'cr' | 'mixed' | 'none';

/** Git から見たファイルの状態。リポジトリでない・git が無い場合は notRepo。 */
export type GitState =
  | 'notRepo'
  | 'ignored'
  | 'untracked'
  | 'tracked'
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'conflicted';

/** すぐ返る情報（メタデータだけ・ファイル本体は読まない）。 */
export interface FileStat {
  size: number;
  /** 更新日時（UNIX epoch ミリ秒）。ファイルシステムから取れなければ null。 */
  modifiedMs: number | null;
}

/** ファイル全体を 1 度読んで測る情報（大きいファイルでは時間がかかる）。 */
export interface FileDigest {
  sha256: string;
  /** 行数。UTF-8 として読めないファイルは数えない（null）。 */
  lineCount: number | null;
  encoding: FileEncoding;
  /** 改行コード。文字コードが判定できないファイルでは null。 */
  lineEnding: LineEnding | null;
}

const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/**
 * 容量を単位付きで表す。1KB 未満はバイトのまま、以降は小数 1 桁。
 * 丸めた結果が 1024 に達したら次の単位へ繰り上げる（"1024.0 KB" を出さない）。
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  let rounded = Math.round(value * 10) / 10;
  if (rounded >= 1024 && unit < SIZE_UNITS.length - 1) {
    rounded /= 1024;
    unit += 1;
  }
  return `${rounded.toFixed(1)} ${SIZE_UNITS[unit]}`;
}

/** 正確なバイト数を 3 桁区切りで返す（単位付き表示に併記する用）。 */
export function formatByteCount(bytes: number): string {
  // 区切りは表示ロケールに関わらず "," で固定（数値の桁を読むための併記なので揺らさない）。
  return bytes.toLocaleString('en-US');
}

/** 更新日時を表示ロケールの書式へ。取れていなければ null（呼び出し側が「判定できません」を出す）。 */
export function formatModified(ms: number | null, locale: Locale): string | null {
  if (ms === null || !Number.isFinite(ms)) return null;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'medium' }).format(
    new Date(ms),
  );
}

export const ENCODING_LABEL_KEYS: Record<FileEncoding, MessageKey> = {
  utf8: 'fileInfo.encUtf8',
  utf8Bom: 'fileInfo.encUtf8Bom',
  utf16Le: 'fileInfo.encUtf16Le',
  utf16Be: 'fileInfo.encUtf16Be',
  unknown: 'fileInfo.encUnknown',
};

export const LINE_ENDING_LABEL_KEYS: Record<LineEnding, MessageKey> = {
  lf: 'fileInfo.eolLf',
  crlf: 'fileInfo.eolCrlf',
  cr: 'fileInfo.eolCr',
  mixed: 'fileInfo.eolMixed',
  none: 'fileInfo.eolNone',
};

export const GIT_STATE_LABEL_KEYS: Record<GitState, MessageKey> = {
  notRepo: 'fileInfo.gitNotRepo',
  ignored: 'fileInfo.gitIgnored',
  untracked: 'fileInfo.gitUntracked',
  tracked: 'fileInfo.gitTracked',
  modified: 'fileInfo.gitModified',
  added: 'fileInfo.gitAdded',
  deleted: 'fileInfo.gitDeleted',
  renamed: 'fileInfo.gitRenamed',
  conflicted: 'fileInfo.gitConflicted',
};
