import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeHub } from './fakeGateway';
import type { PresenceGateway, PresenceUpdate } from './gateway';
import { createPagePresence, roomOf } from './pagePresence';

const md = (line: number) => ({ kind: 'markdown', branch: 'main', line }) as const;
const A = 'github.com/o/r#a.md';
const B = 'github.com/o/r#b.md';

describe('roomOf', () => {
  it('文書の名前のリポ部分を部屋にする', () => {
    expect(roomOf(A)).toBe('github.com/o/r');
  });

  it('名前が無ければ部屋も無い', () => {
    expect(roomOf(null)).toBeNull();
  });
});

describe('createPagePresence', () => {
  let hub: ReturnType<typeof createFakeHub>;
  let heard: PresenceUpdate[];
  let other: PresenceGateway;
  let onGateway: (gateway: PresenceGateway | null) => void;
  const stop = vi.fn();
  const connect = (listener: (gateway: PresenceGateway | null) => void) => {
    onGateway = listener;
    return Promise.resolve(stop);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    hub = createFakeHub();
    heard = [];
    other = hub.join('other');
    other.subscribe((u) => heard.push(u));
    stop.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it('開いた文書のリポを部屋にして、今いる場所を送る', async () => {
    const presence = createPagePresence(connect);
    await Promise.resolve();
    onGateway(hub.join('me'));
    presence.open(A);
    presence.moveTo(md(2));
    expect(heard).toEqual([{ who: 'me', document: A, place: md(2), room: 'github.com/o/r' }]);
    presence.dispose();
  });

  it('文書を替えたら、前の文書を閉じたと送る', async () => {
    const presence = createPagePresence(connect);
    await Promise.resolve();
    onGateway(hub.join('me'));
    presence.open(A);
    presence.moveTo(md(1));
    presence.open(B);
    presence.moveTo(md(5));
    expect(heard.map((u) => [u.document, u.place])).toEqual([
      [A, md(1)],
      [A, null],
      [B, md(5)],
    ]);
    presence.dispose();
  });

  it('名前を付けられない文書では何も送らない', async () => {
    const presence = createPagePresence(connect);
    await Promise.resolve();
    onGateway(hub.join('me'));
    presence.open(null);
    presence.moveTo(md(1));
    expect(heard).toEqual([]);
    presence.dispose();
  });

  it('送れない場所（null）は送らずに、前の場所を残す', async () => {
    const presence = createPagePresence(connect);
    await Promise.resolve();
    onGateway(hub.join('me'));
    presence.open(A);
    presence.moveTo(md(1));
    presence.moveTo(null);
    expect(heard).toHaveLength(1);
    presence.dispose();
  });

  it('同じ文書・同じ部屋の相手だけを返し、変わったら知らせる', async () => {
    const presence = createPagePresence(connect);
    await Promise.resolve();
    onGateway(hub.join('me'));
    const changed = vi.fn();
    presence.onChange(changed);
    presence.open(A);
    other.send(A, md(4), 'github.com/o/r');
    other.send(A, md(4), 'github.com/x/y');
    expect(changed).toHaveBeenCalled();
    expect(presence.peers('main').map((p) => p.who)).toEqual(['other']);
    presence.dispose();
  });

  it('リポが替わっても、繋がっている線をそのまま使う', async () => {
    const presence = createPagePresence(connect);
    await Promise.resolve();
    onGateway(hub.join('me'));
    presence.open(A);
    presence.open('gitlab.com/p/q#c.md');
    presence.moveTo(md(1));
    expect(heard.at(-1)).toEqual({ who: 'me', document: 'gitlab.com/p/q#c.md', place: md(1), room: 'gitlab.com/p/q' });
    other.send('gitlab.com/p/q#c.md', md(2), 'gitlab.com/p/q');
    expect(presence.peers('main').map((p) => p.who)).toEqual(['other']);
    presence.dispose();
  });

  it('文書を開いていなければ相手は空', async () => {
    const presence = createPagePresence(connect);
    await Promise.resolve();
    expect(presence.peers('main')).toEqual([]);
    presence.dispose();
  });

  it('片付けると線もやめる（繋がる前に片付けても後でやめる）', async () => {
    const presence = createPagePresence(connect);
    presence.dispose();
    await Promise.resolve();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
