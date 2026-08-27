import { describe, it, expect } from 'vitest';
import { PROJECT_CONFIG_FILENAME, WEB_MODE_DECLARATION } from '@md-business/core';
import { MemoryDocumentStore } from './store.js';
import { writeSiteFile, readSiteFile, listSiteFiles } from './siteFiles.js';

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

  // 書いた結果は利用者が開いている面にそのまま映る。別の窓を開けと返すと、
  // 書くたびに窓を行き来することになる。
  it('見る先を別の窓にしない', async () => {
    const store = webStore();
    const r = await writeSiteFile(store, { path: 'index.html', content: '<h1>やあ</h1>' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.summary).not.toContain('ブラウザ');
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

describe('readSiteFile', () => {
  it('中身をそのまま返す（書き戻しても元と同じになるように）', async () => {
    // 伏せ字や行の切り詰めが入ると、読んで直して書き戻したときに
    // 触っていないはずの箇所（連絡先など）まで書き換わってしまう。
    const body = '<footer>contact@example.com</footer>\n';
    const store = webStore({ 'index.html': body });
    const r = await readSiteFile(store, { path: 'index.html' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.path).toBe('index.html');
    expect(r.content).toBe(body);
  });

  it('宣言の無いフォルダでは読まず、宣言の口を案内する', async () => {
    const store = new MemoryDocumentStore({ 'index.html': '<h1>やあ</h1>' });
    const r = await readSiteFile(store, { path: 'index.html' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('declare_web_mode');
  });

  it('業務文書（.md / .tsv）は専用の口へ回す', async () => {
    const store = webStore({ 'docs/spec.md': '# 仕様', 'docs/test-specs/001-x.tsv': 'a	b' });
    const md = await readSiteFile(store, { path: 'docs/spec.md' });
    expect(md.ok).toBe(false);
    if (!md.ok) expect(md.error).toContain('read_document');
    const tsv = await readSiteFile(store, { path: 'docs/test-specs/001-x.tsv' });
    expect(tsv.ok).toBe(false);
    if (!tsv.ok) expect(tsv.error).toContain('read_tsv');
  });

  it('文字にならないもの・フォルダの外は断る', async () => {
    const store = webStore({ 'img/hero.png': 'PNG...' });
    expect((await readSiteFile(store, { path: 'img/hero.png' })).ok).toBe(false);
    expect((await readSiteFile(store, { path: '../evil.html' })).ok).toBe(false);
  });

  it('無いファイルは、無いと分かる形で返す', async () => {
    const store = webStore();
    const r = await readSiteFile(store, { path: 'index.html' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('index.html');
  });
});

describe('listSiteFiles', () => {
  it('触れる部品だけを並べる（業務文書・宣言・画像は入らない）', async () => {
    // 一覧に別の口が持つものを混ぜると、そのまま read_site_file へ渡して断られる。
    const store = webStore({
      'index.html': '',
      'assets/app.js': '',
      'img/hero.png': '',
      'docs/spec.md': '',
      'Makefile': '',
    });
    const r = await listSiteFiles(store);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.files).toEqual(['assets/app.js', 'index.html']);
  });

  it('宣言の無いフォルダでは並べず、宣言の口を案内する', async () => {
    const store = new MemoryDocumentStore({ 'index.html': '' });
    const r = await listSiteFiles(store);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('declare_web_mode');
  });

  it('まだ何も無いフォルダは空で返す（断らない）', async () => {
    // ここで断ると、これから作る場面と、名乗っていない場面の区別が付かなくなる。
    const r = await listSiteFiles(webStore());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.files).toEqual([]);
  });
});
