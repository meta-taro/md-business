import { describe, it, expect } from 'vitest';
import { resolveClassification, renderSpecFileName } from '../src/index.js';
import type { Spec } from '../src/index.js';

const base = { documentNumber: 'SPEC-2026-001', version: '1.0' } as Spec;

describe('resolveClassification', () => {
  it('uses classification in the internal edition', () => {
    expect(resolveClassification({ ...base, classification: '社外秘' }, 'internal')).toBe('社外秘');
  });

  it('is empty in the internal edition when unset', () => {
    expect(resolveClassification(base, 'internal')).toBe('');
  });

  it('falls back to 提出用 in the submission edition', () => {
    expect(resolveClassification({ ...base, classification: '社外秘' }, 'submission')).toBe('提出用');
  });

  it('prefers submissionClassification in the submission edition', () => {
    const spec = { ...base, classification: '社外秘', submissionClassification: '顧客提出用' };
    expect(resolveClassification(spec, 'submission')).toBe('顧客提出用');
  });
});

describe('renderSpecFileName — edition', () => {
  it('fills {区分} with the submission classification', () => {
    const spec = { ...base, classification: '社外秘' };
    expect(renderSpecFileName(spec, '{区分}_{文書番号}', 'submission')).toBe('提出用_SPEC-2026-001');
    expect(renderSpecFileName(spec, '{区分}_{文書番号}')).toBe('社外秘_SPEC-2026-001');
  });
});
