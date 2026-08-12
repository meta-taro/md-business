import { describe, it, expect } from 'vitest';
import { parseAndValidate } from '@md-business/core/runtime';
import { investigationSchema, SCHEMA_VERSION } from '../src/index.js';
import type { Investigation } from '../src/index.js';

const SHA = 'a'.repeat(64);

function buildInvestigation(): Record<string, unknown> {
  return {
    schema: 'investigation/v1',
    kind: 'log',
    documentNumber: 'INV-2026-001',
    title: 'ログイン失敗の急増',
    createdAt: '2026-08-12T09:30:00+09:00',
    status: 'investigating',
    authors: [{ name: '田中', role: '調査担当' }],
    targets: [{ path: 'logs/app.jsonl', sha256: SHA }],
    tools: [{ name: 'md-business mcp-server', version: '0.9.0' }],
    window: { from: '2026-08-11T00:00:00+09:00', to: '2026-08-12T00:00:00+09:00' },
    findings: [
      {
        id: 'F-01',
        summary: '05:10 台に認証失敗が 12 件集中している',
        evidence: ['evidence/EV-001.md'],
      },
    ],
  };
}

function toFrontmatter(data: Record<string, unknown>): string {
  const yaml = Object.entries(data)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join('\n');
  return `---\n${yaml}\n---\n`;
}

function validateDoc(data: Record<string, unknown>) {
  return parseAndValidate<Investigation>(toFrontmatter(data), investigationSchema);
}

describe('investigationSchema constants', () => {
  it('exports the schema as an object', () => {
    expect(typeof investigationSchema).toBe('object');
  });

  it('exposes SCHEMA_VERSION constant', () => {
    expect(SCHEMA_VERSION).toBe('investigation/v1');
  });
});

describe('investigationSchema — happy path', () => {
  it('validates a minimal complete investigation', () => {
    expect(validateDoc(buildInvestigation()).ok).toBe(true);
  });

  it.each(['log', 'network'])('accepts kind %s', (kind) => {
    expect(validateDoc({ ...buildInvestigation(), kind }).ok).toBe(true);
  });

  it.each(['investigating', 'concluded', 'suspended'])('accepts status %s', (status) => {
    expect(validateDoc({ ...buildInvestigation(), status }).ok).toBe(true);
  });

  it.each(['high', 'medium', 'low', 'info'])('accepts severity %s on a finding', (severity) => {
    const data = buildInvestigation();
    (data.findings as Array<Record<string, unknown>>)[0]!.severity = severity;
    expect(validateDoc(data).ok).toBe(true);
  });

  it('accepts the optional fields', () => {
    const data = {
      ...buildInvestigation(),
      reviewers: [{ name: '山田' }],
      relatedDocs: ['./../specs/auth.md'],
      summary: '認証基盤の一時的な失敗',
      theme: '青',
      fileName: '調査報告書_{文書番号}',
    };
    expect(validateDoc(data).ok).toBe(true);
  });

  it('accepts a target with an optional note', () => {
    const data = buildInvestigation();
    (data.targets as Array<Record<string, unknown>>)[0]!.note = '本番機から取得';
    expect(validateDoc(data).ok).toBe(true);
  });
});

