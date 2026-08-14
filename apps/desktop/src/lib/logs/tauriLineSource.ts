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
