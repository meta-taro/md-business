export type ApiSpecStatus = 'draft' | 'review' | 'approved' | 'deprecated';

/** Wire protocol the API speaks. Drives fileName token `{protocol}` and viewer rendering. */
export type ApiSpecProtocol = 'rest' | 'rpc' | 'graphql';

/** Authentication scheme, declared at document root and overridable per endpoint. */
export type ApiSpecAuth = 'none' | 'bearer' | 'apiKey' | 'oauth2' | 'basic';

export type ApiSpecMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'HEAD'
  | 'OPTIONS';

/**
 * Field data type. Markdown-first vocabulary (PdM decision D-α) — deliberately
 * smaller than JSON Schema's, mapped to OpenAPI types only at export time (v0.4.x).
 */
export type ApiSpecFieldType =
  | 'string'
  | 'integer'
  | 'number'
  | 'boolean'
  | 'array'
  | 'object'
  | 'date'
  | 'datetime';

export interface ApiSpecPerson {
  name: string;
  role?: string;
}

export interface ApiSpecField {
  name: string;
  type: ApiSpecFieldType;
  required?: boolean;
  description?: string;
  /**
   * Cross-reference to a db-spec column, format `"<documentNumber>#<table>.<column>"`
   * (e.g. `"DB-2026-001#users.id"`). Ties an API field back to its canonical DB source
   * (PdM decision D-α inline fields + dbRef); never translated, verbatim reference.
   */
  dbRef?: string;
  /** Additional constraint hint as written (e.g. `uuid`, `email`, `int64`). Free-form, verbatim. */
  format?: string;
  /**
   * Element / member shape for `array` and `object` types. One level of nesting only
   * (PdM decision D-α) — deeper structures are split into a referenced schema doc.
   */
  of?: ApiSpecField[];
}

export interface ApiSpecBody {
  /** MIME type as written (e.g. `application/json`, `multipart/form-data`). */
  contentType: string;
  fields: ApiSpecField[];
}

export interface ApiSpecRequest {
  pathParams?: ApiSpecField[];
  queryParams?: ApiSpecField[];
  headers?: ApiSpecField[];
  body?: ApiSpecBody;
}

export interface ApiSpecResponse {
  /** HTTP status code (e.g. 200, 404). */
  status: number;
  description?: string;
  body?: ApiSpecBody;
  /** Reference to an entry in the document-level `errors[]` by its `code`. */
  errorRef?: string;
}

export interface ApiSpecEndpoint {
  /** Stable machine identifier, unique within the document (e.g. `listUsers`). */
  operationId: string;
  method: ApiSpecMethod;
  /** URL template with `{param}` placeholders (e.g. `/users/{id}`). */
  path: string;
  summary?: string;
  tags?: string[];
  /** Per-endpoint auth override; falls back to the document-level `auth` when omitted. */
  auth?: ApiSpecAuth;
  request?: ApiSpecRequest;
  responses: ApiSpecResponse[];
  deprecated?: boolean;
}

/**
 * Reusable error entry, referenced from responses via `errorRef` (mirrors db-spec's
 * migration reference-list pattern — declare once, reference many).
 */
export interface ApiSpecError {
  code: string;
  httpStatus: number;
  message: string;
}

export interface ApiSpec {
  schema: 'api-spec/v1';
  documentNumber: string;
  title: string;
  /** Document version using SemVer triple (e.g. "0.1.0"). */
  version: string;
  /** ISO 8601 YYYY-MM-DD. */
  issueDate: string;
  status: ApiSpecStatus;
  protocol: ApiSpecProtocol;
  auth: ApiSpecAuth;
  /** Base URL the endpoints hang off (e.g. `https://api.example.com/v1`). */
  baseUrl?: string;
  authors: ApiSpecPerson[];
  reviewers?: ApiSpecPerson[];
  relatedDocs?: string[];
  endpoints: ApiSpecEndpoint[];
  errors?: ApiSpecError[];
  theme?: string;
  fileName?: string;
}
