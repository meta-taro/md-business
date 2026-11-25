import { describe, it, expect } from 'vitest';
import {
  splitInk,
  writeInk,
  makeInkAnchor,
  resolveInkAnchor,
  simplifyStroke,
  pointsToPath,
  pathToPoints,
  INK_MARKER,
  MAX_INK_CHARS,
  type InkStroke,
} from '../src/index.js';

const STROKE: InkStroke = {
  id: 'ink-1',
  anchor: { heading: 'dai-2-shou', text: '適格請求書の記載事項は' },
  by: 'metataro',
  at: '2026-11-14T10:00:00+09:00',
  color: '#d33',
  width: 3,
  note: 'ここ要確認',
  paths: ['M 12 340 L 120 338 L 260 345'],
};

const SECOND: InkStroke = {
  id: 'ink-2',
  anchor: { text: '冒頭の段落' },
  color: '#06c',
  width: 2,
  paths: ['M 0 0 L 1000 1000', 'M 5 5 L 6 6'],
};

const BODIES = [
  '',
  '# 題\n',
  '# 題\n\n本文。\n',
  '# 題\n\n本文。',
  '本文。\n\n\n',
  '# 題\r\n\r\n本文。\r\n',
  '```md\n<!-- md-business:ink/v1\n-->\n```\n',
];

describe('writeInk / splitInk', () => {
  it('書き込みを足しても外しても、本文は 1 バイトも変わらない', () => {
    for (const body of BODIES) {
      const written = writeInk(body, [STROKE, SECOND]);
      const split = splitInk(written);
      expect(split.body).toBe(body);
      expect(split.strokes).toEqual([STROKE, SECOND]);
      expect(split.problems).toEqual([]);
      expect(writeInk(written, [])).toBe(body);
    }
  });

  it('書き込みは末尾の HTML コメント 1 つにまとまる', () => {
    const written = writeInk('# 題\n\n本文。\n', [STROKE]);
    expect(written.startsWith('# 題\n\n本文。\n\n<!-- ' + INK_MARKER + '\n')).toBe(true);
    expect(written.endsWith('\n-->\n')).toBe(true);
    expect(written.match(/<!--/g)).toHaveLength(1);
  });

  it('書き直すと、前の書き込みの塊だけを差し替える', () => {
    const once = writeInk('本文。\n', [STROKE]);
    const twice = writeInk(once, [SECOND]);
    expect(splitInk(twice)).toEqual({ body: '本文。\n', strokes: [SECOND], problems: [] });
    expect(twice.match(/<!--/g)).toHaveLength(1);
  });

  it('書き込みが無い文書はそのまま返す', () => {
    expect(writeInk('本文。\n', [])).toBe('本文。\n');
    expect(splitInk('本文。\n')).toEqual({ body: '本文。\n', strokes: [], problems: [] });
  });

  it('注記にコメントの閉じ（-->）があっても、コメントが途中で切れない', () => {
    const tricky: InkStroke = {
      ...STROKE,
      note: 'a --> b --!> c',
      anchor: { text: '<b>x</b>' },
    };
    const written = writeInk('本文。\n', [tricky]);
    const inner = written.slice(written.indexOf('<!--') + 4, written.lastIndexOf('-->'));
    expect(inner).not.toContain('-->');
    expect(inner).not.toContain('--!>');
    expect(splitInk(written).strokes).toEqual([tricky]);
  });

  it('末尾でない位置の印は書き込みとみなさない（本文中の見本など）', () => {
    const doc = '<!-- md-business:ink/v1\n[]\n-->\n\n続きの本文。\n';
    expect(splitInk(doc)).toEqual({ body: doc, strokes: [], problems: [] });
  });

  it('コードの囲みの中の印は書き込みとみなさない', () => {
    const doc = '```md\n<!-- md-business:ink/v1\n[]\n-->\n```\n';
    expect(splitInk(doc).body).toBe(doc);
  });

  it('形の崩れた線は捨てずに問題として返し、読めた線は使う', () => {
    const doc = [
      '本文。',
      '',
      '<!-- md-business:ink/v1',
      '- id: ok',
      '  anchor: {text: "本文"}',
      '  color: "#000"',
      '  width: 1',
      '  paths: ["M 1 2 L 3 4"]',
      '- id: broken',
      '  paths: "not-a-list"',
      '-->',
      '',
    ].join('\n');
    const split = splitInk(doc);
    expect(split.body).toBe('本文。\n');
    expect(split.strokes.map((s) => s.id)).toEqual(['ok']);
    expect(split.problems).toHaveLength(1);
    expect(split.problems[0]).toMatchObject({ index: 1 });
  });

  it('YAML として読めない塊は、本文に戻さず問題として返す', () => {
    const doc = '本文。\n\n<!-- md-business:ink/v1\n- id: [\n-->\n';
    const split = splitInk(doc);
    expect(split.body).toBe('本文。\n');
    expect(split.strokes).toEqual([]);
    expect(split.problems).toHaveLength(1);
  });

  it('大きすぎる塊は読まずに問題として返す', () => {
    const doc = `本文。\n\n<!-- ${INK_MARKER}\n# ${'x'.repeat(MAX_INK_CHARS)}\n-->\n`;
    const split = splitInk(doc);
    expect(split.strokes).toEqual([]);
    expect(split.problems[0]?.message).toMatch(/too large/);
  });

  it('id が重なる線は後のものを問題にする', () => {
    const doc = writeInk('本文。\n', [STROKE, { ...SECOND, id: STROKE.id }]);
    const split = splitInk(doc);
    expect(split.strokes).toEqual([STROKE]);
    expect(split.problems).toHaveLength(1);
  });
});

