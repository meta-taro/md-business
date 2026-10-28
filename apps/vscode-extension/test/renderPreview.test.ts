// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderPreview } from '../src/webview/render.js';

const TEMPLATES = resolve(__dirname, '../../../templates');
const template = (path: string): string => readFileSync(resolve(TEMPLATES, path), 'utf8');
const BASE = 'vscode-webview://abc/dist/';

describe('renderPreview', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '<main id="root"></main>';
  });

  const root = (): HTMLElement => document.getElementById('root') as HTMLElement;
  const styleHref = (): string | null =>
    document.querySelector('link[data-md-business]')?.getAttribute('href') ?? null;

  it('renders a shipped spec template with its stylesheet', () => {
    renderPreview(root(), template('spec/standard-ja.md'), BASE);
    expect(root().querySelector('.mdb-notice')).toBeNull();
    expect(root().textContent?.trim().length).toBeGreaterThan(0);
    expect(styleHref()).toBe(`${BASE}styles/spec.css`);
  });

  it('swaps the stylesheet when the schema changes, keeping a single link', () => {
    renderPreview(root(), template('spec/standard-ja.md'), BASE);
    renderPreview(root(), template('invoice/standard-ja.md'), BASE);
    expect(document.querySelectorAll('link[data-md-business]')).toHaveLength(1);
    expect(styleHref()).toBe(`${BASE}styles/invoice.css`);
  });

  it('explains why there is nothing to show for plain Markdown', () => {
    renderPreview(root(), '# 見出し\n\n本文', BASE);
    expect(root().querySelector('.mdb-notice')?.textContent).toContain('スキーマ');
  });

  it('keeps rendering while listing what is still wrong', () => {
    const doc = template('spec/standard-ja.md').replace(/^版: .*$/m, '版: abc');
    renderPreview(root(), doc, BASE);
    const notice = root().querySelector('.mdb-notice');
    expect(notice?.textContent).toContain('SemVer');
    expect(root().querySelector('.mdb-body')?.innerHTML.length).toBeGreaterThan(0);
  });

  it('shows notice text as text, not markup', () => {
    renderPreview(
      root(),
      '---\nschema: spec/v1\n\ttitle: <img src=x onerror=alert(1)>\n---\n',
      BASE,
    );
    expect(root().querySelector('img')).toBeNull();
  });
});
