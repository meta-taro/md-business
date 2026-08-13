import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * ウィンドウ権限（`src-tauri/capabilities/default.json`）の取りこぼし検査。
 *
 * opener プラグインの `allow-open-url` / `allow-reveal-item-in-dir` は
 * **コマンドを呼べるようにするだけ**で、許可する URL・パスは持たない
 * （ACL 定義の文言が "without any pre-configured scope"）。実際の照合は
 * `is_url_allowed` / `is_path_allowed` が許可エントリの一覧に対して行い、
 * **エントリが 0 件なら必ず拒否**になる。
 *
 * この取り合わせを間違えると、ビルドも型検査も通り、画面にも何も出ないまま
 * 「押しても無反応」になる（呼び出し側は失敗を握り潰していることが多い）。
 * 人が触るまで気づけないので、権限の宣言だけで機械的に検出する。
 */

interface ScopeEntry {
  url?: string;
  path?: string;
}

type Permission = string | { identifier: string; allow?: ScopeEntry[]; deny?: ScopeEntry[] };

const capability = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../src-tauri/capabilities/default.json', import.meta.url)), 'utf8'),
) as { permissions: Permission[] };

function identifiers(): string[] {
  return capability.permissions.map((entry) => (typeof entry === 'string' ? entry : entry.identifier));
}

function scopeOf(identifier: string): ScopeEntry[] {
  return capability.permissions.flatMap((entry) =>
    typeof entry === 'string' || entry.identifier !== identifier ? [] : (entry.allow ?? []),
  );
}

describe('メインウィンドウの権限', () => {
  it('openUrl を使うなら http/https のスコープを持つ', () => {
    if (!identifiers().includes('opener:allow-open-url')) return;

    // 既定 URL 一式（mailto: / tel: / http:// / https://）を足すか、自分でスコープを書くか。
    const hasDefaults = identifiers().includes('opener:allow-default-urls');
    const hasOwn = scopeOf('opener:allow-open-url').some((entry) =>
      (entry.url ?? '').startsWith('https://'),
    );

    expect(hasDefaults || hasOwn).toBe(true);
  });

  it('revealItemInDir を使うならパスのスコープを持つ', () => {
    if (!identifiers().includes('opener:allow-reveal-item-in-dir')) return;

    expect(scopeOf('opener:allow-reveal-item-in-dir').some((entry) => entry.path !== undefined)).toBe(
      true,
    );
  });
});
