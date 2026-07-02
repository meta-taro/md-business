import dbSpecSchemaJson from './db-spec.schema.json' with { type: 'json' };

export const SCHEMA_VERSION = 'db-spec/v1' as const;

export const dbSpecSchema = dbSpecSchemaJson as unknown as Record<string, unknown>;
