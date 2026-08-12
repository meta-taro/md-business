import investigationSchemaJson from './investigation.schema.json' with { type: 'json' };

export const SCHEMA_VERSION = 'investigation/v1' as const;

export const investigationSchema = investigationSchemaJson as unknown as Record<string, unknown>;
