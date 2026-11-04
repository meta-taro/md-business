import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeHub } from './fakeGateway';
import type { PresenceUpdate } from './gateway';
import { applyUpdate, visiblePeers, type PeerTable } from './peers';
import { createPresenceSender } from './sender';

const md = (line: number) => ({ kind: 'markdown', branch: 'main', line }) as const;
const A = 'github.com/o/r#a.md';
const B = 'github.com/o/r#b.tsv';

describe('createPresenceSender', () => {
  let received: PresenceUpdate[];
  let hub: ReturnType<typeof createFakeHub>;

  beforeEach(() => {
    vi.useFakeTimers();
    received = [];
    hub = createFakeHub();
    hub.join('watcher').subscribe((update) => received.push(update));
  });
  afterEach(() => vi.useRealTimers());

  it('sends a move at once and skips repeats of the same place', () => {
    const sender = createPresenceSender(hub.join('me'), 'R');
    sender.move(A, md(1));
    sender.move(A, md(1));
    sender.move(A, md(2));
    expect(received.map((u) => u.place)).toEqual([md(1), md(2)]);
    sender.dispose();
  });

  it('resends the current place every 15 s so peers can tell a crash from silence', () => {
    const sender = createPresenceSender(hub.join('me'), 'R');
    sender.move(A, md(3));
    vi.advanceTimersByTime(14_999);
    expect(received).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(received).toHaveLength(2);
    expect(received[1]).toEqual({ who: 'me', document: A, place: md(3), room: 'R' });
    sender.dispose();
  });

  it('closes the old document when moving to another one', () => {
    const sender = createPresenceSender(hub.join('me'), 'R');
    sender.move(A, md(1));
    sender.move(B, { kind: 'tsv', branch: 'main', rowId: 'r1', column: '項目' });
    expect(received.map((u) => [u.document, u.place === null])).toEqual([
      [A, false],
      [A, true],
      [B, false],
    ]);
    sender.dispose();
  });

  it('closes on dispose and stops resending', () => {
    const sender = createPresenceSender(hub.join('me'), 'R');
    sender.move(A, md(1));
    sender.dispose();
    vi.advanceTimersByTime(60_000);
    expect(received.map((u) => u.place)).toEqual([md(1), null]);
  });

  it('does not resend after closing', () => {
    const sender = createPresenceSender(hub.join('me'), 'R');
    sender.move(A, md(1));
    sender.move(A, null);
    vi.advanceTimersByTime(60_000);
    expect(received).toHaveLength(2);
    sender.dispose();
    expect(received).toHaveLength(2);
  });

  it('lets two peers show up on the same document through the fake hub', () => {
    let table: PeerTable = new Map();
    hub.join('viewer').subscribe((update) => {
      table = applyUpdate(table, update, Date.now());
    });
    const alice = createPresenceSender(hub.join('alice'), 'R');
    const bob = createPresenceSender(hub.join('bob'), 'R');
    alice.move(A, md(4));
    bob.move(A, md(10));
    expect(visiblePeers(table, { document: A, room: 'R', branch: 'main' }, Date.now()).map((p) => [p.who, p.place])).toEqual([
      ['alice', md(4)],
      ['bob', md(10)],
    ]);
    alice.dispose();
    bob.dispose();
  });
});
