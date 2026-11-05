// @vitest-environment jsdom
//
// 業務文書の frontmatter `fileName` が、デスクトップの PDF 保存名まで届くことを固定する。
// 名前の組み立ては各スキーマの fileName 処理（Chrome 拡張と同じもの）に任せる。
import { describe, it, expect } from 'vitest';
import { renderPreview } from './renderPreview';

function md(schema: string, extra: string[]): string {
  return ['---', `schemaVersion: ${schema}/v1`, ...extra, 'fileName: "出力_{文書番号}"', '---', ''].join('\n');
}

describe('PDF の保存名（frontmatter の fileName）', () => {
  const cases: Array<[string, string[]]> = [
    ['spec', ['documentNumber: SPEC-001', 'title: 決済']],
    ['test-spec', ['documentNumber: TEST-001', 'title: 検証']],
    ['api-spec', ['documentNumber: API-001', 'title: 決済 API']],
    ['db-spec', ['documentNumber: DB-001', 'title: 決済 DB']],
    ['nosql-db-spec', ['documentNumber: NOSQL-001', 'title: 決済 NoSQL']],
    ['investigation', ['documentNumber: INV-001', 'title: 調査']],
  ];

  for (const [schema, extra] of cases) {
    it(`${schema} は fileName の書式で名前を作る`, async () => {
      const r = await renderPreview(md(schema, extra));
      if (!r.ok) throw new Error(r.reason);
      const number = extra[0]?.split(': ')[1];
      expect(r.pdfFileName).toBe(`出力_${number}`);
    });
  }

  it('invoice は fileName の書式で名前を作る', async () => {
    const r = await renderPreview(
      ['---', 'schemaVersion: invoice/v1', 'invoiceNumber: INV-2026-0001', 'fileName: "請求_{請求書番号}"', '---', ''].join('\n'),
    );
    if (!r.ok) throw new Error(r.reason);
    expect(r.pdfFileName).toBe('請求_INV-2026-0001');
  });

  it('fileName が無ければ各スキーマの既定の規則で名前を作る', async () => {
    const r = await renderPreview(md('spec', ['documentNumber: SPEC-001', 'version: 1.0.0']).replace(/fileName.*\n/, ''));
    if (!r.ok) throw new Error(r.reason);
    expect(r.pdfFileName).toBe('基本設計書_SPEC-001_v1.0.0');
  });
});
