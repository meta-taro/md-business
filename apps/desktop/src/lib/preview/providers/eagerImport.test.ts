import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * provider を静的 import しているファイルが無いことの確認。
 *
 * lazy.test.ts は「読み込み口を通った回数」しか見ていない。誰かが provider を静的
 * import に戻すと、束ねる側がそれを 1 つの塊にまとめてしまい、読み込み口を通らないまま
 * 全部が読まれる。そうなっても lazy.test.ts は緑のままなので、書いてある形の側も見る。
 */
describe('読み込み口を通さない参照が無いか', () => {
  const dir = fileURLToPath(new URL('.', import.meta.url));
  const IMPLS = [
    'invoice',
    'testSpec',
    'dbSpec',
    'nosqlDbSpec',
    'apiSpec',
    'investigation',
    'spec',
  ];
  /** 実装そのものと、その中身を確かめるテストは対象外。 */
  const EXEMPT = new Set([...IMPLS.map((n) => `${n}.ts`), 'lazy.test.ts']);

  it('どのファイルも provider を静的 import しない', () => {
    const root = resolve(dir, '../../..');
    const offenders: string[] = [];
    for (const file of walk(root)) {
      if (EXEMPT.has(basename(file))) continue;
      const source = readFileSync(file, 'utf8');
      for (const name of IMPLS) {
        // `import(...)` は行頭の import 文と形が違うので、行頭の import 文だけを見る。
        // 型だけの import は束ねる前に消えるので数えない。
        const pattern = new RegExp(
          `^\\s*import\\s+(?!type\\b)[^;]*'(?:\\./|[^']*providers/)${name}'`,
          'm',
        );
        if (pattern.test(source)) offenders.push(`${relative(root, file)} → ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.svelte')) yield full;
  }
}
