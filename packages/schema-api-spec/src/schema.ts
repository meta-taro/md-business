import apiSpecSchemaJson from './api-spec.schema.json' with { type: 'json' };

export const SCHEMA_VERSION = 'api-spec/v1' as const;

export const apiSpecSchema = apiSpecSchemaJson as unknown as Record<string, unknown>;
