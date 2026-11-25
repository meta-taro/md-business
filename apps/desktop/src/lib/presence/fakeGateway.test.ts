import { describe, expect, it } from 'vitest';
import { createFakeHub } from './fakeGateway';
import type { InkUpdate } from './gateway';

describe('createFakeHub の書き込み', () => {
  it('送った順に、本人以外へ名前を付けて配る（まとめない）', () => {
    const hub = createFakeHub();
    const a = hub.join('A');
    const b = hub.join('B');
    const toA: InkUpdate[] = [];
    const toB: InkUpdate[] = [];
    a.subscribeInk((update) => toA.push(update));
    b.subscribeInk((update) => toB.push(update));
    a.sendInk('a.md', '1', 'R1');
    a.sendInk('a.md', '2', 'R1');
    expect(toA).toEqual([]);
    expect(toB.map((update) => [update.who, update.payload])).toEqual([
      ['A', '1'],
      ['A', '2'],
    ]);
  });
});
