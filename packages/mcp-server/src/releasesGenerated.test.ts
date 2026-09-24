import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { EMBEDDED_RELEASES } from './generated/releases.js';
import { APP_IDS } from './about.js';

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('焼き込んだ変更履歴', () => {
  it('CHANGELOG と食い違っていない（--check が通る）', () => {
    // 生成の中身をここで組み直すと、同じ間違いを 2 回書くだけになる。
    // 判定はスクリプト自身に任せ、このテストは「commit されたものが古くないか」だけを見る。
    expect(() =>
      execFileSync(process.execPath, [join(PKG_ROOT, 'scripts', 'generate-about.mjs'), '--check'], {
        stdio: 'pipe',
      }),
    ).not.toThrow();
  });

  it('配布物 3 つとも、版と直近の履歴が入っている', () => {
    for (const id of APP_IDS) {
      const app = EMBEDDED_RELEASES[id];
      expect(app.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(app.releases.length).toBeGreaterThan(0);
      // package.json の版が CHANGELOG の先頭に無いのは、書き忘れか bump 忘れのどちらか。
      expect(app.releases[0]?.version).toBe(app.version);
    }
  });
});
