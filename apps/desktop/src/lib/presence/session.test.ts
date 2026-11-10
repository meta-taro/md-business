import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeHub } from './fakeGateway';
import type { PresenceUpdate } from './gateway';
import { FADE_AFTER_MS, REMOVE_AFTER_MS } from './peers';
import { createPresenceSession } from './session';

const md = (line: number) => ({ kind: 'markdown', branch: 'main', line }) as const;
const A = 'github.com/o/r#a.md';
const view = { document: A, room: 'R', branch: 'main' };

describe('createPresenceSession', () => {
  let hub: ReturnType<typeof createFakeHub>;
  let heard: PresenceUpdate[];

  beforeEach(() => {
    vi.useFakeTimers();
    hub = createFakeHub();
    heard = [];
    hub.join('watcher').subscribe((u) => heard.push(u));
  });
  afterEach(() => vi.useRealTimers());

  it('繋がる前の動きは覚えておき、繋がったら送る', () => {
    const session = createPresenceSession('R');
    session.move(A, md(3));
    expect(heard).toEqual([]);
    session.setGateway(hub.join('me'));
    expect(heard).toEqual([{ who: 'me', document: A, place: md(3), room: 'R' }]);
    session.dispose();
  });

  it('指定した部屋へ送る', () => {
    const session = createPresenceSession('R2');
    session.setGateway(hub.join('me'));
    session.move(A, md(1));
    expect(heard.map((u) => u.room)).toEqual(['R2']);
    session.dispose();
  });

  it('相手の居場所を表に載せ、変わるたびに知らせる', () => {
    const session = createPresenceSession('R');
    session.setGateway(hub.join('me'));
    const onChange = vi.fn();
    session.onChange(onChange);
    hub.join('B').send(A, md(5), 'R');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(session.peers(view)).toEqual([{ who: 'B', place: md(5), faded: false, otherBranch: false }]);
    session.dispose();
  });

  it('届かなくなった相手は薄くなり、やがて消える', () => {
    const session = createPresenceSession('R');
    session.setGateway(hub.join('me'));
    const onChange = vi.fn();
    session.onChange(onChange);
    hub.join('B').send(A, md(5), 'R');
    vi.advanceTimersByTime(FADE_AFTER_MS + 5_000);
    expect(session.peers(view)[0]?.faded).toBe(true);
    vi.advanceTimersByTime(REMOVE_AFTER_MS);
    expect(session.peers(view)).toEqual([]);
    expect(onChange.mock.calls.length).toBeGreaterThan(1);
    session.dispose();
  });

  it('切れたら相手の印を消し、繋ぎ直したら今の場所を送り直す', () => {
    const session = createPresenceSession('R');
    session.setGateway(hub.join('me'));
    session.move(A, md(2));
    hub.join('B').send(A, md(5), 'R');
    session.setGateway(null);
    expect(session.peers(view)).toEqual([]);
    heard.length = 0;
    session.setGateway(hub.join('me'));
    expect(heard).toEqual([{ who: 'me', document: A, place: md(2), room: 'R' }]);
    session.dispose();
  });

  it('切れた線の出入口から届いたものは載せない', () => {
    const session = createPresenceSession('R');
    const old = createFakeHub();
    session.setGateway(old.join('me'));
    session.setGateway(hub.join('me'));
    old.join('ghost').send(A, md(1), 'R');
    expect(session.peers(view)).toEqual([]);
    session.dispose();
  });

  it('閉じたら覚えている場所も忘れる', () => {
    const session = createPresenceSession('R');
    session.move(A, md(2));
    session.move(A, null);
    session.setGateway(hub.join('me'));
    expect(heard).toEqual([]);
    session.dispose();
  });

  it('やめるときは閉じたを送り、知らせも止める', () => {
    const session = createPresenceSession('R');
    session.setGateway(hub.join('me'));
    session.move(A, md(2));
    const onChange = vi.fn();
    session.onChange(onChange);
    session.dispose();
    expect(heard.at(-1)).toEqual({ who: 'me', document: A, place: null, room: 'R' });
    hub.join('B').send(A, md(5), 'R');
    vi.advanceTimersByTime(REMOVE_AFTER_MS);
    expect(onChange).not.toHaveBeenCalled();
  });
});
