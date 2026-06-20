import testSpecSchemaJson from './test-spec.schema.json' with { type: 'json' };

export const SCHEMA_VERSION = 'test-spec/v1' as const;

export const testSpecSchema = testSpecSchemaJson as unknown as Record<string, unknown>;
