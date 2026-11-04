import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// .vscodeignore は「全部外して、要るものだけ戻す」書き方なので、戻し忘れた出力は黙って配布物から落ちる。
function shippedPaths(): string[] {
  const source = readFileSync(resolve(__dirname, '../.vscodeignore'), 'utf8');
  return source
    .split(/\r?\n/)
    .filter((line) => line.startsWith('!'))
    .map((line) => line.slice(1).trim());
}

function bundleOutputs(): string[] {
  const source = readFileSync(resolve(__dirname, '../scripts/bundle.mjs'), 'utf8');
  return [...source.matchAll(/outfile: resolve\(ROOT, '([^']+)'\)/g)].map((m) => m[1] as string);
}

describe('.vscodeignore', () => {
  it('ships every script the bundle writes', () => {
    const outputs = bundleOutputs();
    expect(outputs.length).toBeGreaterThan(0);
    const shipped = shippedPaths();
    for (const output of outputs) {
      expect(shipped).toContain(output);
    }
  });
});
