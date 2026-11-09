/**
 * アプリ本体（Rust）が張る割符の机への線を、居場所の出入口として画面へ渡す。
 *
 * 線は本体側で切れては繋ぎ直されるので、繋がるたびに出入口を作り直して渡し
 * （聞く宣言は線ごとに要る）、切れたら null を渡す。前の線の出入口には行を流さない。
 * Tauri の口は DeskBridge として受け取り、ここ自体は Tauri に依存しない。
 */

import { createDeskGateway } from './deskGateway';
import type { PresenceGateway } from './gateway';

/** 本体との口。write は届かなければ失敗する。listen は受け取りをやめる関数を返す。 */
export interface DeskBridge {
  write(line: string): Promise<void>;
  listen(event: string, handler: (payload: unknown) => void): Promise<() => void>;
}

/** 線の出入口の移り変わりを onGateway へ渡し続ける。戻り値でやめる。 */
export async function connectDesk(
  bridge: DeskBridge,
  onGateway: (gateway: PresenceGateway | null) => void,
): Promise<() => void> {
  // いま繋がっている線の受け手。切れたら空にして、古い出入口へ行が流れないようにする。
  let lineListeners = new Set<(line: string) => void>();

  const unlistenLine = await bridge.listen('desk-line', (payload) => {
    if (typeof payload !== 'string') return;
    for (const listener of lineListeners) listener(payload);
  });
  const unlistenConnected = await bridge.listen('desk-connected', (payload) => {
    lineListeners = new Set();
    if (payload !== true) {
      onGateway(null);
      return;
    }
    const listeners = lineListeners;
    onGateway(
      createDeskGateway({
        // 送れなかった居場所は溜めない。次の送り直しか、繋ぎ直しで追いつく。
        write: (line) => void bridge.write(line).catch(() => {}),
        onLine(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      }),
    );
  });

  return () => {
    unlistenLine();
    unlistenConnected();
    lineListeners = new Set();
  };
}
