import { describe, it, expect } from 'vitest';
import { previewMarkdown } from '../src/shared/loadMarkdown.js';
import { PluginRegistry, type SchemaPlugin } from '../src/plugins/index.js';

const FULL_INVOICE_MD = `---
schemaVersion: "invoice/v1"
invoiceNumber: "INV-2026-0001"
issueDate: "2026-06-30"
issuer:
  name: "株式会社サンプル"
  registrationNumber: "T1234567890123"
recipient:
  name: "株式会社受領先"
items:
  - name: "業務委託費"
    quantity: 1
    unitPrice: 500000
    taxRate: 10
---
`;

// Draft mid-typing — recipient.name still missing, items empty. The strict path
// loadMarkdown() would reject this; previewMarkdown should render anyway so the
// editor preview is never blank.
const DRAFT_INVOICE_MD = `---
schemaVersion: "invoice/v1"
invoiceNumber: "INV-2026-0099"
issueDate: "2026-06-30"
issuer:
  name: "株式会社サンプル"
recipient: {}
---
`;

describe('previewMarkdown — permissive path', () => {
  it('renders a valid invoice frontmatter to HTML with zero errors', () => {
    const result = previewMarkdown(FULL_INVOICE_MD);
    if (!result.ok) throw new Error(`expected success, got: ${result.reason}`);
    expect(result.pluginId).toBe('invoice');
    expect(result.bodyHtml).toContain('mdb-invoice');
    expect(result.bodyHtml).toContain('INV-2026-0001');
    expect(result.errors).toHaveLength(0);
    expect(result.stylesHref).toBe('styles/invoice.css');
  });

  it('renders a partial draft and surfaces validation errors as a side channel', () => {
    const result = previewMarkdown(DRAFT_INVOICE_MD);
    if (!result.ok) throw new Error(`expected success, got: ${result.reason}`);
    expect(result.bodyHtml).toContain('mdb-invoice');
    // The recipient is still empty, but the renderer should produce SOMETHING
    // — that's the whole point of withPreviewDefaults().
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.map((e) => e.message).join('\n')).toMatch(/請求先|登録番号|品目/);
  });

  it('honors an explicit pluginId override', () => {
    const result = previewMarkdown(FULL_INVOICE_MD, { pluginId: 'invoice' });
    if (!result.ok) throw new Error('expected success');
    expect(result.pluginId).toBe('invoice');
  });

  it('reports a fatal parse error when frontmatter YAML is broken', () => {
    // Tab indentation in a block scalar — js-yaml rejects this.
    const broken = '---\n\tnot: valid\n---\nbody';
    const result = previewMarkdown(broken);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/frontmatter/);
  });

  it('reports a fatal error when no plugin matches the frontmatter', () => {
    const md = '---\ntitle: "just a note"\n---\n\nbody\n';
    const result = previewMarkdown(md);
    if (result.ok) throw new Error('expected failure');
    expect(result.reason).toMatch(/対応するスキーマ/);
  });

  it('defaults issuer/recipient names when only objects (no name field) are supplied', () => {
    // Hits the `else if (!name)` branches of withPreviewDefaults — author has
    // started filling in issuer/recipient but not the `name` key yet.
    const md = `---
schemaVersion: "invoice/v1"
invoiceNumber: "INV-2026-0100"
issueDate: "2026-06-30"
issuer:
  registrationNumber: "T1234567890123"
recipient:
  postalCode: "100-0001"
---
`;
    const result = previewMarkdown(md);
    if (!result.ok) throw new Error('expected success (permissive)');
    expect(result.bodyHtml).toContain('mdb-invoice');
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('defaults issuer/recipient when they are not objects at all', () => {
    // Hits the `typeof !== 'object'` branches — author hasn't created the
    // top-level keys yet, just the schemaVersion marker.
    const md = `---
schemaVersion: "invoice/v1"
invoiceNumber: ""
issueDate: ""
---
`;
    const result = previewMarkdown(md);
    if (!result.ok) throw new Error('expected success (permissive)');
    expect(result.bodyHtml).toContain('mdb-invoice');
  });

  it('falls back to strict validate() when a plugin omits previewRender', () => {
    // Custom plugin with no previewRender method — exercises the fallback path
    // in previewMarkdown so older plugins keep working.
    const minimalPlugin: SchemaPlugin = {
      id: 'note',
      label: 'メモ',
      schema: { $id: 'note', type: 'object' },
      stylesHref: 'styles/note.css',
      detect: (fm) => 'note' in fm,
      validate: (fm) =>
        typeof (fm as { title?: unknown }).title === 'string'
          ? { ok: true, data: fm, warnings: [] }
          : {
              ok: false,
              errors: [{ path: 'title', message: 'タイトルが必要です', keyword: 'required' }],
              warnings: [],
            },
      render: () => '<article class="note">ok</article>',
    };
    const registry = new PluginRegistry();
    registry.register(minimalPlugin);

    const valid = previewMarkdown('---\nnote: true\ntitle: "hi"\n---\nbody', { registry });
    if (!valid.ok) throw new Error('expected success');
    expect(valid.bodyHtml).toContain('article class="note"');
    expect(valid.errors).toHaveLength(0);

    const invalid = previewMarkdown('---\nnote: true\n---\nbody', { registry });
    if (!invalid.ok) throw new Error('expected success (permissive)');
    // Fallback path returns empty HTML on validation failure but exposes errors.
    expect(invalid.bodyHtml).toBe('');
    expect(invalid.errors).toHaveLength(1);
    expect(invalid.errors[0]?.message).toBe('タイトルが必要です');
  });
});
