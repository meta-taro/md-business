/**
 * 開いているフォルダからの読み取りを Tauri 側に繋ぐ。
 *
 * 仕上げ（composeSource）は読み取りの中身を知らない純関数なので、その口だけをここで作る。
 * 書き出し口が増えても、この 1 つを渡せば同じ読み方になる。
 */
import { invoke } from '@tauri-apps/api/core';
import type { ComposeSourceIo } from './composeSource';

export function workspaceIo(root: string): ComposeSourceIo {
  return {
    readImage: async (relPath) => {
      const image = await invoke<{ dataUrl: string }>('read_image', { root, relPath });
      return image.dataUrl;
    },
    readText: (relPath) => invoke<string>('read_document', { root, relPath }),
  };
}
