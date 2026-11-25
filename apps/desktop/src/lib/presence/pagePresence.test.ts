import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeHub } from './fakeGateway';
import type { InkUpdate, PresenceGateway, PresenceUpdate } from './gateway';
import { createInkSender } from './inkShare';
import { createPagePresence } from './pagePresence';

const md = (line: number) => ({ kind: 'markdown', branch: 'main', line }) as const;
const A = 'github.com/o/r#a.md';
const B = 'github.com/o/r#b.md';
const R1 = 'R1AAAAAAAAAAAAAAAAAAAAAAAA';
const R2 = 'R2AAAAAAAAAAAAAAAAAAAAAAAA';

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

  async function start() {
    const presence = createPagePresence(connect);
    await Promise.resolve();
    onGateway(hub.join('me'));
    return presence;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    hub = createFakeHub();
    hub.setRooms([
      { id: R1, name: '開発', members: 2 },
      { id: R2, name: null, members: 1 },
    ]);
    heard = [];
    other = hub.join('other');
    other.subscribe((u) => heard.push(u));
    stop.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it('部屋を選ぶまでは何も送らない', async () => {
    const presence = await start();
    presence.open(A);
    presence.moveTo(md(2));
    expect(presence.room()).toBeNull();
    expect(heard).toEqual([]);
    presence.dispose();
  });

  it('選んだ部屋へ今いる場所を送る（選ぶ前に動いた場所も送る）', async () => {
    const presence = await start();
    presence.open(A);
    presence.moveTo(md(2));
    presence.setRoom(R1);
    vi.advanceTimersByTime(300);
    presence.moveTo(md(3));
    expect(heard).toEqual([
      { who: 'me', document: A, place: md(2), room: R1 },
      { who: 'me', document: A, place: md(3), room: R1 },
    ]);
    presence.dispose();
  });

  it('文書を替えたら、前の文書を閉じたと送る', async () => {
    const presence = await start();
    presence.setRoom(R1);
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

  it('部屋を替えたら前の部屋で閉じ、新しい部屋へ今の場所を送る', async () => {
    const presence = await start();
    presence.setRoom(R1);
    presence.open(A);
    presence.moveTo(md(1));
    presence.setRoom(R2);
    expect(heard.map((u) => [u.room, u.place])).toEqual([
      [R1, md(1)],
      [R1, null],
      [R2, md(1)],
    ]);
    presence.setRoom(null);
    expect(heard.at(-1)).toEqual({ who: 'me', document: A, place: null, room: R2 });
    presence.moveTo(md(9));
    expect(heard).toHaveLength(4);
    presence.dispose();
  });

  it('名前を付けられない文書では何も送らない', async () => {
    const presence = await start();
    presence.setRoom(R1);
    presence.open(null);
    presence.moveTo(md(1));
    expect(heard).toEqual([]);
    presence.dispose();
  });

  it('送れない場所（null）は送らずに、前の場所を残す', async () => {
    const presence = await start();
    presence.setRoom(R1);
    presence.open(A);
    presence.moveTo(md(1));
    presence.moveTo(null);
    expect(heard).toHaveLength(1);
    presence.dispose();
  });

  it('同じ文書・選んだ部屋の相手だけを返し、変わったら知らせる', async () => {
    const presence = await start();
    const changed = vi.fn();
    presence.onChange(changed);
    presence.setRoom(R1);
    presence.open(A);
    other.send(A, md(4), R1);
    other.send(A, md(4), R2);
    expect(changed).toHaveBeenCalled();
    expect(presence.peers('main').map((p) => p.who)).toEqual(['other']);
    presence.dispose();
  });

  it('繋がったら部屋の一覧を聞き、届いた一覧を見せる', async () => {
    const presence = await start();
    expect(presence.rooms().map((r) => r.id)).toEqual([R1, R2]);
    presence.dispose();
  });

  it('選んでいた部屋が一覧から消えたら、共有をやめる', async () => {
    const presence = await start();
    presence.setRoom(R2);
    hub.setRooms([{ id: R1, name: '開発', members: 2 }]);
    expect(presence.room()).toBeNull();
    presence.dispose();
  });

  it('机に断られたら理由を見せ、部屋を選び直したら消す', async () => {
    const presence = await start();
    presence.setRoom(R1);
    hub.deny('me', 'その部屋に居ません');
    expect(presence.denied()).toBe('その部屋に居ません');
    presence.setRoom(R2);
    expect(presence.denied()).toBeNull();
    presence.dispose();
  });

  it('文書を開いていなければ相手は空', async () => {
    const presence = await start();
    presence.setRoom(R1);
    expect(presence.peers('main')).toEqual([]);
    presence.dispose();
  });

  describe('書き込み', () => {
    const stroke = (points: number[]) => ({ tool: 'pen', color: '#222222', width: 0.004, points }) as const;
    let inks: InkUpdate[];
    beforeEach(() => {
      inks = [];
      other.subscribeInk((u) => inks.push(u));
    });

    it('部屋を選ぶまでは送らず、選んだら今の部屋・文書へ送る', async () => {
      const presence = await start();
      presence.open(A);
      presence.ink.update('s1', 'p.1', stroke([0.1, 0.1]));
      expect(inks).toEqual([]);
      presence.setRoom(R1);
      presence.ink.update('s1', 'p.1', stroke([0.1, 0.1, 0.2, 0.2]));
      expect(inks.map((u) => [u.document, u.room])).toEqual([[A, R1]]);
      expect(JSON.parse(inks[0]!.payload)).toMatchObject({ t: 'begin', id: 's1', p: [0.1, 0.1, 0.2, 0.2] });
      presence.dispose();
    });

    it('同じ部屋・文書の相手の線だけを重ね、届いたら知らせる', async () => {
      const presence = await start();
      presence.open(A);
      presence.setRoom(R1);
      const changed = vi.fn();
      presence.onInk(changed);
      const theirs = createInkSender((payload) => other.sendInk(A, payload, R1));
      theirs.update('t1', 'p.1', stroke([0.5, 0.5]));
      createInkSender((payload) => other.sendInk(B, payload, R1)).update('t2', 'p.1', stroke([0.3, 0.3]));
      createInkSender((payload) => other.sendInk(A, payload, R2)).update('t3', 'p.1', stroke([0.4, 0.4]));
      expect(presence.peerStrokes('p.1')).toEqual([{ who: 'other', stroke: stroke([0.5, 0.5]) }]);
      expect(presence.peerStrokes('p.2')).toEqual([]);
      expect(changed).toHaveBeenCalledTimes(1);
      presence.dispose();
    });

    it('文書や部屋を替えたら、自分の線を消すよう知らせて、相手の線を捨てる', async () => {
      const presence = await start();
      presence.open(A);
      presence.setRoom(R1);
      presence.ink.update('s1', 'p.1', stroke([0.1, 0.1]));
      createInkSender((payload) => other.sendInk(A, payload, R1)).update('t1', 'p.1', stroke([0.5, 0.5]));
      presence.setRoom(R2);
      expect(JSON.parse(inks.at(-1)!.payload)).toEqual({ t: 'clear' });
      expect(inks.at(-1)!.room).toBe(R1);
      expect(presence.peerStrokes('p.1')).toEqual([]);
      // 新しい部屋では書き始めから送り直す
      presence.ink.update('s1', 'p.1', stroke([0.1, 0.1, 0.2, 0.2]));
      expect(JSON.parse(inks.at(-1)!.payload)).toMatchObject({ t: 'begin', id: 's1' });
      expect(inks.at(-1)!.room).toBe(R2);
      presence.dispose();
    });

    it('何も書いていなければ、替えても消す知らせを送らない', async () => {
      const presence = await start();
      presence.open(A);
      presence.setRoom(R1);
      presence.open(B);
      expect(inks).toEqual([]);
      presence.dispose();
    });

    it('相手が文書を閉じたら、その相手の線を捨てる', async () => {
      const presence = await start();
      presence.open(A);
      presence.setRoom(R1);
      createInkSender((payload) => other.sendInk(A, payload, R1)).update('t1', 'p.1', stroke([0.5, 0.5]));
      other.send(A, null, R1);
      expect(presence.peerStrokes('p.1')).toEqual([]);
      presence.dispose();
    });
  });

  it('片付けると線もやめる（繋がる前に片付けても後でやめる）', async () => {
    const presence = createPagePresence(connect);
    presence.dispose();
    await Promise.resolve();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
