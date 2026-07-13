import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import * as main from '../src/main.js';

/**
 * Apps Script は esbuild.config.mjs の TRIGGER_NAMES に列挙された top-level
 * function しか google.script.run から呼べない。リストは手書きのため、
 * サーバー関数を追加して sidebar.html から呼んでもリスト追加を忘れると
 * 「実機だけでサイレントにクラッシュ」する（2026-07-03 実機で発生）。
 * ここで sidebar.html ⊆ TRIGGER_NAMES を機械検証して再発を防ぐ。
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configText = readFileSync(resolve(ROOT, 'esbuild.config.mjs'), 'utf8');
const sidebarHtml = readFileSync(resolve(ROOT, 'src', 'sidebar.html'), 'utf8');

function extractTriggerNames(text: string): string[] {
  const block = /const TRIGGER_NAMES = \[([\s\S]*?)\];/.exec(text);
  if (!block) throw new Error('TRIGGER_NAMES array not found in esbuild.config.mjs');
  const body = block[1] ?? '';
  return [...body.matchAll(/'([A-Za-z_$][\w$]*)'/g)].flatMap((m) =>
    typeof m[1] === 'string' ? [m[1]] : [],
  );
}

describe('Apps Script entrypoint exposure (esbuild footer)', () => {
  const triggerNames = extractTriggerNames(configText);

  it('exposes every main.ts server function that sidebar.html calls', () => {
    const exportedFns = Object.entries(main)
      .filter(([, v]) => typeof v === 'function')
      .map(([k]) => k);
    const calledFromSidebar = exportedFns.filter((name) =>
      sidebarHtml.includes(`.${name}(`),
    );
    expect(calledFromSidebar.length).toBeGreaterThan(0);
    const missing = calledFromSidebar.filter((name) => !triggerNames.includes(name));
    expect(missing).toEqual([]);
  });

  it('only lists names that actually exist as main.ts exports', () => {
    const unknown = triggerNames.filter(
      (name) => typeof (main as Record<string, unknown>)[name] !== 'function',
    );
    expect(unknown).toEqual([]);
  });

  it('forwards all arguments in the footer wrappers (multi-arg server functions)', () => {
    // appendTestSpecColumn(src, name, type, values) など複数引数の関数があるため、
    // ラッパーが第 1 引数しか転送しない `(e)` 形では実機で壊れる。
    expect(configText).toContain('...args');
  });
});
