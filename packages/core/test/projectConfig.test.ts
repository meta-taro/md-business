import { describe, it, expect } from 'vitest';
import {
  parseProjectConfig,
  PROJECT_CONFIG_FILENAME,
  type ProjectConfigResult,
} from '../src/projectConfig.js';

/** Problem kinds present in a result, in order. */
function kinds(result: ProjectConfigResult): string[] {
  return result.problems.map((p) => p.kind);
}

describe('PROJECT_CONFIG_FILENAME', () => {
  it('is the file the app looks for at the project root', () => {
    expect(PROJECT_CONFIG_FILENAME).toBe('md-business.yml');
  });
});

describe('parseProjectConfig — the default is the closed one', () => {
  it('treats an absent file as a business-document project', () => {
    const result = parseProjectConfig('');
    expect(result.config.mode).toBe('document');
    expect(result.problems).toEqual([]);
  });

  it('treats a comment-only file the same way', () => {
    const result = parseProjectConfig('# nothing declared yet\n');
    expect(result.config.mode).toBe('document');
    expect(result.problems).toEqual([]);
  });

  it('reads an explicit web declaration', () => {
    const result = parseProjectConfig('mode: web\n');
    expect(result.config.mode).toBe('web');
    expect(result.problems).toEqual([]);
  });

  it('reads an explicit document declaration', () => {
    const result = parseProjectConfig('mode: document\n');
    expect(result.config.mode).toBe('document');
    expect(result.problems).toEqual([]);
  });
});

describe('parseProjectConfig — anything unclear falls back to no scripts', () => {
  it('falls back when the mode is a word it does not know', () => {
    const result = parseProjectConfig('mode: wild\n');
    expect(result.config.mode).toBe('document');
    expect(kinds(result)).toEqual(['unknown-mode']);
  });

  it('falls back when the mode is not written as text', () => {
    const result = parseProjectConfig('mode: true\n');
    expect(result.config.mode).toBe('document');
    expect(kinds(result)).toEqual(['unknown-mode']);
  });

  it('falls back when the YAML does not parse, and never throws', () => {
    const result = parseProjectConfig('mode: [web\n');
    expect(result.config.mode).toBe('document');
    expect(kinds(result)).toEqual(['unreadable']);
  });

  it('falls back when the file is a list instead of a mapping', () => {
    const result = parseProjectConfig('- mode: web\n');
    expect(result.config.mode).toBe('document');
    expect(kinds(result)).toEqual(['not-a-mapping']);
  });

  it('says what to write, not just that it is wrong', () => {
    const result = parseProjectConfig('mode: wild\n');
    expect(result.problems[0]?.message).toContain('web');
    expect(result.problems[0]?.message).toContain('document');
  });
});

describe('parseProjectConfig — the YAML limits are the same as frontmatter', () => {
  it('refuses a file too large to be one a person wrote', () => {
    const result = parseProjectConfig(`mode: web\nnote: ${'x'.repeat(300_000)}\n`);
    expect(result.config.mode).toBe('document');
    expect(kinds(result)).toEqual(['unreadable']);
  });

  it('refuses a file that reuses anchors enough to expand', () => {
    const anchors = Array.from({ length: 12 }, (_, i) => `a${i}: &a${i} [x]`).join('\n');
    const result = parseProjectConfig(`mode: web\n${anchors}\n`);
    expect(result.config.mode).toBe('document');
    expect(kinds(result)).toEqual(['unreadable']);
  });
});

describe('parseProjectConfig — where scripts may come from', () => {
  it('is empty when web mode declares no extra origin', () => {
    const result = parseProjectConfig('mode: web\n');
    expect(result.config.scriptOrigins).toEqual([]);
  });

  it('keeps origins served over https', () => {
    const result = parseProjectConfig(
      'mode: web\nweb:\n  scriptOrigins:\n    - https://cdn.example.com\n',
    );
    expect(result.config.scriptOrigins).toEqual(['https://cdn.example.com']);
    expect(result.problems).toEqual([]);
  });

  it('has no way to write "allow everything"', () => {
    const result = parseProjectConfig('mode: web\nweb:\n  scriptOrigins:\n    - "*"\n');
    expect(result.config.scriptOrigins).toEqual([]);
    expect(kinds(result)).toEqual(['origin-rejected']);
  });

  it('drops the CSP keywords that would re-open inline scripts', () => {
    const result = parseProjectConfig(
      'mode: web\nweb:\n  scriptOrigins:\n    - "unsafe-inline"\n    - "unsafe-eval"\n    - "data:"\n',
    );
    expect(result.config.scriptOrigins).toEqual([]);
    expect(kinds(result)).toEqual(['origin-rejected', 'origin-rejected', 'origin-rejected']);
  });

  it('drops a plain-text origin, because anyone on the path can replace the script', () => {
    const result = parseProjectConfig(
      'mode: web\nweb:\n  scriptOrigins:\n    - http://cdn.example.com\n',
    );
    expect(result.config.scriptOrigins).toEqual([]);
    expect(kinds(result)).toEqual(['origin-rejected']);
  });

  it('allows plain text only for the machine you are sitting at', () => {
    const result = parseProjectConfig(
      'mode: web\nweb:\n  scriptOrigins:\n    - http://localhost:5173\n    - http://127.0.0.1:8080\n',
    );
    expect(result.config.scriptOrigins).toEqual(['http://localhost:5173', 'http://127.0.0.1:8080']);
    expect(result.problems).toEqual([]);
  });

  it('drops an entry carrying a path, and says to write the origin alone', () => {
    const result = parseProjectConfig(
      'mode: web\nweb:\n  scriptOrigins:\n    - https://cdn.example.com/lib/v1.js\n',
    );
    expect(result.config.scriptOrigins).toEqual([]);
    expect(kinds(result)).toEqual(['origin-rejected']);
    expect(result.problems[0]?.message).toContain('https://cdn.example.com');
  });

  it('keeps one copy of an origin written twice', () => {
    const result = parseProjectConfig(
      'mode: web\nweb:\n  scriptOrigins:\n    - https://cdn.example.com\n    - https://cdn.example.com/\n',
    );
    expect(result.config.scriptOrigins).toEqual(['https://cdn.example.com']);
  });

  it('reports a scriptOrigins that is not a list', () => {
    const result = parseProjectConfig('mode: web\nweb:\n  scriptOrigins: https://cdn.example.com\n');
    expect(result.config.scriptOrigins).toEqual([]);
    expect(kinds(result)).toEqual(['bad-script-origins']);
  });

  it('ignores origins declared by a document-mode project', () => {
    const result = parseProjectConfig(
      'mode: document\nweb:\n  scriptOrigins:\n    - https://cdn.example.com\n',
    );
    expect(result.config.mode).toBe('document');
    expect(result.config.scriptOrigins).toEqual([]);
  });
});
