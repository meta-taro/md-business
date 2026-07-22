import { describe, it, expect } from 'vitest';
import { renderSpecBody } from '../src/specTemplate.js';
import { standardSpec, minimalSpec } from './specFixtures.js';

describe('renderSpecBody — cover page', () => {
  it('emits the document title, version, and issue date', () => {
    const html = renderSpecBody(standardSpec());
    expect(html).toContain('受発注システム 基本設計書');
    expect(html).toContain('SPEC-2026-0001');
    expect(html).toContain('1.0.0');
    expect(html).toContain('2026年06月17日');
  });

  it('renders a status badge with the localized label', () => {
    const html = renderSpecBody(standardSpec({ status: 'review' }));
    expect(html).toContain('mdb-spec__status--review');
    expect(html).toContain('レビュー中');
  });

  it('renders draft / approved badge variants', () => {
    expect(renderSpecBody(standardSpec({ status: 'draft' }))).toContain('ドラフト');
    expect(renderSpecBody(standardSpec({ status: 'approved' }))).toContain('承認済');
  });

  it('lists authors with their roles', () => {
    const html = renderSpecBody(standardSpec());
    expect(html).toContain('伊藤 太郎');
    expect(html).toContain('（PdM）');
    expect(html).toContain('山田 花子');
    expect(html).toContain('（テックリード）');
  });

  it('lists reviewers when provided', () => {
    const html = renderSpecBody(standardSpec());
    expect(html).toContain('佐藤 太郎');
    expect(html).toContain('mdb-spec__people');
    expect(html).toMatch(/レビュアー/);
  });

  it('omits the reviewers section when none are provided', () => {
    const html = renderSpecBody(minimalSpec());
    expect(html).not.toContain('レビュアー');
  });

  it('renders the related docs list when provided', () => {
    const html = renderSpecBody(standardSpec());
    expect(html).toContain('関連文書');
    expect(html).toContain('/docs/requirements.md');
    expect(html).toContain('/docs/architecture.md');
  });

  it('omits the related docs section when empty', () => {
    const html = renderSpecBody(standardSpec({ relatedDocs: [] }));
    expect(html).not.toContain('関連文書');
  });

  it('hides the cover page when hideCover is set', () => {
    const html = renderSpecBody(standardSpec(), { hideCover: true });
    expect(html).not.toContain('mdb-spec__cover');
    expect(html).not.toContain('mdb-spec__title');
  });
});

describe('renderSpecBody — body injection', () => {
  it('wraps a pre-rendered HTML body in mdb-spec__body', () => {
    const html = renderSpecBody(standardSpec(), { bodyHtml: '<h1>第1章</h1><p>本文</p>' });
    expect(html).toContain('mdb-spec__body');
    expect(html).toContain('<h1>第1章</h1>');
    expect(html).toContain('<p>本文</p>');
  });

  it('omits the body section when no bodyHtml is provided', () => {
    const html = renderSpecBody(standardSpec());
    expect(html).not.toContain('mdb-spec__body');
  });

  it('does NOT escape the bodyHtml (caller is responsible for sanitization)', () => {
    const body = '<p>inline <code>code</code></p>';
    const html = renderSpecBody(standardSpec(), { bodyHtml: body });
    expect(html).toContain(body);
  });
});

describe('renderSpecBody — theme color', () => {
  it('maps preset names to accent colors via CSS variable', () => {
    const html = renderSpecBody(standardSpec({ theme: 'red' }));
    expect(html).toContain('--mdb-color-accent:#b91c1c');
  });

  it('accepts custom hex colors', () => {
    const html = renderSpecBody(standardSpec({ theme: '#1e3a8a' }));
    expect(html).toContain('--mdb-color-accent:#1e3a8a');
  });

  it('ignores unknown theme strings (no style attribute injected)', () => {
    const html = renderSpecBody(standardSpec({ theme: 'magenta' }));
    expect(html).not.toContain('--mdb-color-accent');
  });

  it('handles missing theme gracefully', () => {
    const html = renderSpecBody(minimalSpec());
    expect(html).not.toContain('--mdb-color-accent');
  });

  it('rejects values that look like CSS injection attempts', () => {
    const html = renderSpecBody(standardSpec({ theme: 'red;background:url(evil)' }));
    expect(html).not.toContain('url(evil)');
    expect(html).not.toContain('--mdb-color-accent');
  });
});

describe('renderSpecBody — HTML safety', () => {
  it('escapes HTML special characters in title', () => {
    const html = renderSpecBody(standardSpec({ title: '<script>alert(1)</script>' }));
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes author names', () => {
    const html = renderSpecBody(
      standardSpec({ authors: [{ name: '<img onerror=x>', role: '"><svg>' }] }),
    );
    expect(html).not.toContain('<img onerror=x>');
    expect(html).toContain('&lt;img onerror=x&gt;');
    expect(html).toContain('&quot;&gt;&lt;svg&gt;');
  });

  it('escapes the schema-version attribute', () => {
    const html = renderSpecBody(standardSpec({ schemaVersion: 'spec/v1' }));
    expect(html).toContain('data-schema-version="spec/v1"');
  });
});
