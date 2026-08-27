import { describe, it, expect } from 'vitest';
import { messages } from './messages';
import { LOCALES } from './locales';

// 型は「キーが揃っていること」までしか見ない。空文字や、差し込み欄（{count} 等）の
// 書き落としは通ってしまい、画面で初めて気づくことになる。ここで塞ぐ。

const KEYS = Object.keys(messages.ja) as (keyof typeof messages.ja)[];

function placeholders(text: string): string[] {
  return (text.match(/\{(\w+)\}/g) ?? []).sort();
}

describe('文言辞書', () => {
  it('すべての言語に、すべてのキーの中身がある', () => {
    for (const locale of LOCALES) {
      for (const key of KEYS) {
        expect(messages[locale][key], `${locale} / ${key}`).toBeTruthy();
      }
    }
  });

  it('差し込み欄は言語をまたいで同じ', () => {
    for (const locale of LOCALES) {
      for (const key of KEYS) {
        expect(placeholders(messages[locale][key]), `${locale} / ${key}`).toEqual(
          placeholders(messages.ja[key]),
        );
      }
    }
  });
});

describe('ソース管理パネルの文言', () => {
  const SCM_KEYS = KEYS.filter((key) => key.startsWith('scm.'));

  it('パネルの表示文言がすべて辞書にある', () => {
    expect(SCM_KEYS.length).toBeGreaterThan(0);
  });

  it('コミットボタンは件数を差し込める', () => {
    expect(messages.ja['scm.commitCount']).toContain('{count}');
  });
});

describe('検証グリッドの文言', () => {
  const GRID_KEYS = KEYS.filter((key) => key.startsWith('grid.'));

  it('グリッドの表示文言が辞書にある', () => {
    expect(GRID_KEYS.length).toBeGreaterThan(0);
  });

  // 控えた行があること自体を忘れられると「消えた」と受け取られる。件数が出る必要がある。
  it('控え行の切り替えは件数を差し込める', () => {
    for (const locale of LOCALES) {
      expect(messages[locale]['grid.revealShow'], locale).toContain('{count}');
      expect(messages[locale]['grid.revealHide'], locale).toContain('{count}');
    }
  });

  // 絞り込みは外した行をファイルに残さない。件数が出ないと、表に出ていない行があること自体に
  // 気づけないまま「行が消えた」と受け取られる。
  it('絞り込みの解除は件数を差し込める', () => {
    for (const locale of LOCALES) {
      expect(messages[locale]['grid.filterClear'], locale).toContain('{count}');
    }
  });

  // 参照先の取りこぼしは相手ファイルの中にあり、開いている画面のどこにも赤が出ない。
  // 件数が出ないと「見えていない＝無い」と受け取られる。
  it('参照先の取りこぼしは件数を差し込める', () => {
    for (const locale of LOCALES) {
      expect(messages[locale]['grid.linkGaps'], locale).toContain('{count}');
    }
  });

  // 移動先が無いとき、リンクが壊れているのか値がまだ無いのかを利用者が切り分けられるよう、
  // 探した列と値の両方を出す。
  it('行の移動先が無いときは、どの列のどの値かが分かる', () => {
    for (const locale of LOCALES) {
      expect(messages[locale]['grid.jumpNoRow'], locale).toContain('{column}');
      expect(messages[locale]['grid.jumpNoRow'], locale).toContain('{value}');
    }
  });
});

// Node 未検出は、利用者が自分で直せる唯一の劣化理由。「入れてください」だけだと
// どの版を入れればいいか分からず、入れた後もアプリを起動し直さないと PATH が更新されず
// 同じ表示のままになる（実運用で発生した）。文言そのものは変わりうるので、
// 検査するのは「対処に必要な 2 点が載っていること」に絞る。
describe('Node 未検出の文言', () => {
  it('どの言語でも必要な版が分かる', () => {
    for (const locale of LOCALES) {
      expect(messages[locale]['mcp.reason.nodeMissing'], locale).toMatch(/\d+/);
    }
  });

  it('どの言語でも入れた後に起動し直すことが分かる', () => {
    const restart = /起動し直|再起動|重新启动|restart|다시 시작/i;
    for (const locale of LOCALES) {
      expect(messages[locale]['mcp.reason.nodeMissing'], locale).toMatch(restart);
    }
  });
});

// 書き出す設定ファイルには接続トークンが入る。何が置かれるか分からないまま押せると、
// 公開リポジトリへそのまま載せてしまう。説明にトークンのことが要る。
describe('接続設定の書き出しの説明', () => {
  it('どの言語でもトークンが入ることが分かる', () => {
    const token = /トークン|token|令牌|토큰/i;
    for (const locale of LOCALES) {
      expect(messages[locale]['mcp.writeConfigNote'], locale).toMatch(token);
    }
  });
});

// 「置きました」だけでは、どこへ何のために置いたのかが残らない。押した本人には
// 何も起きていないように見えて、同じボタンをもう一度押すことになる。
describe('接続設定を置いた後の知らせ', () => {
  it('どの言語でも置いた場所を差し込める', () => {
    for (const locale of LOCALES) {
      expect(messages[locale]['mcp.wroteConfig'], locale).toContain('{path}');
    }
  });

  it('どの言語でも次にすることが分かる', () => {
    for (const locale of LOCALES) {
      expect(messages[locale]['mcp.wroteConfigNext'], locale).not.toBe('');
    }
  });
});

// この文はそのまま AI に渡される。読んだ AI が版を選べないと、18 系を入れられて
// 直らないまま「入れました」で終わる。要求する版が文に入っている必要がある。
describe('AI に頼む文', () => {
  it('どの言語でも Node 20 以上と分かる', () => {
    for (const locale of LOCALES) {
      expect(messages[locale]['mcp.askAiText'], locale).toMatch(/Node\s*20/);
    }
  });

  it('どの言語でも入れ終わった後にすることが書いてある', () => {
    // 入れて終わりだと繋がらない。押す先（もう一度さがす）まで文に含める。
    for (const locale of LOCALES) {
      const text = messages[locale]['mcp.askAiText'];
      expect(text, locale).toContain(messages[locale]['mcp.retry']);
    }
  });
});

// 手で書いた HTML を開いた面に断り書きだけを出すと、見る手立てが別の窓しか無いように
// 読める。まだ映していないときこそ、この面に出せることを書いておく。
describe('サイトの部品の面', () => {
  it('どの言語でも、押すボタンの名前で立て方を書いている', () => {
    for (const locale of LOCALES) {
      expect(messages[locale]['site.startNote'], locale).toContain(
        messages[locale]['action.liveLabel'],
      );
    }
  });

  it('どの言語でも、宣言が要ることが書いてある', () => {
    for (const locale of LOCALES) {
      expect(messages[locale]['site.declareNote'], locale).not.toBe('');
    }
  });

  // 応えていない待ち受けは、宣言した在り処を出さないと何を直せばいいか分からない。
  // 立ち上げるのは向こう側なので、こちらの操作を書いても押す先が無い。
  it('どの言語でも、応えていない待ち受けの在り処を差し込める', () => {
    for (const locale of LOCALES) {
      expect(messages[locale]['site.devDownNote'], locale).toContain('{url}');
    }
  });
});
