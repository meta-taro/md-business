import { describe, it, expect } from 'vitest';
import { detectDataFormat, readDataFile } from '../src/index.js';

describe('detectDataFormat', () => {
  it('recognises the two data formats regardless of case', () => {
    expect(detectDataFormat('camt.053.XML')).toBe('xml');
    expect(detectDataFormat('export.json')).toBe('json');
  });

  it('leaves the formats this package does not read alone', () => {
    expect(detectDataFormat('invoice.md')).toBeNull();
    expect(detectDataFormat('001-login.tsv')).toBeNull();
    expect(detectDataFormat('README')).toBeNull();
  });
});

describe('readDataFile', () => {
  it('picks the reader from the file name', () => {
    const json = readDataFile('a.json', '{"a":1}');
    expect(json.ok && json.format).toBe('json');
    const xml = readDataFile('a.xml', '<a>1</a>');
    expect(xml.ok && xml.format).toBe('xml');
  });

  it('says why a file it does not read was refused', () => {
    const result = readDataFile('a.md', '# title');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem.kind).toBe('unsupported');
  });
});
