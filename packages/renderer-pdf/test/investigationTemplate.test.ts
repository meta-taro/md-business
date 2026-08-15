import { describe, it, expect } from 'vitest';
import { renderInvestigationBody } from '../src/investigationTemplate.js';
import { standardInvestigation, minimalInvestigation } from './investigationFixtures.js';

describe('renderInvestigationBody — 表紙', () => {
  it('表題・文書番号・作成日時を出す', () => {
    const html = renderInvestigationBody(standardInvestigation());
    expect(html).toContain('決済 API の 502 増加についての調査');
    expect(html).toContain('INV-2026-0007');
    expect(html).toContain('2026-08-12T09:15:00+09:00');
  });

  it('時刻は書かれたまま出す（表示のために変換しない）', () => {
    // 変換するとログに出ている時刻と読み比べられなくなる。オフセットも書き手の記述を保つ。
    const html = renderInvestigationBody(minimalInvestigation());
    expect(html).toContain('2026-08-13T10:00:00Z');
    expect(html).not.toContain('2026年08月13日');
  });

  it('状態を日本語の見出しで出す', () => {
    expect(renderInvestigationBody(standardInvestigation({ status: 'investigating' }))).toContain(
      '調査中',
    );
    expect(renderInvestigationBody(standardInvestigation({ status: 'concluded' }))).toContain(
      '結論あり',
    );
    expect(renderInvestigationBody(standardInvestigation({ status: 'suspended' }))).toContain(
      '中断',
    );
  });

  it('状態は class にも出す（印刷時の色分けに使う）', () => {
    const html = renderInvestigationBody(standardInvestigation({ status: 'suspended' }));
    expect(html).toContain('mdb-investigation__status--suspended');
  });

  it('種別を日本語で出す', () => {
    expect(renderInvestigationBody(standardInvestigation({ kind: 'log' }))).toContain('ログ調査');
    expect(renderInvestigationBody(standardInvestigation({ kind: 'network' }))).toContain(
      '通信調査',
    );
  });

  it('調査した時間帯を、始まりと終わりの両方出す', () => {
    // 片方だけだと「その時間には何も無かった」と読めてしまう。
    const html = renderInvestigationBody(standardInvestigation());
    expect(html).toContain('2026-08-11T00:00:00+09:00');
    expect(html).toContain('2026-08-11T23:59:59+09:00');
  });

  it('作成者とレビュアーを役割つきで並べる', () => {
    const html = renderInvestigationBody(standardInvestigation());
    expect(html).toContain('伊藤 太郎');
    expect(html).toContain('調査担当');
    expect(html).toContain('山田 花子');
    expect(html).toContain('テックリード');
  });

  it('レビュアー・関連文書が無ければ見出しごと出さない', () => {
    const html = renderInvestigationBody(minimalInvestigation());
    expect(html).not.toContain('レビュアー');
    expect(html).not.toContain('関連文書');
  });

  it('hideCover を指定すると表紙を出さない', () => {
    const html = renderInvestigationBody(standardInvestigation(), { hideCover: true });
    expect(html).not.toContain('mdb-investigation__cover');
    expect(html).toContain('mdb-investigation__body');
  });
});

describe('renderInvestigationBody — 調べた対象', () => {
  it('パスと SHA-256 を並べる', () => {
    const html = renderInvestigationBody(standardInvestigation());
    expect(html).toContain('logs/api-2026-08-11.log');
    expect(html).toContain('logs/gateway-2026-08-11.jsonl');
  });

  it('SHA-256 は 64 桁すべて出す（縮めない）', () => {
    // 縮めると、後から同じファイルかどうか確かめられなくなる。それが唯一の手掛かり。
    const html = renderInvestigationBody(standardInvestigation());
    expect(html).toContain('a'.repeat(64));
    expect(html).toContain('b'.repeat(64));
  });

  it('備考は書いてあるものだけ出す', () => {
    const html = renderInvestigationBody(standardInvestigation());
    expect(html).toContain('本番 API の当日分');
  });
});

describe('renderInvestigationBody — 使った道具', () => {
  it('道具の名前と版を組にして出す', () => {
    // 版が違えば同じ操作でも結果が変わる。名前だけ出しても後から辿れない。
    const html = renderInvestigationBody(standardInvestigation());
    expect(html).toMatch(/jq[\s\S]{0,120}1\.7\.1/);
    expect(html).toMatch(/md-business[\s\S]{0,120}0\.9\.0/);
  });
});

