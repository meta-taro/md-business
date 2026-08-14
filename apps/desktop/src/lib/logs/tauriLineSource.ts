import { invoke } from '@tauri-apps/api/core';
import { createLineSource, type LineChunk, type LineSource } from './lineSource';

/**
 * ワークスペースのルートを固定した行読み取り口を作る。
 *
 * ここは Tauri を呼ぶだけにして、どこまで読んだかを進める処理は `lineSource.ts` に置く
 * （そちらは単体で確かめられる）。
 */
export function createTauriLineSource(root: string): LineSource {
  return createLineSource((relPath, offset, maxLines) =>
    invoke<LineChunk>('read_file_lines', { root, relPath, offset, maxLines }),
  );
}

/** 一覧に出るログ 1 件。 */
export interface LogFile {
  relPath: string;
  name: string;
  ext: string;
  size: number;
}

export interface LogFileList {
  entries: LogFile[];
  /** 上限で打ち切ったか。立っていれば、出ていないログがある。 */
  truncated: boolean;
}

/**
 * ワークスペースにあるログを集める。
 *
 * ログは文書ツリーに出ない（出すとエディタで開けてしまい、開けば全文を読む）ので、
 * 人がファイルを選ぶにはここが要る。
 */
export function scanLogs(root: string): Promise<LogFileList> {
  return invoke<LogFileList>('scan_logs', { root });
}
