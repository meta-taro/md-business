/** DeskBridge を Tauri の invoke / listen で満たす（本体の desk_write / desk_connected / desk_machine / desk-line / desk-connected）。 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { DeskBridge } from './deskBridge';

export const tauriDeskBridge: DeskBridge = {
  async write(line) {
    await invoke('desk_write', { line });
  },
  connected() {
    return invoke<boolean>('desk_connected');
  },
  machine() {
    return invoke<string | null>('desk_machine');
  },
  listen(event, handler) {
    return listen<unknown>(event, (e) => handler(e.payload));
  },
};
