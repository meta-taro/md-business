import { describe, it, expect } from 'vitest';
import { PROJECT_CONFIG_FILENAME, WEB_MODE_DECLARATION } from '@md-business/core';
import { MemoryDocumentStore } from './store.js';
import { writeSiteFile } from './siteFiles.js';

/** web を名乗っているフォルダ。 */
function webStore(seed: Record<string, string> = {}): MemoryDocumentStore {
  return new MemoryDocumentStore({ [PROJECT_CONFIG_FILENAME]: WEB_MODE_DECLARATION, ...seed });
}

describe('writeSiteFile', () => {
  it('web を名乗るフォルダに html を書ける', async () => {
    const store = webStore();
    const r = await writeSiteFile(store, { path: 'index.html', content: '<h1>やあ</h1>\n' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.path).toBe('index.html');
    expect(r.created).toBe(true);
    expect(await store.read('index.html')).toBe('<h1>やあ</h1>\n');
  });

  it('既にあるファイルは置き換えて created:false', async () => {
    const store = webStore({ 'assets/style.css': 'body{}' });
    const r = await writeSiteFile(store, { path: 'assets/style.css', content: 'body{color:red}' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.created).toBe(false);
    expect(await store.read('assets/style.css')).toBe('body{color:red}');
  });

  it('宣言の無いフォルダには書かず、宣言の口を案内する', async () => {
    const store = new MemoryDocumentStore();
    const r = await writeSiteFile(store, { path: 'index.html', content: '<h1>やあ</h1>' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('declare_web_mode');
    expect(await store.exists('index.html')).toBe(false);
  });

  it('業務文書（.md / .tsv）は専用の口へ回す', async () => {
    const store = webStore();
    const md = await writeSiteFile(store, { path: 'docs/spec.md', content: '# 仕様' });
    expect(md.ok).toBe(false);
    if (!md.ok) expect(md.error).toContain('create_document');
    const tsv = await writeSiteFile(store, { path: 'docs/test-specs/001-x.tsv', content: 'a\tb' });
    expect(tsv.ok).toBe(false);
    if (!tsv.ok) expect(tsv.error).toContain('append_tsv_row');
    expect(await store.exists('docs/spec.md')).toBe(false);
    expect(await store.exists('docs/test-specs/001-x.tsv')).toBe(false);
  });

  it('宣言そのものは書き換えない', async () => {
    const store = webStore();
    const r = await writeSiteFile(store, { path: PROJECT_CONFIG_FILENAME, content: 'mode: web\n' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('declare_web_mode');
  });

  it('文字で書けないもの（画像・フォント）は断る', async () => {
    const store = webStore();
    for (const path of ['img/hero.png', 'fonts/noto.woff2']) {
      const r = await writeSiteFile(store, { path, content: 'PNG...' });
      expect(r.ok).toBe(false);
      expect(await store.exists(path)).toBe(false);
    }
  });

  it('拡張子の無いファイルは断る（一覧に出ないものを置かない）', async () => {
    const store = webStore();
    const r = await writeSiteFile(store, { path: 'Makefile', content: 'all:\n' });
    expect(r.ok).toBe(false);
  });

  it('フォルダの外へは書かない', async () => {
    const store = webStore();
    const r = await writeSiteFile(store, { path: '../evil.html', content: 'x' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(await store.exists('../evil.html')).toBe(false);
  });

  it('サイトが要る json / svg は書ける', async () => {
    const store = webStore();
    const json = await writeSiteFile(store, { path: 'manifest.json', content: '{}' });
    expect(json.ok).toBe(true);
    const svg = await writeSiteFile(store, { path: 'img/logo.svg', content: '<svg/>' });
    expect(svg.ok).toBe(true);
  });
});
