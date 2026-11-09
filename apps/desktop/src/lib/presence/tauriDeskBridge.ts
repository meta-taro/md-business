/** DeskBridge を Tauri の invoke / listen で満たす（本体の desk_write / desk-line / desk-connected）。 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { DeskBridge } from './deskBridge';

export const tauriDeskBridge: DeskBridge = {
  async write(line) {
    await invoke('desk_write', { line });
  },
  listen(event, handler) {
    return listen<unknown>(event, (e) => handler(e.payload));
  },
};
