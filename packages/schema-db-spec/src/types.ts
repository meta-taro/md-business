export type DbSpecStatus = 'draft' | 'review' | 'approved' | 'deprecated';

export type DbSpecEngine =
  | 'postgres'
  | 'mysql'
  | 'aurora'
  | 'sqlite'
  | 'neon'
  | 'supabase'
  | 'turso'
  | 'cloudsql';

export type ForeignKeyAction = 'cascade' | 'restrict' | 'set_null' | 'no_action';

/** Postgres index access methods. Other engines ignore unsupported values at DDL-generation time. */
export type IndexUsing = 'btree' | 'gin' | 'gist' | 'hash' | 'brin';

export interface DbSpecPerson {
  name: string;
  role?: string;
}

export interface DbSpecForeignKey {
  table: string;
  column: string;
  onDelete?: ForeignKeyAction;
  onUpdate?: ForeignKeyAction;
}

export interface DbSpecColumn {
  name: string;
  /**
   * Engine-native type expression, verbatim (e.g. `varchar(255)`, `timestamptz`,
   * `numeric(12,2)`). Strict SQL-like notation is canonical (PdM decision B-2);
   * synonym absorption (`文字列` etc.) happens in the normalize layer, not here.
   */
  type: string;
  pk?: boolean;
  nullable?: boolean;
  unique?: boolean;
  /** SQL default expression as written in DDL (e.g. `now()`), or a literal. */
  default?: string | number | boolean;
  fk?: DbSpecForeignKey;
}

export interface DbSpecIndex {
  name: string;
  columns: string[];
  unique?: boolean;
  using?: IndexUsing;
}

export interface DbSpecTrigger {
  name: string;
  /** Trigger timing + event as written in DDL (e.g. `BEFORE UPDATE`). */
  on: string;
  action: string;
}

export interface DbSpecTable {
  name: string;
  description?: string;
  columns: DbSpecColumn[];
  indexes?: DbSpecIndex[];
  triggers?: DbSpecTrigger[];
}

/**
 * Reference entry to an existing migration file. The real SQL lives in the
 * repository's migrations directory (PdM decision B-5 — reference list only,
 * embedding SQL here would bloat the Markdown).
 */
export interface DbSpecMigration {
  id: string;
  description?: string;
}

export interface DbSpec {
  schema: 'db-spec/v1';
  documentNumber: string;
  title: string;
  /** Document version using SemVer triple (e.g. "0.1.0"). */
  version: string;
  /** ISO 8601 YYYY-MM-DD. */
  issueDate: string;
  status: DbSpecStatus;
  engine: DbSpecEngine;
  charset?: string;
  collation?: string;
  authors: DbSpecPerson[];
  reviewers?: DbSpecPerson[];
  relatedDocs?: string[];
  tables: DbSpecTable[];
  migrations?: DbSpecMigration[];
  theme?: string;
  fileName?: string;
}
