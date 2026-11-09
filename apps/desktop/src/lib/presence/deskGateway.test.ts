import { describe, expect, it } from 'vitest';
import { createDeskGateway, type DeskTransport } from './deskGateway';
import { SUBSCRIBE_LINE } from './deskLine';
import type { PresenceUpdate } from './gateway';

function fakeTransport() {
  const written: string[] = [];
  const listeners = new Set<(line: string) => void>();
  const transport: DeskTransport = {
    write: (line) => written.push(line),
    onLine(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const deliver = (line: string) => {
    for (const listener of listeners) listener(line);
  };
  return { transport, written, deliver, listenerCount: () => listeners.size };
}

describe('createDeskGateway', () => {
  it('繋いだら最初に相手の居場所を聞く', () => {
    const t = fakeTransport();
    createDeskGateway(t.transport);
    expect(t.written).toEqual([SUBSCRIBE_LINE]);
  });

  it('自分の居場所を 1 行にして机へ書く', () => {
    const t = fakeTransport();
    const gateway = createDeskGateway(t.transport);
    gateway.send('a.md', { kind: 'markdown', branch: 'main', line: 3 }, 'ROOM');
    expect(JSON.parse(t.written[1])).toEqual({
      型: '居場所',
      文書: 'a.md',
      場所: '{"branch":"main","line":3}',
      room: 'ROOM',
    });
  });

  it('送れない形は書かない', () => {
    const t = fakeTransport();
    const gateway = createDeskGateway(t.transport);
    gateway.send('', null, 'ROOM');
    gateway.send('a.md', null, '');
    expect(t.written).toEqual([SUBSCRIBE_LINE]);
  });

  it('机から届いた居場所を受け手へ渡し、それ以外の行は渡さない', () => {
    const t = fakeTransport();
    const gateway = createDeskGateway(t.transport);
    const got: PresenceUpdate[] = [];
    gateway.subscribe((update) => got.push(update));
    t.deliver(JSON.stringify({ 型: 'heard', id: 1, from: 'B', body: 'x', at: '10:00' }));
    t.deliver(JSON.stringify({ 型: '居場所', 誰: 'B', 文書: 'a.md', 場所: '', room: 'ROOM' }));
    expect(got).toEqual([{ who: 'B', document: 'a.md', place: null, room: 'ROOM' }]);
  });

  it('受け取りをやめたら机の行も聞かなくなる', () => {
    const t = fakeTransport();
    const gateway = createDeskGateway(t.transport);
    const got: PresenceUpdate[] = [];
    const stop = gateway.subscribe((update) => got.push(update));
    stop();
    t.deliver(JSON.stringify({ 型: '居場所', 誰: 'B', 文書: 'a.md', 場所: '', room: 'ROOM' }));
    expect(got).toEqual([]);
    expect(t.listenerCount()).toBe(0);
  });
});
