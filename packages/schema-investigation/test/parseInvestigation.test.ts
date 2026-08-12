import { describe, it, expect } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { CompiledValidator } from '@md-business/core';
import {
  investigationSchema,
  parseInvestigationMarkdown,
  parseInvestigationObject,
} from '../src/index.js';

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(investigationSchema) as unknown as CompiledValidator;

const SHA = 'b'.repeat(64);

const MARKDOWN = `---
種別: ログ
文書番号: INV-2026-001
タイトル: ログイン失敗の急増
作成日時: '2026-08-12T09:30:00+09:00'
作成者:
  - 名前: 田中
    役割: 調査担当
対象ファイル:
  - パス: logs/app.jsonl
    ハッシュ: ${SHA}
使用ツール:
  - 名前: md-business mcp-server
    版: 0.9.0
調査時間帯:
  開始: '2026-08-11T00:00:00+09:00'
  終了: '2026-08-12T00:00:00+09:00'
所見:
  - 番号: F-01
    要約: 05:10 台に認証失敗が 12 件集中している
    深刻度: 高
    根拠:
      - evidence/EV-001.md
---

## 経緯

夜間バッチの直後から認証失敗が増えた。
`;

describe('parseInvestigationMarkdown', () => {
  it('accepts Japanese frontmatter and returns the canonical shape', () => {
    const result = parseInvestigationMarkdown(MARKDOWN, validate);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.investigation.kind).toBe('log');
    expect(result.investigation.status).toBe('investigating');
    expect(result.investigation.schema).toBe('investigation/v1');
    expect(result.investigation.targets[0]?.sha256).toBe(SHA);
    expect(result.investigation.findings?.[0]?.severity).toBe('high');
    expect(result.warnings).toEqual([]);
  });

  it('keeps the body after the frontmatter', () => {
    const result = parseInvestigationMarkdown(MARKDOWN, validate);
    if (!result.ok) throw new Error('expected ok');
    expect(result.body).toContain('## 経緯');
  });

  it('reports validation errors instead of throwing', () => {
    const result = parseInvestigationMarkdown('---\nタイトル: x\n---\n', validate);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects a finding whose evidence does not point at an Evidence file', () => {
    const broken = MARKDOWN.replace('evidence/EV-001.md', 'ログを見た感じ');
    const result = parseInvestigationMarkdown(broken, validate);
    expect(result.ok).toBe(false);
  });

  it('surfaces autofill warnings alongside a valid document', () => {
    const concluded = MARKDOWN.replace('種別: ログ', '種別: ログ\n状態: 完了').replace(
      /所見:[\s\S]*?evidence\/EV-001\.md\n/,
      '',
    );
    const result = parseInvestigationMarkdown(concluded, validate);
    expect(result.warnings.some((w) => w.path === 'findings')).toBe(true);
  });
});

describe('parseInvestigationObject', () => {
  it('takes an already-parsed frontmatter object', () => {
    const result = parseInvestigationObject(
      {
        種別: 'network',
        文書番号: 'INV-2026-002',
        タイトル: '外部 API のタイムアウト',
        作成日時: '2026-08-12T09:30:00+09:00',
        作成者: [{ 名前: '田中' }],
        対象ファイル: [{ パス: 'captures/api.har', ハッシュ: SHA }],
        使用ツール: [{ 名前: 'md-business mcp-server', 版: '0.9.0' }],
        調査時間帯: { 開始: '2026-08-11T00:00:00+09:00', 終了: '2026-08-12T00:00:00+09:00' },
      },
      validate,
    );
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.investigation.kind).toBe('network');
  });

  it('reports errors for an object that is missing its provenance', () => {
    const result = parseInvestigationObject({ タイトル: 'x' }, validate);
    expect(result.ok).toBe(false);
  });

  it('reports an over-nested object as a validation failure instead of throwing', () => {
    let deep: unknown = 'x';
    for (let i = 0; i < 50_000; i += 1) deep = [deep];
    let result: ReturnType<typeof parseInvestigationObject> | undefined;
    expect(() => {
      result = parseInvestigationObject({ 所見: deep }, validate);
    }).not.toThrow();
    expect(result?.ok).toBe(false);
    if (result?.ok === false) {
      expect(result.errors[0]?.keyword).toBe('maxDepth');
    }
  });
});
