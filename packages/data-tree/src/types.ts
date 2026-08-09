/** The data formats this package reads. Neither is a source of truth — both are
 * read so their contents can be shown next to the Markdown and TSV that are. */
export type DataFormat = 'json' | 'xml';

/** What kind of JSON value a leaf held. XML has no types, so XML leaves omit it. */
export type DataValueType = 'string' | 'number' | 'boolean' | 'null';

export interface DataAttribute {
  name: string;
  value: string;
}

/**
 * One row of the displayed tree.
 *
 * A node either has children or a value, never both: an element whose only
 * content is text is folded into `value` so the common case reads as one row
 * rather than two. Text that sits alongside sibling elements keeps its own node
 * (named `#text`), because collapsing it would reorder the document.
 */
export interface DataTreeNode {
  /** Object key, array position, XML element name, or `#text`. Empty at a JSON root. */
  name: string;
  /** Leaf content. Absent when the node has children, and when an element is empty. */
  value?: string;
  valueType?: DataValueType;
  /** XML attributes in document order. Absent for JSON and for elements with none. */
  attributes?: DataAttribute[];
  children: DataTreeNode[];
}

/**
 * Why a file was not read.
 *
 * Every refusal names its cause. A reader that returned an empty tree for a
 * file it refused would be indistinguishable from one that read an empty file,
 * and the difference matters most exactly when the input is hostile.
 */
export type DataProblemKind =
  /** Larger than the accepted size, refused before parsing. */
  | 'size'
  /** Malformed input. */
  | 'syntax'
  /** Nested deeper than the accepted limit. */
  | 'depth'
  /** Describes more values than the accepted limit. */
  | 'nodes'
  /** Carries a document type declaration, which is not read at all. */
  | 'doctype'
  /** References an entity that cannot be resolved without reading a DTD. */
  | 'entity'
  /** Not a format this package reads. */
  | 'unsupported';

export interface DataProblem {
  kind: DataProblemKind;
  /** Reason to show the reader, in one sentence. */
  message: string;
  /** 1-based line the input was refused at, when the reader knows it. */
  line?: number;
}

export type ReadDataResult =
  | { ok: true; format: DataFormat; root: DataTreeNode }
  | { ok: false; format: DataFormat | null; problem: DataProblem };
