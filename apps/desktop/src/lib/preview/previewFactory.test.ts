import { describe, it, expect } from 'vitest';
import { createSchemaPreview, type SchemaPreviewConfig } from './previewFactory';

/**
 * prose スキーマ（spec / test-spec）は本文 markdown を HTML 化して body に描く。
 * そのため factory は frontmatter だけでなく「本文」も renderBody まで通す必要が
 * ある（データ駆動 4 スキーマは本文を無視するだけ）。ここでは本文が renderBody の
 * 第 2 引数へ確かに届くことを、echo する stub config で固定する（Phase 2c-A）。
 */
function makeEchoConfig(): SchemaPreviewConfig<Record<string, unknown>> {
  return {
    meta: { id: 'stub', label: 'スタブ', markers: ['stub'] },
    normalize: (fm) => ({ data: { ...fm }, warnings: [] }),
    autofill: (data) => ({ data, warnings: [] }),
    // 常に valid とみなす CompiledValidator。errors は付けない。
    validate: Object.assign(() => true, { errors: null }),
    translateErrors: () => [],
    translateWarnings: () => [],
    withPreviewDefaults: (data) => data,
    documentTitle: () => 'スタブ文書',
    // 本文（第 2 引数）を可視マーカー付きで body に echo する。
    renderBody: (_data, body) => `<main data-body="${body}">stub</main>`,
    css: '',
  };
}

describe('createSchemaPreview（本文配線・Phase 2c-A）', () => {
  it('render の第 2 引数 body を renderBody まで通し srcdoc に反映する', () => {
    const provider = makeEchoConfig();
    const preview = createSchemaPreview(provider);
    const result = preview.render({ stub: true }, '本文テキスト');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.srcdoc).toContain('data-body="本文テキスト"');
  });

  it('body 省略時は空文字を renderBody へ渡す（データ駆動スキーマ互換）', () => {
    const provider = makeEchoConfig();
    const preview = createSchemaPreview(provider);
    const result = preview.render({ stub: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.srcdoc).toContain('data-body=""');
  });

  it('renderBody が (data) のみ受ける関数でも代入可能（既存 4 スキーマ互換）', () => {
    // データ駆動 provider は renderBody: (data) => string。余分な body 引数は
    // 無視されるだけで型・実行とも互換であることを確認する。
    const config = makeEchoConfig();
    const dataOnly: SchemaPreviewConfig<Record<string, unknown>> = {
      ...config,
      renderBody: (data) => `<main>${Object.keys(data).length}</main>`,
    };
    const preview = createSchemaPreview(dataOnly);
    const result = preview.render({ a: 1, b: 2 }, 'ignored');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.srcdoc).toContain('<main>2</main>');
  });
});
