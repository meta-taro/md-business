// @vitest-environment jsdom
//
// 図の描画は Mermaid 本体（大きい）を必要とするが、jsdom には SVG の採寸が無く
// 本体をそのまま走らせられない。そこで描画器を差し替えられる形にして、
// ここでは「文書のどこを・いつ・何回書き換えるか」だけを確かめる。

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderMermaidInDocument, mermaidConfig, _resetMermaidCacheForTest } from './renderMermaid';

function docWith(html: string): Document {
  const doc = document.implementation.createHTMLDocument('t');
  doc.body.innerHTML = html;
  return doc;
}

const BLOCK = '<pre><code class="language-mermaid">graph LR; A--&gt;B</code></pre>';

beforeEach(() => {
  _resetMermaidCacheForTest();
});

describe('プレビュー内の図', () => {
  it('図が無い文書では描画器を呼ばない', async () => {
    // ここが呼ばれると Mermaid 本体を読むことになる。請求書のように図を
    // 使わない文書で費用が出ないことが、遅延読み込みの前提。
    const renderer = vi.fn();
    await renderMermaidInDocument(docWith('<p>本文</p>'), { renderer });
    expect(renderer).not.toHaveBeenCalled();
  });

  it('図のコードブロックを SVG に置き換える', async () => {
    const doc = docWith(BLOCK);
    await renderMermaidInDocument(doc, { renderer: async () => '<svg><g/></svg>' });
    expect(doc.querySelector('svg')).not.toBeNull();
    expect(doc.querySelector('code.language-mermaid')).toBeNull();
  });

  it('描画器には図の元テキストを渡す', async () => {
    const renderer = vi.fn(async () => '<svg/>');
    await renderMermaidInDocument(docWith(BLOCK), { renderer });
    expect(renderer).toHaveBeenCalledWith('graph LR; A-->B', 'light');
  });

  it('同じ図は 2 回目以降描き直さない', async () => {
    // プレビューは編集のたびに文書ごと作り直される。毎回描き直すと、
    // 図が 1 つあるだけで打鍵のたびに描画が走る。
    const renderer = vi.fn(async () => '<svg/>');
    await renderMermaidInDocument(docWith(BLOCK), { renderer });
    await renderMermaidInDocument(docWith(BLOCK), { renderer });
    expect(renderer).toHaveBeenCalledTimes(1);
  });

  it('テーマが変われば描き直す', async () => {
    const renderer = vi.fn(async () => '<svg/>');
    await renderMermaidInDocument(docWith(BLOCK), { renderer, theme: 'light' });
    await renderMermaidInDocument(docWith(BLOCK), { renderer, theme: 'dark' });
    expect(renderer).toHaveBeenCalledTimes(2);
  });

  it('描画に失敗したら元のブロックを残す', async () => {
    // 書きかけの図で本文全体が消えると、何を直せばよいか分からなくなる。
    const doc = docWith(BLOCK);
    await renderMermaidInDocument(doc, {
      renderer: async () => {
        throw new Error('Parse error');
      },
    });
    expect(doc.querySelector('code.language-mermaid')?.textContent).toBe('graph LR; A-->B');
  });

  it('ラベルは HTML ではなく文字として描かせる', () => {
    // ER 図とフローチャートは、既定ではラベルを <foreignObject>（SVG の中の HTML）
    // で描く。プレビューの無害化はこの箱を落とすため、枠だけ出て文字が消える。
    // シーケンス図だけ無事だったのは、そちらが最初から <text> で描くため。
    // 無害化を緩めるのではなく、図の側を <text> に寄せて合わせる。
    for (const theme of ['light', 'dark'] as const) {
      const config = mermaidConfig(theme);
      expect(config.htmlLabels).toBe(false);
      expect(config.flowchart?.htmlLabels).toBe(false);
      expect(config.class?.htmlLabels).toBe(false);
    }
  });

  it('テーマ設定は明暗で切り替わる', () => {
    expect(mermaidConfig('dark').theme).toBe('dark');
    expect(mermaidConfig('light').theme).toBe('default');
  });

  it('図から script を動かせないようにする', () => {
    expect(mermaidConfig('light').securityLevel).toBe('strict');
  });

  it('描画結果に紛れ込んだスクリプトは落とす', async () => {
    const doc = docWith(BLOCK);
    await renderMermaidInDocument(doc, {
      renderer: async () => '<svg><script>alert(1)</script></svg>',
    });
    expect(doc.querySelector('script')).toBeNull();
  });
});
