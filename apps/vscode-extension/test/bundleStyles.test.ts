import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../../chrome-extension/src/plugins/index.js';

// bundle.mjs は読み込むとビルドが走るので、配る CSS の一覧は本文から読む。
function bundledStyles(): string[] {
  const source = readFileSync(resolve(__dirname, '../scripts/bundle.mjs'), 'utf8');
  const list = /const STYLES = \[([^\]]*)\]/.exec(source)?.[1] ?? '';
  return [...list.matchAll(/'([^']+)'/g)].map((m) => m[1] as string);
}

describe('bundle.mjs', () => {
  it('ships the stylesheet of every document type the preview can draw', () => {
    const shipped = bundledStyles();
    const wanted = createDefaultRegistry()
      .list()
      .map((plugin) => /^styles\/(.+)\.css$/.exec(plugin.stylesHref)?.[1]);
    for (const name of wanted) {
      expect(shipped).toContain(name);
    }
  });
});