describe('makeInkAnchor / resolveInkAnchor', () => {
  const paragraphs = [
    { heading: 'gaiyou', text: '冒頭の段落です。' },
    { heading: 'dai-2-shou', text: '適格請求書の記載事項は次のとおり。' },
    { heading: 'dai-3-shou', text: '適格請求書の記載事項は別表に示す。' },
  ];

  it('段落の先頭を空白を詰めて切り出す', () => {
    expect(makeInkAnchor('h', '  あ  い\n う  ')).toEqual({ heading: 'h', text: 'あ い う' });
    expect(makeInkAnchor(undefined, 'x'.repeat(100)).text).toHaveLength(32);
    expect(makeInkAnchor(undefined, 'x')).toEqual({ text: 'x' });
  });

  it('同じ見出しの下で先頭の文字が合う段落を指す', () => {
    expect(resolveInkAnchor({ heading: 'dai-3-shou', text: '適格請求書の記載事項は' }, paragraphs)).toBe(2);
  });

  it('見出しが変わっていても、段落の文字で引き直せる（最初に合うもの）', () => {
    expect(resolveInkAnchor({ heading: 'renamed', text: '適格請求書の記載事項は' }, paragraphs)).toBe(1);
    expect(resolveInkAnchor({ text: '冒頭の段落' }, paragraphs)).toBe(0);
  });

  it('空白の違いは無視する', () => {
    expect(resolveInkAnchor({ text: '冒頭の 段落' }, [{ text: '冒頭の\n段落です' }])).toBe(0);
    expect(resolveInkAnchor({ text: 'a b' }, [{ text: 'a\n  b c' }])).toBe(0);
  });

  it('引き直せなければ -1（場所を失った書き込み）', () => {
    expect(resolveInkAnchor({ text: '消えた段落' }, paragraphs)).toBe(-1);
    expect(resolveInkAnchor({ text: '' }, paragraphs)).toBe(-1);
  });
});

describe('simplifyStroke / pointsToPath / pathToPoints', () => {
  it('ほぼ直線上の点を間引き、端点は残す', () => {
    const line: [number, number][] = [];
    for (let i = 0; i <= 100; i++) line.push([i * 10, i % 2 === 0 ? 0 : 0.4]);
    expect(simplifyStroke(line, 1)).toEqual([
      [0, 0],
      [1000, 0],
    ]);
  });

  it('曲がり角は残す', () => {
    const pts: [number, number][] = [
      [0, 0],
      [50, 1],
      [100, 0],
      [100, 50],
      [100, 100],
    ];
    expect(simplifyStroke(pts, 2)).toEqual([
      [0, 0],
      [100, 0],
      [100, 100],
    ]);
  });

  it('2 点以下はそのまま', () => {
    expect(simplifyStroke([[1, 2]], 5)).toEqual([[1, 2]]);
    expect(simplifyStroke([], 5)).toEqual([]);
  });

  it('座標は 0〜1000 の整数に丸めて path にする', () => {
    expect(
      pointsToPath([
        [-5, 12.6],
        [1200, 999.4],
        [3, 4],
      ])
    ).toBe('M 0 13 L 1000 999 L 3 4');
    expect(pointsToPath([])).toBe('');
  });

  it('path から点列へ戻せる。知らない命令の path は空にする', () => {
    expect(pathToPoints('M 0 13 L 1000 999 L 3 4')).toEqual([
      [0, 13],
      [1000, 999],
      [3, 4],
    ]);
    expect(pathToPoints('M 1 2 C 3 4 5 6 7 8')).toEqual([]);
    expect(pathToPoints('')).toEqual([]);
  });
});
