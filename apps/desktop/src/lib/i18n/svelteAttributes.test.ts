import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 画面の文言は辞書へ通す約束だが、`title` / `aria-label` / `placeholder` は本文と違って
// 目で追いにくく、日本語のまま置き去りにされやすい（検証グリッドが実際にそうなった）。
// 属性の中身に日本語が直書きされていないことを、ここで機械的に押さえる。

const SRC = fileURLToPath(new URL('../../', import.meta.url));
const JAPANESE = /[ぁ-んァ-ヶ一-龥]/;
const LOCALIZED_ATTRIBUTE = /(?:title|aria-label|placeholder)="([^"]*)"/g;

function svelteFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) svelteFiles(path, acc);
    else if (entry.name.endsWith('.svelte')) acc.push(path);
  }
  return acc;
}

describe('画面の属性文言', () => {
  const files = svelteFiles(SRC);

  it('走査対象の .svelte がある（探索そのものが空振りしていないこと）', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('title / aria-label / placeholder に日本語を直書きしていない', () => {
    const leftovers: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(LOCALIZED_ATTRIBUTE)) {
        const value = match[1] ?? '';
        if (JAPANESE.test(value)) leftovers.push(`${file.slice(SRC.length)}: ${value}`);
      }
    }
    expect(leftovers).toEqual([]);
  });
});