describe('investigationSchema — 出どころを欠いた文書を通さない', () => {
  it.each([
    'kind',
    'documentNumber',
    'title',
    'createdAt',
    'status',
    'authors',
    'targets',
    'tools',
    'window',
  ])('rejects a document missing %s', (key) => {
    const data = buildInvestigation();
    delete data[key];
    expect(validateDoc(data).ok).toBe(false);
  });

  it('rejects an empty targets list', () => {
    expect(validateDoc({ ...buildInvestigation(), targets: [] }).ok).toBe(false);
  });

  it('rejects a target without a SHA-256', () => {
    const data = { ...buildInvestigation(), targets: [{ path: 'logs/app.jsonl' }] };
    expect(validateDoc(data).ok).toBe(false);
  });

  it.each(['deadbeef', `${SHA}00`, 'A'.repeat(64), `${'a'.repeat(63)}g`])(
    'rejects a malformed SHA-256 (%s)',
    (sha256) => {
      const data = { ...buildInvestigation(), targets: [{ path: 'logs/app.jsonl', sha256 }] };
      expect(validateDoc(data).ok).toBe(false);
    },
  );

  it('rejects an empty tools list', () => {
    expect(validateDoc({ ...buildInvestigation(), tools: [] }).ok).toBe(false);
  });

  it('rejects a tool without a version', () => {
    const data = { ...buildInvestigation(), tools: [{ name: 'jq' }] };
    expect(validateDoc(data).ok).toBe(false);
  });

  it('rejects a window missing an end', () => {
    const data = { ...buildInvestigation(), window: { from: '2026-08-11T00:00:00+09:00' } };
    expect(validateDoc(data).ok).toBe(false);
  });

  it('rejects a non-datetime window bound', () => {
    const data = {
      ...buildInvestigation(),
      window: { from: '2026-08-11', to: '2026-08-12T00:00:00+09:00' },
    };
    expect(validateDoc(data).ok).toBe(false);
  });

  it('rejects a non-datetime createdAt', () => {
    expect(validateDoc({ ...buildInvestigation(), createdAt: '2026-08-12' }).ok).toBe(false);
  });
});

describe('investigationSchema — 根拠なしの所見を通さない', () => {
  it('rejects a finding with no evidence key', () => {
    const data = {
      ...buildInvestigation(),
      findings: [{ id: 'F-01', summary: '認証失敗が集中している' }],
    };
    expect(validateDoc(data).ok).toBe(false);
  });

  it('rejects a finding with an empty evidence list', () => {
    const data = {
      ...buildInvestigation(),
      findings: [{ id: 'F-01', summary: '認証失敗が集中している', evidence: [] }],
    };
    expect(validateDoc(data).ok).toBe(false);
  });

  it.each([
    'ログを見た感じ',
    'EV-001.md',
    'evidence/EV-1.md',
    '../evidence/EV-001.md',
    'evidence/EV-001.txt',
  ])('rejects an evidence reference that is not a saved Evidence (%s)', (ref) => {
    const data = {
      ...buildInvestigation(),
      findings: [{ id: 'F-01', summary: '認証失敗が集中している', evidence: [ref] }],
    };
    expect(validateDoc(data).ok).toBe(false);
  });

  it('accepts an evidence reference produced by save_evidence', () => {
    const data = {
      ...buildInvestigation(),
      findings: [
        { id: 'F-01', summary: '認証失敗が集中している', evidence: ['evidence/EV-1234.md'] },
      ],
    };
    expect(validateDoc(data).ok).toBe(true);
  });

  it('rejects a finding without a summary', () => {
    const data = {
      ...buildInvestigation(),
      findings: [{ id: 'F-01', evidence: ['evidence/EV-001.md'] }],
    };
    expect(validateDoc(data).ok).toBe(false);
  });

  it('rejects a malformed finding id', () => {
    const data = {
      ...buildInvestigation(),
      findings: [{ id: '1', summary: '認証失敗', evidence: ['evidence/EV-001.md'] }],
    };
    expect(validateDoc(data).ok).toBe(false);
  });

  it('accepts an empty findings list (調査中はまだ所見が無い)', () => {
    expect(validateDoc({ ...buildInvestigation(), findings: [] }).ok).toBe(true);
  });
});

describe('investigationSchema — 未知のキーを通さない', () => {
  it('rejects an unknown root key', () => {
    expect(validateDoc({ ...buildInvestigation(), 未知: 'x' }).ok).toBe(false);
  });

  it('rejects an unknown key inside a target', () => {
    const data = {
      ...buildInvestigation(),
      targets: [{ path: 'logs/app.jsonl', sha256: SHA, size: 1024 }],
    };
    expect(validateDoc(data).ok).toBe(false);
  });

  it('rejects a wrong schema id', () => {
    expect(validateDoc({ ...buildInvestigation(), schema: 'spec/v1' }).ok).toBe(false);
  });

  it.each(['file', 'ログ', ''])('rejects kind %s', (kind) => {
    expect(validateDoc({ ...buildInvestigation(), kind }).ok).toBe(false);
  });
});
