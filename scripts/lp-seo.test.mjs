// 公開サイト（docs/）を検索エンジンと AI に読ませるための部品の検査。
//
// sitemap は手で書いているので、ページを足したときに載せ忘れるとそのページは見つけてもらえない。
// 構造化データ（JSON-LD）は壊れていても画面には何も出ないので、ここで構文と中身を確かめる。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DOCS = fileURLToPath(new URL('../docs/', import.meta.url));
const BASE = 'https://meta-taro.github.io/md-business/';

function htmlPages(dir = DOCS) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...htmlPages(p));
    else if (name === 'index.html') out.push(p);
  }
  return out;
}

function pageUrl(file) {
  const rel = relative(DOCS, file).split(sep).join('/');
  return BASE + rel.replace(/index\.html$/, '');
}

function jsonLd(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}

function sitemapUrls() {
  const xml = readFileSync(join(DOCS, 'sitemap.xml'), 'utf8');
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

function text(html) {
  return html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

test('sitemap は公開しているページをすべて載せ、無いページを載せない', () => {
  const listed = sitemapUrls();
  const pages = htmlPages().map(pageUrl);
  assert.deepEqual([...listed].sort(), [...pages].sort());
});

test('robots.txt はクロールを止めず、sitemap の在り処を示す', () => {
  const robots = readFileSync(join(DOCS, 'robots.txt'), 'utf8');
  assert.match(robots, /^User-agent: \*$/m);
  assert.doesNotMatch(robots, /^Disallow: \/\s*$/m);
  assert.match(robots, new RegExp(`^Sitemap: ${BASE}sitemap\\.xml$`, 'm'));
});

test('どのページの JSON-LD も構文として読め、schema.org を名乗る', () => {
  for (const file of htmlPages()) {
    for (const block of jsonLd(readFileSync(file, 'utf8'))) {
      const data = JSON.parse(block);
      assert.equal(data['@context'], 'https://schema.org', file);
    }
  }
});

for (const [name, file] of [['英語', 'index.html'], ['日本語', join('ja', 'index.html')]]) {
  test(`${name}のトップは製品と FAQ を構造化データで持ち、FAQ は画面にも同じ文で出ている`, () => {
    const html = readFileSync(join(DOCS, file), 'utf8');
    const blocks = jsonLd(html).map((b) => JSON.parse(b));
    const app = blocks.find((b) => b['@type'] === 'SoftwareApplication');
    assert.ok(app, 'SoftwareApplication が無い');
    assert.equal(app.name, 'md-business');
    assert.equal(app.offers?.price, '0');
    assert.match(app.operatingSystem, /Windows/);
    assert.match(app.operatingSystem, /macOS/);

    const faq = blocks.find((b) => b['@type'] === 'FAQPage');
    assert.ok(faq, 'FAQPage が無い');
    assert.ok(faq.mainEntity.length >= 3);
    // 構造化データにだけ書いて画面に無い問答は、検索エンジンの指針に反する。
    const visible = text(html);
    for (const q of faq.mainEntity) {
      assert.ok(visible.includes(q.name), `画面に無い問い: ${q.name}`);
      assert.ok(visible.includes(q.acceptedAnswer.text), `画面に無い答え: ${q.name}`);
    }
  });
}

test('llms.txt は製品名で始まり、指しているサイト内のページが実在する', () => {
  const llms = readFileSync(join(DOCS, 'llms.txt'), 'utf8');
  assert.match(llms, /^# md-business\n/);
  assert.match(llms, /^> .+/m);
  const links = [...llms.matchAll(/\]\((https:[^)]+)\)/g)].map((m) => m[1]).filter((u) => u.startsWith(BASE));
  assert.ok(links.length > 0);
  for (const u of links) {
    const rel = u.slice(BASE.length);
    assert.ok(existsSync(join(DOCS, rel, rel.endsWith('/') || rel === '' ? 'index.html' : '')), `無いページ: ${u}`);
  }
});

test('ロードマップのページがあり、日英どちらのトップからも辿れる', () => {
  assert.ok(existsSync(join(DOCS, 'roadmap', 'index.html')), 'roadmap/index.html が無い');
  assert.match(readFileSync(join(DOCS, 'ja', 'index.html'), 'utf8'), /href="\.\.\/roadmap\/"/);
  assert.match(readFileSync(join(DOCS, 'index.html'), 'utf8'), /href="roadmap\/"/);
});

test('事例のページが 2 本あり、どれも使うもの・見つかるもの・直し方を持ち、日本語のトップから辿れる', () => {
  const ja = readFileSync(join(DOCS, 'ja', 'index.html'), 'utf8');
  assert.match(ja, /href="\.\.\/cases\/"/);
  const index = readFileSync(join(DOCS, 'cases', 'index.html'), 'utf8');
  for (const slug of ['web-form-failure', 'spec-sheet-gap']) {
    const file = join(DOCS, 'cases', slug, 'index.html');
    assert.ok(existsSync(file), `cases/${slug}/index.html が無い`);
    assert.match(index, new RegExp(`href="${slug}/"`));
    const body = text(readFileSync(file, 'utf8'));
    for (const label of ['使うもの', '見つかるもの', '直し方']) assert.ok(body.includes(label), `${slug} に ${label} が無い`);
  }
});
