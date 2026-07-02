import nosqlDbSpecSchemaJson from './nosql-db-spec.schema.json' with { type: 'json' };

export const SCHEMA_VERSION = 'nosql-db-spec/v1' as const;

export const nosqlDbSpecSchema = nosqlDbSpecSchemaJson as unknown as Record<string, unknown>;
