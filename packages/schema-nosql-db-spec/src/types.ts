export type NosqlDbSpecStatus = 'draft' | 'review' | 'approved' | 'deprecated';

export type NosqlDbSpecEngine =
  | 'firestore'
  | 'dynamodb'
  | 'mongodb'
  | 'cosmosdb'
  | 'redis'
  | 'documentdb'
  | 'turso-document';

/**
 * Engine-agnostic document ID abstraction (PdM decision C-1 / C-5):
 * - `uuid`      — client-generated UUID
 * - `auto`      — engine auto-id (Firestore auto-id, Mongo ObjectId, ...)
 * - `auth-uid`  — authenticated user's uid as document id
 * - `composite` — partition + sort key (DynamoDB style); requires
 *                 `partitionKeyField` as sibling, `sortKeyField` optional
 */
export type DocIdStrategy = 'uuid' | 'auto' | 'auth-uid' | 'composite';

export type NosqlFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'timestamp'
  | 'map'
  | 'array'
  | 'reference'
  | 'geopoint'
  | 'bytes'
  | 'null';

/**
 * Recursive document shape node (PdM decision C-3). `type: array` requires
 * `of`, `type: map` requires `shape` — arbitrarily deep nesting is expressed
 * by recursion, not by a fixed depth limit.
 */
export interface NosqlFieldDef {
  type: NosqlFieldType;
  required?: boolean;
  default?: string | number | boolean;
  enum?: Array<string | number>;
  description?: string;
  /** Element definition when `type === 'array'`. */
  of?: NosqlFieldDef;
  /** Nested field map when `type === 'map'`. */
  shape?: NosqlShape;
}

export type NosqlShape = Record<string, NosqlFieldDef>;

export type NosqlIndexScope = 'collection' | 'collection-group';
export type NosqlIndexMode = 'ASCENDING' | 'DESCENDING';

export interface NosqlIndex {
  fields: string[];
  scope?: NosqlIndexScope;
  mode?: NosqlIndexMode;
}

export interface NosqlTtl {
  field: string;
  enabled?: boolean;
}

export interface NosqlCollection {
  /**
   * Firestore-style path with `{placeholder}` segments as canonical notation
   * (PdM decision C-2), e.g. `users/{userId}/orders`.
   */
  path: string;
  description?: string;
  docIdStrategy: DocIdStrategy;
  /** Required when `docIdStrategy === 'composite'` (DynamoDB partition key). */
  partitionKeyField?: string;
  sortKeyField?: string;
  shape: NosqlShape;
  indexes?: NosqlIndex[];
  ttl?: NosqlTtl;
  /** Escape hatch for engine-specific settings not covered by the common schema. */
  engineSpecific?: Record<string, unknown>;
}

export type SecurityRuleAllow =
  | 'read'
  | 'write'
  | 'get'
  | 'list'
  | 'create'
  | 'update'
  | 'delete';

/** Firestore security rules digest embedded in the design doc (PdM decision C-4). */
export interface NosqlSecurityRule {
  match: string;
  allow: SecurityRuleAllow[];
  if?: string;
}

export interface NosqlDbSpecPerson {
  name: string;
  role?: string;
}

export interface NosqlDbSpec {
  schema: 'nosql-db-spec/v1';
  documentNumber: string;
  title: string;
  /** Document version using SemVer triple (e.g. "0.1.0"). */
  version: string;
  /** ISO 8601 YYYY-MM-DD. */
  issueDate: string;
  status: NosqlDbSpecStatus;
  engine: NosqlDbSpecEngine;
  /** Deployment region/replication label, verbatim (e.g. Firestore `nam5`). */
  multiRegion?: string;
  authors: NosqlDbSpecPerson[];
  reviewers?: NosqlDbSpecPerson[];
  relatedDocs?: string[];
  collections: NosqlCollection[];
  securityRules?: NosqlSecurityRule[];
  theme?: string;
  fileName?: string;
}
