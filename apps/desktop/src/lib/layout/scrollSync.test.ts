import { describe, it, expect } from 'vitest';
import {
  scrollFraction,
  targetScrollTop,
  extractSearchTokens,
  candidateLines,
  pickNearestY,
} from './scrollSync';

describe('scrollFraction', () => {
  it('先頭は 0', () => {
    expect(scrollFraction(0, 1000, 400)).toBe(0);
  });

  it('末尾（scrollTop = scrollHeight - clientHeight）は 1', () => {
    expect(scrollFraction(600, 1000, 400)).toBe(1);
  });

  it('中間はスクロール可能域に対する割合', () => {
    // max = 1000 - 400 = 600、300/600 = 0.5
    expect(scrollFraction(300, 1000, 400)).toBe(0.5);
  });

  it('内容が枠に収まる（スクロール不能）なら 0', () => {
    expect(scrollFraction(0, 400, 400)).toBe(0);
    expect(scrollFraction(0, 300, 400)).toBe(0);
  });

  it('範囲外の scrollTop は 0..1 にクランプ', () => {
    expect(scrollFraction(-50, 1000, 400)).toBe(0);
    expect(scrollFraction(9999, 1000, 400)).toBe(1);
  });

  it('NaN は 0 に倒す', () => {
    expect(scrollFraction(Number.NaN, 1000, 400)).toBe(0);
  });
});

describe('targetScrollTop', () => {
  it('割合 0 は先頭', () => {
    expect(targetScrollTop(0, 1000, 400)).toBe(0);
  });

  it('割合 1 は末尾（scrollHeight - clientHeight）', () => {
    expect(targetScrollTop(1, 1000, 400)).toBe(600);
  });

  it('割合 0.5 は可能域の半分', () => {
    expect(targetScrollTop(0.5, 1000, 400)).toBe(300);
  });

  it('スクロール不能なら常に 0', () => {
    expect(targetScrollTop(0.5, 400, 400)).toBe(0);
    expect(targetScrollTop(1, 300, 400)).toBe(0);
  });

  it('範囲外の割合はクランプ', () => {
    expect(targetScrollTop(-1, 1000, 400)).toBe(0);
    expect(targetScrollTop(2, 1000, 400)).toBe(600);
  });

  it('scrollFraction とラウンドトリップする', () => {
    const f = scrollFraction(300, 1000, 400);
    expect(targetScrollTop(f, 1000, 400)).toBe(300);
  });
});

describe('extractSearchTokens', () => {
  it('key: value は値を優先し、行全体もフォールバックに残す', () => {
    // 値（フィールド名・ID）は逐語一致しやすいので先頭に置く。
    expect(extractSearchTokens('名前: orderId')).toEqual(['orderId', '名前: orderId']);
  });

  it('インデント・リストマーカーを剥がしてから解釈する', () => {
    expect(extractSearchTokens('  - 名前: orderId')).toEqual(['orderId', '名前: orderId']);
  });

  it('見出し記号 # を剥がす', () => {
    expect(extractSearchTokens('## 概要')).toEqual(['概要']);
  });

  it('値を全体で囲む角括弧は外す（YAML インラインリスト）', () => {
    expect(extractSearchTokens('タグ: [orders]')).toEqual(['orders', 'タグ: [orders]']);
  });

  it('ID・参照のような記号入りの値もそのまま検索語にする', () => {
    expect(extractSearchTokens('DB参照: API-2026-0001#orders.order_id')).toEqual([
      'API-2026-0001#orders.order_id',
      'DB参照: API-2026-0001#orders.order_id',
    ]);
  });

  it('値が空のキー行はキーを検索語にする', () => {
    expect(extractSearchTokens('リクエスト:')).toEqual(['リクエスト']);
  });

  it('プレビューで訳される値（型: 文字列）も語は出す（一致しなければ呼び出し側が近傍へ流す）', () => {
    expect(extractSearchTokens('型: 文字列')).toEqual(['文字列', '型: 文字列']);
  });

  it('空行・区切り・コードフェンスは語を出さない', () => {
    expect(extractSearchTokens('')).toEqual([]);
    expect(extractSearchTokens('   ')).toEqual([]);
    expect(extractSearchTokens('---')).toEqual([]);
    expect(extractSearchTokens('```yaml')).toEqual([]);
    expect(extractSearchTokens('~~~')).toEqual([]);
  });

  it('長さ 2 未満のノイズ語は捨てる', () => {
    // 値 "x" は 1 文字なので採らず、行全体（"a: x" → "a: x"）も 4 文字だが
    // キー "a" は 1 文字。結果として行全体だけ残る。
    expect(extractSearchTokens('a: x')).toEqual(['a: x']);
  });

  it('インライン装飾を落とす', () => {
    expect(extractSearchTokens('- **重要** な項目')).toEqual(['重要 な項目']);
  });
});

describe('candidateLines', () => {
  it('フォーカス行 → 下 → 上 の順で近傍へ広げる', () => {
    expect(candidateLines(10, 100, 2)).toEqual([10, 11, 9, 12, 8]);
  });

  it('範囲外（先頭・末尾付近）は落とす', () => {
    expect(candidateLines(1, 3, 3)).toEqual([1, 2, 3]);
    expect(candidateLines(3, 3, 2)).toEqual([3, 2, 1]);
  });

  it('総行数 1 ならフォーカス行のみ', () => {
    expect(candidateLines(1, 1, 5)).toEqual([1]);
  });
});

describe('pickNearestY', () => {
  it('期待位置に最も近い Y を選ぶ', () => {
    expect(pickNearestY([100, 900, 500], 480)).toBe(500);
  });

  it('候補が空なら null', () => {
    expect(pickNearestY([], 100)).toBeNull();
  });

  it('単一候補はそれを返す（期待位置と離れていても）', () => {
    expect(pickNearestY([1200], 0)).toBe(1200);
  });

  it('同距離なら先に見つかった方', () => {
    expect(pickNearestY([90, 110], 100)).toBe(90);
  });
});
