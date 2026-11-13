import { describe, expect, it } from 'vitest';
import {
  decodeDeniedLine,
  decodeDeskLine,
  decodeRoomsLine,
  encodePresenceLine,
  ROOMS_LINE,
  seatLine,
  SUBSCRIBE_LINE,
} from './deskLine';
import type { Place } from './place';

const place: Place = { kind: 'markdown', branch: 'main', line: 3 };

describe('encodePresenceLine', () => {
  it('居場所を机の 1 行にする（場所は JSON 文字列のまま運ぶ）', () => {
    const line = encodePresenceLine('github.com/o/r#docs/a.md', place, 'ROOM');
    expect(line).not.toBeNull();
    expect(JSON.parse(line as string)).toEqual({
      型: '居場所',
      文書: 'github.com/o/r#docs/a.md',
      場所: '{"branch":"main","line":3}',
      room: 'ROOM',
    });
  });

  it('閉じたは場所を空にする', () => {
    const line = encodePresenceLine('a.md', null, 'ROOM');
    expect(JSON.parse(line as string).場所).toBe('');
  });

  it('1 行に収める（改行を含まない）', () => {
    const line = encodePresenceLine('a.md', { kind: 'tsv', branch: 'x\ny', rowId: 'r1', column: '項目' }, 'ROOM');
    expect(line).not.toContain('\n');
  });

  it('文書が空・長すぎる・制御文字を含むときは送らない', () => {
    expect(encodePresenceLine('', place, 'ROOM')).toBeNull();
    expect(encodePresenceLine('a'.repeat(513), place, 'ROOM')).toBeNull();
    expect(encodePresenceLine('a\tb.md', place, 'ROOM')).toBeNull();
  });

  it('場所が上限を超えるときは送らない', () => {
    const long: Place = {
      kind: 'tsv',
      branch: 'b',
      rowId: 'r',
      column: 'c'.repeat(600),
    };
    expect(encodePresenceLine('a.md', long, 'ROOM')).toBeNull();
  });

  it('部屋を指さないときは送らない（画面が見ている部屋へ流れてしまう）', () => {
    expect(encodePresenceLine('a.md', place, '')).toBeNull();
  });
});

describe('seatLine', () => {
  const place = (line: string) => JSON.parse(line).場所 as string;

  it('機械の名前を添えて名乗る（別の PC の md-business と見分けるため）', () => {
    expect(JSON.parse(seatLine('desk-a'))).toEqual({
      型: 'listen',
      場所: 'md-business（desk-a）',
    });
  });

  it('機械の名前が分からなければ名前だけで名乗る', () => {
    expect(place(seatLine(null))).toBe('md-business');
    expect(place(seatLine('  '))).toBe('md-business');
  });

  it('前後の空白と制御文字を落とす', () => {
    expect(place(seatLine(' a	b '))).toBe('md-business（ab）');
  });

  it('机の名乗りの上限（32 文字）に収めて括弧は閉じる', () => {
    const got = place(seatLine('あ'.repeat(40)));
    expect([...got]).toHaveLength(32);
    expect(got.endsWith('）')).toBe(true);
  });
});

describe('SUBSCRIBE_LINE', () => {
  it('相手の居場所を流してもらう 1 行', () => {
    expect(JSON.parse(SUBSCRIBE_LINE)).toEqual({ 型: '居場所を聞く' });
  });
});

describe('decodeDeskLine', () => {
  const heard = (fields: Record<string, unknown>) => JSON.stringify({ 型: '居場所', ...fields });

  it('相手の居場所を読む', () => {
    const update = decodeDeskLine(
      heard({
        誰: 'B さん',
        文書: 'a.md',
        場所: '{"branch":"main","line":3}',
        room: 'ROOM',
      }),
    );
    expect(update).toEqual({
      who: 'B さん',
      document: 'a.md',
      place,
      room: 'ROOM',
    });
  });

  it('場所が空なら閉じた', () => {
    const update = decodeDeskLine(heard({ 誰: 'B', 文書: 'a.md', 場所: '', room: 'ROOM' }));
    expect(update).toEqual({
      who: 'B',
      document: 'a.md',
      place: null,
      room: 'ROOM',
    });
  });

  it('居場所以外の行は無視する', () => {
    expect(
      decodeDeskLine(
        JSON.stringify({
          型: 'heard',
          id: 1,
          from: 'B',
          body: 'x',
          at: '10:00',
        }),
      ),
    ).toBeNull();
    expect(decodeDeskLine(JSON.stringify({ 型: 'left', 名前: 'B' }))).toBeNull();
  });

  it('部屋の無い居場所（同じ機械の中）は画面の部屋に当たらないので捨てる', () => {
    expect(decodeDeskLine(heard({ 誰: 'B', 文書: 'a.md', 場所: '' }))).toBeNull();
  });

  it('形の合わないものは黙って捨てる', () => {
    expect(decodeDeskLine('')).toBeNull();
    expect(decodeDeskLine('{')).toBeNull();
    expect(decodeDeskLine('[]')).toBeNull();
    expect(decodeDeskLine(heard({ 誰: '', 文書: 'a.md', 場所: '', room: 'R' }))).toBeNull();
    expect(decodeDeskLine(heard({ 誰: 'B', 文書: '', 場所: '', room: 'R' }))).toBeNull();
    expect(decodeDeskLine(heard({ 誰: 'B', 文書: 'a.md', 場所: 1, room: 'R' }))).toBeNull();
    expect(decodeDeskLine(heard({ 誰: 'B', 文書: 'a.md', 場所: '{"x":1}', room: 'R' }))).toBeNull();
  });
});

describe('部屋の一覧', () => {
  it('一覧を聞く 1 行', () => {
    expect(JSON.parse(ROOMS_LINE)).toEqual({ 型: '部屋たち' });
  });

  it('机が返す一覧を読む（名前の無い部屋は null のまま）', () => {
    const line = JSON.stringify({
      型: '部屋たち',
      部屋: [
        {
          id: 'A'.repeat(26),
          名前: '開発',
          人数: 3,
          主催か: true,
          見ているか: true,
        },
        {
          id: 'B'.repeat(26),
          名前: null,
          人数: 1,
          主催か: false,
          見ているか: false,
        },
      ],
    });
    expect(decodeRoomsLine(line)).toEqual([
      { id: 'A'.repeat(26), name: '開発', members: 3 },
      { id: 'B'.repeat(26), name: null, members: 1 },
    ]);
  });

  it('形の合わない部屋は飛ばし、一覧でない行は null', () => {
    const line = JSON.stringify({
      型: '部屋たち',
      部屋: [{ id: '', 名前: 'x', 人数: 1 }, { 名前: 'y' }],
    });
    expect(decodeRoomsLine(line)).toEqual([]);
    expect(decodeRoomsLine(JSON.stringify({ 型: '居場所' }))).toBeNull();
    expect(decodeRoomsLine(JSON.stringify({ 型: '部屋たち' }))).toBeNull();
    expect(decodeRoomsLine('壊れた')).toBeNull();
  });
});

describe('decodeDeniedLine', () => {
  it('断られた理由を読む', () => {
    expect(decodeDeniedLine(JSON.stringify({ 型: 'denied', why: 'その部屋に居ません' }))).toBe('その部屋に居ません');
  });

  it('断りでない行・理由の無い行は null', () => {
    expect(decodeDeniedLine(JSON.stringify({ 型: '部屋たち', 部屋: [] }))).toBeNull();
    expect(decodeDeniedLine(JSON.stringify({ 型: 'denied' }))).toBeNull();
    expect(decodeDeniedLine('{')).toBeNull();
  });
});
