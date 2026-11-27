import { describe, expect, it } from 'vitest';
import type { InkStroke } from '../preview/inkModel';
import {
  createInkSender,
  createPeerInk,
  decodeInkPayload,
  INK_SEND_INTERVAL_MS,
  MAX_INK_PAYLOAD_BYTES,
  paceInkSender,
  type InkClock,
} from './inkShare';

const pen = (points: number[]): InkStroke => ({ tool: 'pen', color: '#d33333', width: 0.004, points });

function collect() {
  const sent: string[] = [];
  return { sent, sender: createInkSender((payload) => sent.push(payload)) };
}

describe('createInkSender', () => {
  it('書き始めに線の形と最初の点を送る', () => {
    const { sent, sender } = collect();
    sender.update('a1', '3', pen([0.1, 0.2]));
    expect(sent).toHaveLength(1);
    expect(decodeInkPayload(sent[0]!)).toEqual({
      t: 'begin',
      id: 'a1',
      sheet: '3',
      tool: 'pen',
      color: '#d33333',
      width: 0.004,
      points: [0.1, 0.2],
    });
  });

  it('同じ線へ足した点だけを送る', () => {
    const { sent, sender } = collect();
    sender.update('a1', '3', pen([0.1, 0.2]));
    sender.update('a1', '3', pen([0.1, 0.2, 0.3, 0.4]));
    sender.update('a1', '3', pen([0.1, 0.2, 0.3, 0.4]));
    expect(sent).toHaveLength(2);
    expect(decodeInkPayload(sent[1]!)).toEqual({ t: 'more', id: 'a1', points: [0.3, 0.4] });
  });

  it('長い線は上限に収まるよう分けて送り、どの荷も上限を超えない', () => {
    const { sent, sender } = collect();
    const points = Array.from({ length: 2000 }, (_, i) => (i % 997) / 997 + 0.00001);
    sender.update('a1', '#1', pen(points));
    expect(sent.length).toBeGreaterThan(1);
    for (const payload of sent) {
      expect(new TextEncoder().encode(payload).length).toBeLessThanOrEqual(MAX_INK_PAYLOAD_BYTES);
    }
    const peers = createPeerInk();
    for (const payload of sent) peers.apply('B', payload);
    expect(peers.strokes('#1')[0]!.stroke.points).toHaveLength(2000);
  });

  it('消した線と、全部消したことを送る', () => {
    const { sent, sender } = collect();
    sender.update('a1', '3', pen([0.1, 0.2]));
    sender.remove('a1');
    sender.clear();
    expect(sent.slice(1).map((p) => decodeInkPayload(p))).toEqual([{ t: 'remove', id: 'a1' }, { t: 'clear' }]);
  });

  it('消した後に同じ id で書き直すと、書き始めから送る', () => {
    const { sent, sender } = collect();
    sender.update('a1', '3', pen([0.1, 0.2]));
    sender.remove('a1');
    sender.update('a1', '3', pen([0.5, 0.5]));
    expect(decodeInkPayload(sent[2]!)?.t).toBe('begin');
  });
});

describe('decodeInkPayload', () => {
  it.each([
    '',
    'nope',
    '{"t":"begin","id":"a","sheet":"1","tool":"knife","color":"#000","width":0.1,"p":[0,0]}',
    '{"t":"begin","id":"a","sheet":"1","tool":"pen","color":"red;x","width":0.1,"p":[0,0]}',
    '{"t":"more","id":"a","p":[0]}',
    '{"t":"more","id":"","p":[0,0]}',
    '{"t":"more","id":"a","p":[0,"1"]}',
    '{"t":"other"}',
  ])('形の合わない荷は読まない: %s', (text) => {
    expect(decodeInkPayload(text)).toBeNull();
  });

  it('上限を超える荷は読まない', () => {
    const big = JSON.stringify({ t: 'more', id: 'a', p: Array.from({ length: 400 }, () => 0.12345) });
    expect(decodeInkPayload(big)).toBeNull();
  });
});

describe('createPeerInk', () => {
  function sendTo(peers: ReturnType<typeof createPeerInk>, who: string) {
    return createInkSender((payload) => peers.apply(who, payload));
  }

  it('相手ごと・ページごとに線を組み直す', () => {
    const peers = createPeerInk();
    const a = sendTo(peers, 'A');
    const b = sendTo(peers, 'B');
    a.update('1', 'p1', pen([0.1, 0.1]));
    a.update('1', 'p1', pen([0.1, 0.1, 0.2, 0.2]));
    b.update('1', 'p2', pen([0.5, 0.5]));
    expect(peers.strokes('p1')).toEqual([{ who: 'A', stroke: pen([0.1, 0.1, 0.2, 0.2]) }]);
    expect(peers.strokes('p2')).toEqual([{ who: 'B', stroke: pen([0.5, 0.5]) }]);
  });

  it('書き始めを取りこぼした続きは捨てる', () => {
    const peers = createPeerInk();
    peers.apply('A', JSON.stringify({ t: 'more', id: '1', p: [0.1, 0.1] }));
    expect(peers.strokes('p1')).toEqual([]);
  });

  it('消した線・全部消した・抜けた相手の線は出さない', () => {
    const peers = createPeerInk();
    const a = sendTo(peers, 'A');
    const b = sendTo(peers, 'B');
    a.update('1', 'p1', pen([0.1, 0.1]));
    a.update('2', 'p1', pen([0.2, 0.2]));
    b.update('1', 'p1', pen([0.3, 0.3]));
    a.remove('1');
    expect(peers.strokes('p1').map((s) => s.stroke.points)).toEqual([[0.2, 0.2], [0.3, 0.3]]);
    a.clear();
    expect(peers.strokes('p1').map((s) => s.who)).toEqual(['B']);
    peers.drop('B');
    expect(peers.strokes('p1')).toEqual([]);
  });

  it('変わったときだけ知らせる', () => {
    const peers = createPeerInk();
    let count = 0;
    peers.onChange(() => count++);
    peers.apply('A', 'broken');
    sendTo(peers, 'A').update('1', 'p1', pen([0.1, 0.1]));
    expect(count).toBe(1);
  });

  it('1 人が持てる線の数に上限がある（古いものから捨てる）', () => {
    const peers = createPeerInk();
    const a = sendTo(peers, 'A');
    for (let i = 0; i < 600; i++) a.update(String(i), 'p1', pen([0.1, 0.1]));
    expect(peers.strokes('p1').length).toBeLessThanOrEqual(500);
  });
});

