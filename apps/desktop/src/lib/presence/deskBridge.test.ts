import { describe, expect, it } from 'vitest';
import { connectDesk, type DeskBridge } from './deskBridge';
import type { PresenceGateway, PresenceUpdate } from './gateway';

/** Tauri の invoke / listen の代わり。届いた事象を手で流し込める。 */
function fakeBridge(options: { failWrite?: boolean; connected?: boolean } = {}) {
  const written: string[] = [];
  const handlers = new Map<string, Set<(payload: unknown) => void>>();
  const bridge: DeskBridge = {
    async write(line) {
      if (options.failWrite) throw new Error('割符の机に繋がっていません');
      written.push(line);
    },
    async listen(event, handler) {
      const set = handlers.get(event) ?? new Set();
      set.add(handler);
      handlers.set(event, set);
      return () => set.delete(handler);
    },
    async connected() {
      return options.connected ?? false;
    },
  };
  const emit = (event: string, payload: unknown) => {
    for (const handler of handlers.get(event) ?? []) handler(payload);
  };
  const listening = () => [...handlers.values()].reduce((n, s) => n + s.size, 0);
  return { bridge, written, emit, listening };
}

const heard = JSON.stringify({ 型: '居場所', 誰: 'B', 文書: 'a.md', 場所: '', room: 'R' });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('connectDesk', () => {
  it('繋がるまで出入口を渡さない', async () => {
    const { bridge, written } = fakeBridge();
    const gateways: (PresenceGateway | null)[] = [];
    await connectDesk(bridge, (g) => gateways.push(g));
    expect(gateways).toEqual([]);
    expect(written).toEqual([]);
  });

  it('繋がったら居場所を聞いてから出入口を渡す', async () => {
    const { bridge, written, emit } = fakeBridge();
    const gateways: (PresenceGateway | null)[] = [];
    await connectDesk(bridge, (g) => gateways.push(g));
    emit('desk-connected', true);
    await flush();
    expect(gateways).toHaveLength(1);
    expect(written.map((l) => JSON.parse(l).型)).toEqual(['listen', '居場所を聞く']);
  });

  it('受け取りを始める前に繋がっていた線も拾う', async () => {
    const { bridge, written } = fakeBridge({ connected: true });
    const gateways: (PresenceGateway | null)[] = [];
    await connectDesk(bridge, (g) => gateways.push(g));
    await flush();
    expect(gateways).toHaveLength(1);
    expect(gateways[0]).not.toBeNull();
    expect(written.map((l) => JSON.parse(l).型)).toEqual(['listen', '居場所を聞く']);
  });

  it('聞いている間に繋がった知らせが来ても出入口を二重に作らない', async () => {
    const { bridge, emit } = fakeBridge({ connected: true });
    const gateways: (PresenceGateway | null)[] = [];
    const ask = bridge.connected.bind(bridge);
    bridge.connected = async () => {
      emit('desk-connected', true);
      return ask();
    };
    await connectDesk(bridge, (g) => gateways.push(g));
    await flush();
    expect(gateways).toHaveLength(1);
  });

  it('聞いている間に切れたら、古い返事で出入口を作らない', async () => {
    const { bridge, emit } = fakeBridge({ connected: true });
    const gateways: (PresenceGateway | null)[] = [];
    const ask = bridge.connected.bind(bridge);
    bridge.connected = async () => {
      const answer = await ask();
      emit('desk-connected', false);
      return answer;
    };
    await connectDesk(bridge, (g) => gateways.push(g));
    await flush();
    expect(gateways).toEqual([null]);
  });

  it('届いた行を居場所として渡す', async () => {
    const { bridge, emit } = fakeBridge();
    const updates: PresenceUpdate[] = [];
    await connectDesk(bridge, (g) => g?.subscribe((u) => updates.push(u)));
    emit('desk-connected', true);
    emit('desk-line', heard);
    emit('desk-line', 42);
    expect(updates).toEqual([{ who: 'B', document: 'a.md', place: null, room: 'R' }]);
  });

  it('切れたら null を渡し、繋ぎ直したら聞き直す', async () => {
    const { bridge, written, emit } = fakeBridge();
    const gateways: (PresenceGateway | null)[] = [];
    await connectDesk(bridge, (g) => gateways.push(g));
    emit('desk-connected', true);
    emit('desk-connected', false);
    emit('desk-connected', true);
    await flush();
    expect(gateways.map((g) => g === null)).toEqual([false, true, false]);
    expect(written.filter((l) => l.includes('居場所を聞く'))).toHaveLength(2);
  });

  it('切れた後の出入口には古い線の行を流さない', async () => {
    const { bridge, emit } = fakeBridge();
    const updates: PresenceUpdate[] = [];
    const gateways: (PresenceGateway | null)[] = [];
    await connectDesk(bridge, (g) => gateways.push(g));
    emit('desk-connected', true);
    gateways[0]?.subscribe((u) => updates.push(u));
    emit('desk-connected', false);
    emit('desk-line', heard);
    expect(updates).toEqual([]);
  });

  it('送れなかったことで止まらない', async () => {
    const { bridge, emit } = fakeBridge({ failWrite: true });
    const gateways: (PresenceGateway | null)[] = [];
    await connectDesk(bridge, (g) => gateways.push(g));
    emit('desk-connected', true);
    gateways[0]?.send('a.md', null, 'R');
    await flush();
    expect(gateways).toHaveLength(1);
  });

  it('やめると受け取りをすべて外す', async () => {
    const { bridge, listening } = fakeBridge();
    const stop = await connectDesk(bridge, () => {});
    expect(listening()).toBeGreaterThan(0);
    stop();
    expect(listening()).toBe(0);
  });
});
