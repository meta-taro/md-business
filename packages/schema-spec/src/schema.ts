import specSchemaJson from './spec.schema.json' with { type: 'json' };

export const SCHEMA_VERSION = 'spec/v1' as const;

export const specSchema = specSchemaJson as unknown as Record<string, unknown>;
