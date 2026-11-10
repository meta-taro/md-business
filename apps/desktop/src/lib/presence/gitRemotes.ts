/** 開いたフォルダの git の置き先。読めない（git でない・git が無い）ときは空。 */

import { invoke } from '@tauri-apps/api/core';
import type { GitRemote } from './documentName';

export function loadRemotes(root: string): Promise<GitRemote[]> {
  return invoke<GitRemote[]>('git_remote_urls', { root }).catch(() => []);
}