describe('荷の大きさの上限', () => {
  it('上限を渡すと、机の行に埋めたとき（引用符を逃がした後）の長さで収める', () => {
    const sent: string[] = [];
    const sender = createInkSender((payload) => sent.push(payload), 300);
    const points = Array.from({ length: 400 }, (_, i) => i / 400);
    sender.update('"quoted"', '#1', pen(points));
    expect(sent.length).toBeGreaterThan(2);
    for (const payload of sent) {
      const escaped = JSON.stringify(payload).length - 2;
      expect(escaped).toBeLessThanOrEqual(300);
    }
  });
});

describe('paceInkSender', () => {
  function fakeClock() {
    let time = 0;
    let task: { at: number; run: () => void } | null = null;
    const clock: InkClock = {
      now: () => time,
      setTimeout(run, ms) {
        task = { at: time + ms, run };
        return task;
      },
      clearTimeout(handle) {
        if (handle === task) task = null;
      },
    };
    return {
      clock,
      advance(ms: number) {
        time += ms;
        if (task && task.at <= time) {
          const { run } = task;
          task = null;
          run();
        }
      },
    };
  }

  function paced() {
    const calls: [string, ...unknown[]][] = [];
    const inner = {
      update: (id: string, sheet: string, stroke: InkStroke) => calls.push(['update', id, sheet, stroke.points.length]),
      remove: (id: string) => calls.push(['remove', id]),
      clear: () => calls.push(['clear']),
      flush: () => undefined,
    };
    const time = fakeClock();
    return { calls, time, sender: paceInkSender(inner, INK_SEND_INTERVAL_MS, time.clock) };
  }

  it('最初の点はすぐ送り、間隔の内に来た点は溜めて、間隔が来たら最新の形を 1 回だけ送る', () => {
    const { calls, time, sender } = paced();
    sender.update('a', 'p1', pen([0, 0]));
    expect(calls).toEqual([['update', 'a', 'p1', 2]]);
    for (let i = 1; i <= 5; i++) {
      time.advance(16);
      sender.update('a', 'p1', pen(Array.from({ length: (i + 1) * 2 }, () => 0)));
    }
    expect(calls).toHaveLength(1);
    time.advance(INK_SEND_INTERVAL_MS);
    expect(calls).toEqual([
      ['update', 'a', 'p1', 2],
      ['update', 'a', 'p1', 12],
    ]);
  });

  it('ペンを動かし続けても、送るのは間隔ごとに 1 回まで', () => {
    const { calls, time, sender } = paced();
    let points: number[] = [];
    for (let ms = 0; ms < 1000; ms += 16) {
      points = [...points, 0, 0];
      sender.update('a', 'p1', pen(points));
      time.advance(16);
    }
    expect(calls.length).toBeLessThanOrEqual(1000 / INK_SEND_INTERVAL_MS + 1);
  });

  it('flush で溜めていた形を今すぐ送る（ペンを離したとき）', () => {
    const { calls, sender } = paced();
    sender.update('a', 'p1', pen([0, 0]));
    sender.update('a', 'p1', pen([0, 0, 1, 1]));
    sender.flush();
    expect(calls.at(-1)).toEqual(['update', 'a', 'p1', 4]);
    sender.flush();
    expect(calls).toHaveLength(2);
  });

  it('消した線の溜めは捨て、消したことはすぐ送る', () => {
    const { calls, time, sender } = paced();
    sender.update('a', 'p1', pen([0, 0]));
    sender.update('a', 'p1', pen([0, 0, 1, 1]));
    sender.remove('a');
    time.advance(INK_SEND_INTERVAL_MS);
    expect(calls).toEqual([
      ['update', 'a', 'p1', 2],
      ['remove', 'a'],
    ]);
  });

  it('cancel は溜めを送らずに捨てる（部屋や文書を替えたとき）', () => {
    const { calls, time, sender } = paced();
    sender.update('a', 'p1', pen([0, 0]));
    sender.update('a', 'p1', pen([0, 0, 1, 1]));
    sender.cancel();
    time.advance(INK_SEND_INTERVAL_MS);
    expect(calls).toHaveLength(1);
  });
});
