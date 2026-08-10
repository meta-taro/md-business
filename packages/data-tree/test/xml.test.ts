import { describe, it, expect } from 'vitest';
import { readXmlTree } from '../src/index.js';

describe('readXmlTree', () => {
  it('reads an element with text as a named value', () => {
    const result = readXmlTree('<Amount>1200</Amount>');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.root).toMatchObject({ name: 'Amount', value: '1200', children: [] });
  });

  it('keeps attributes', () => {
    const result = readXmlTree('<Amount currencyID="JPY">1200</Amount>');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.root.attributes).toEqual([{ name: 'currencyID', value: 'JPY' }]);
  });

  it('nests child elements', () => {
    const result = readXmlTree('<Invoice><ID>A-1</ID><Total>500</Total></Invoice>');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.root.children.map((c) => c.name)).toEqual(['ID', 'Total']);
    expect(result.root.children[0]?.value).toBe('A-1');
  });

  it('accepts a self-closing element', () => {
    const result = readXmlTree('<Invoice><Note code="x" /></Invoice>');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.root.children[0]).toMatchObject({ name: 'Note', children: [] });
    expect(result.root.children[0]?.value).toBeUndefined();
  });

  it('reads CDATA as plain text', () => {
    const result = readXmlTree('<Note><![CDATA[a < b & c]]></Note>');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.root.value).toBe('a < b & c');
  });

  it('skips the declaration, comments and processing instructions', () => {
    const result = readXmlTree(
      '<?xml version="1.0"?><!-- note --><?target data?><Invoice><ID>A</ID></Invoice>',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.root.name).toBe('Invoice');
    expect(result.root.children.map((c) => c.name)).toEqual(['ID']);
  });

  it('decodes the predefined entities and numeric character references', () => {
    const result = readXmlTree('<Note a="&quot;q&quot;">&lt;x&gt; &amp; &#65;&#x42;</Note>');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.root.value).toBe('<x> & AB');
    expect(result.root.attributes?.[0]?.value).toBe('"q"');
  });

  it('refuses a document type declaration and says so', () => {
    const result = readXmlTree('<!DOCTYPE Invoice><Invoice/>');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem.kind).toBe('doctype');
    expect(result.problem.message).not.toBe('');
  });

  it('refuses a document that declares an external entity', () => {
    const result = readXmlTree(
      '<!DOCTYPE r [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><r>&xxe;</r>',
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem.kind).toBe('doctype');
  });

  it('refuses an entity reference it cannot resolve rather than dropping it', () => {
    const result = readXmlTree('<r>&xxe;</r>');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem.kind).toBe('entity');
    expect(result.problem.message).toContain('xxe');
  });

  it('refuses nesting past the depth limit', () => {
    const open = '<a>'.repeat(300);
    const close = '</a>'.repeat(300);
    const result = readXmlTree(`${open}x${close}`, { maxDepth: 100 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem.kind).toBe('depth');
  });

  it('refuses more elements than the node limit allows', () => {
    const result = readXmlTree(`<r>${'<a/>'.repeat(40)}</r>`, { maxNodes: 10 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem.kind).toBe('nodes');
  });

  it('refuses input larger than the size limit before parsing it', () => {
    const result = readXmlTree(`<r>${'x'.repeat(200)}</r>`, { maxChars: 100 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem.kind).toBe('size');
  });

  it('reports a mismatched closing tag with the line it is on', () => {
    const result = readXmlTree('<a>\n<b>x</c>\n</a>');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem.kind).toBe('syntax');
    expect(result.problem.line).toBe(2);
  });

  it('reports a tag left open at the end of the document', () => {
    const result = readXmlTree('<a><b>x</b>');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem.kind).toBe('syntax');
  });

  it('refuses a second root element', () => {
    const result = readXmlTree('<a/><b/>');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem.kind).toBe('syntax');
  });

  it('refuses a document with no element at all', () => {
    const result = readXmlTree('<?xml version="1.0"?>');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem.kind).toBe('syntax');
  });

  it('keeps text that sits alongside child elements', () => {
    const result = readXmlTree('<p>before<b>x</b>after</p>');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.root.children.map((c) => c.name)).toEqual(['#text', 'b', '#text']);
    expect(result.root.children[0]?.value).toBe('before');
    expect(result.root.children[2]?.value).toBe('after');
  });

  it('drops the whitespace that only formats the file', () => {
    const result = readXmlTree('<r>\n  <a>1</a>\n  <b>2</b>\n</r>');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.root.children.map((c) => c.name)).toEqual(['a', 'b']);
  });
});
