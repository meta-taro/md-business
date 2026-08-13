import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// 起動して画面が出るまでの時間は、最初に読む JS を全部読み終わるまで動かない。
// エディタ一式（CodeMirror + 構文解析）はその中で最も大きく、実測で元ソース約 1.5MB。
// 静的 import に戻すと、まだ何も開いていない時点でこれを全部読むことになり、
// 起動が黙って重くなる（大きさは画面のどこにも出ないので気づけない）。
const PAGE = fileURLToPath(new URL('../../routes/+page.svelte', import.meta.url));

describe('起動時に読むもの', () => {
  const source = readFileSync(PAGE, 'utf8');

  it('エディタ一式は静的 import しない', () => {
    expect(source).not.toMatch(/^\s*import\s+\w+\s+from\s+'\$lib\/editor\/CodeMirrorEditor\.svelte'/m);
  });

  it('エディタ一式は必要になってから読む', () => {
    expect(source).toMatch(/import\(\s*'\$lib\/editor\/CodeMirrorEditor\.svelte'\s*\)/);
  });
});