describe('renderInvestigationBody — 所見', () => {
  it('番号・内容・重大度を出す', () => {
    const html = renderInvestigationBody(standardInvestigation());
    expect(html).toContain('F-01');
    expect(html).toContain('上流のタイムアウトが 3 秒に縮まっていた');
    expect(html).toContain('高');
  });

  it('重大度の 4 段階すべてに表示名がある', () => {
    const severities = [
      { severity: 'high' as const, label: '高' },
      { severity: 'medium' as const, label: '中' },
      { severity: 'low' as const, label: '低' },
      { severity: 'info' as const, label: '参考' },
    ];
    for (const { severity, label } of severities) {
      const html = renderInvestigationBody(
        standardInvestigation({
          findings: [{ id: 'F-01', summary: 'x', severity, evidence: ['evidence/EV-001.md'] }],
        }),
      );
      expect(html).toContain(label);
    }
  });

  it('根拠は所見ごとに全部出す', () => {
    // 根拠なしの所見を書けないようにしてある。出す側で落とすと、その縛りが無意味になる。
    const html = renderInvestigationBody(standardInvestigation());
    expect(html).toContain('evidence/EV-001.md');
    expect(html).toContain('evidence/EV-002.md');
    expect(html).toContain('evidence/EV-003.md');
  });

  it('既定では根拠をリンクにしない', () => {
    // 紙と、開く先を持たない画面が既定。押しても何も起きないリンクは、
    // 壊れているのと区別がつかない。
    const html = renderInvestigationBody(standardInvestigation());
    expect(html).not.toContain('<a ');
    expect(html).toContain('<code>evidence/EV-001.md</code>');
  });

  it('linkEvidence を渡したときだけ根拠をリンクにする', () => {
    const html = renderInvestigationBody(standardInvestigation(), { linkEvidence: true });
    expect(html).toContain('href="evidence/EV-001.md"');
    expect(html).toContain('href="evidence/EV-003.md"');
    // 参照の文字列はそのまま読める形で残す（リンクを開けない場所でも見える）。
    expect(html).toContain('>evidence/EV-001.md<');
  });

  it('リンクにするときも参照文字列は素通ししない', () => {
    const html = renderInvestigationBody(
      standardInvestigation({
        findings: [{ id: 'F-01', summary: 'x', evidence: ['"><script>alert(1)</script>'] }],
      }),
      { linkEvidence: true },
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('href=""><');
  });

  it('関連文書はリンクにしない', () => {
    // 関連文書は自由文字列で、ワークスペース内のパスとは限らない。
    // 開ける保証が無いものをリンクの形にすると、開けなかったときに壊れて見える。
    const html = renderInvestigationBody(
      standardInvestigation({ relatedDocs: ['docs/specs/auth.md'] }),
      { linkEvidence: true },
    );
    expect(html).toContain('<code>docs/specs/auth.md</code>');
  });

  it('所見がまだ無ければ見出しごと出さない', () => {
    const html = renderInvestigationBody(minimalInvestigation());
    expect(html).not.toContain('mdb-investigation__findings');
  });

  it('重大度を書いていない所見も、番号と内容は出す', () => {
    const html = renderInvestigationBody(
      standardInvestigation({
        findings: [{ id: 'F-09', summary: '重大度未判定', evidence: ['evidence/EV-001.md'] }],
      }),
    );
    expect(html).toContain('F-09');
    expect(html).toContain('重大度未判定');
  });
});

describe('renderInvestigationBody — 要約', () => {
  it('書いてあれば出す', () => {
    const html = renderInvestigationBody(standardInvestigation());
    expect(html).toContain('502 の増加は上流のタイムアウト短縮によるもので');
  });

  it('無ければ見出しごと出さない', () => {
    const html = renderInvestigationBody(minimalInvestigation());
    expect(html).not.toContain('mdb-investigation__summary');
  });
});

describe('renderInvestigationBody — 安全性', () => {
  it('本文に入った HTML はそのまま解釈させない', () => {
    const html = renderInvestigationBody(
      standardInvestigation({
        title: '<script>alert(1)</script>',
        summary: '<img src=x onerror=alert(1)>',
      }),
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
  });

  it('パスや根拠の参照も同じく素通ししない', () => {
    const html = renderInvestigationBody(
      standardInvestigation({
        targets: [{ path: '<b>logs</b>/x.log', sha256: 'c'.repeat(64) }],
        findings: [{ id: 'F-01', summary: 'x', evidence: ['<b>evidence</b>/EV-001.md'] }],
      }),
    );
    expect(html).not.toContain('<b>logs</b>');
    expect(html).not.toContain('<b>evidence</b>');
  });
});

describe('renderInvestigationBody — Markdown 本文', () => {
  it('本文 HTML を受け取ったら所見の後ろに置く', () => {
    const html = renderInvestigationBody(standardInvestigation(), {
      bodyHtml: '<h2>結論</h2><p>送信元 IP の素性が判明するまで断定しない。</p>',
    });
    expect(html).toContain('mdb-investigation__prose');
    expect(html).toContain('<h2>結論</h2>');
    expect(html).toContain('送信元 IP の素性が判明するまで断定しない。');
    expect(html.indexOf('mdb-investigation__findings')).toBeLessThan(
      html.indexOf('mdb-investigation__prose'),
    );
  });

  it('本文が無ければ節ごと出さない', () => {
    const html = renderInvestigationBody(standardInvestigation());
    expect(html).not.toContain('mdb-investigation__prose');
  });

  it('本文 HTML は素通しする（無害化は呼び出し側の責務）', () => {
    const html = renderInvestigationBody(standardInvestigation(), {
      bodyHtml: '<p>a &lt; b</p>',
    });
    expect(html).toContain('<p>a &lt; b</p>');
  });
});

describe('renderInvestigationBody — テーマ色', () => {
  it('プリセット名を色に変える', () => {
    const html = renderInvestigationBody(standardInvestigation({ theme: 'blue' }));
    expect(html).toContain('--mdb-color-accent:#2a4d7a');
  });

  it('#rrggbb をそのまま使う', () => {
    const html = renderInvestigationBody(standardInvestigation({ theme: '#123456' }));
    expect(html).toContain('--mdb-color-accent:#123456');
  });

  it('知らない指定は無視する', () => {
    const html = renderInvestigationBody(standardInvestigation({ theme: 'javascript:alert(1)' }));
    expect(html).not.toContain('--mdb-color-accent');
  });
});
