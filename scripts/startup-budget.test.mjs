import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { startupScripts, toBuildPath, summarize, formatKb } from './startup-budget.mjs';

const INDEX_HTML = `<!doctype html>
<html>
  <head>
    <script>
      document.documentElement.dataset.theme = 'light';
    </script>
    <link href="/_app/immutable/entry/start.AAAA.js" rel="modulepreload">
    <link href="/_app/immutable/chunks/BBBB.js" rel="modulepreload">
    <link href="/_app/immutable/entry/app.CCCC.js" rel="modulepreload">
    <link href="/_app/immutable/assets/0.DDDD.css" rel="stylesheet">
  </head>
  <body>
    <script>
      Promise.all([
        import("/_app/immutable/entry/start.AAAA.js"),
        import("/_app/immutable/entry/app.CCCC.js")
      ]).then(([kit, app]) => kit.start(app, element));
    </script>
  </body>
</html>`;

test('起動時に読む JS を宣言順に拾う', () => {
  assert.deepEqual(startupScripts(INDEX_HTML), [
    '/_app/immutable/entry/start.AAAA.js',
    '/_app/immutable/chunks/BBBB.js',
    '/_app/immutable/entry/app.CCCC.js',
  ]);
});

test('スタイルシートは数えない', () => {
  assert.ok(!startupScripts(INDEX_HTML).some((href) => href.endsWith('.css')));
});

test('modulepreload に無く import() だけにある入口も拾う', () => {
  const html = `<script>import("/_app/immutable/entry/only.EEEE.js")</script>`;
  assert.deepEqual(startupScripts(html), ['/_app/immutable/entry/only.EEEE.js']);
});

test('遅延読み込みのチャンクは数えない', () => {
  // 文書を開いてから読む chunk は index.html から参照されない。
  const html = `${INDEX_HTML}<!-- /_app/immutable/chunks/lazy.FFFF.js -->`;
  assert.ok(!startupScripts(html).includes('/_app/immutable/chunks/lazy.FFFF.js'));
});

test('先頭の / を落として build 配下のパスにする', () => {
  assert.equal(
    toBuildPath('/tmp/build', '/_app/immutable/entry/start.AAAA.js'),
    join('/tmp/build', '_app/immutable/entry/start.AAAA.js'),
  );
});

test('合計と、大きい順の内訳を返す', () => {
  const { total, files } = summarize([
    { href: 'a.js', bytes: 100 },
    { href: 'b.js', bytes: 300 },
    { href: 'c.js', bytes: 200 },
  ]);
  assert.equal(total, 600);
  assert.deepEqual(
    files.map((f) => f.href),
    ['b.js', 'c.js', 'a.js'],
  );
});

test('バイト数を KB で表す', () => {
  assert.equal(formatKb(1024), '1 KB');
  assert.equal(formatKb(1536), '2 KB');
});
