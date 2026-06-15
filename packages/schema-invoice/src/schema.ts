import invoiceSchemaJson from './invoice.schema.json' with { type: 'json' };

export const invoiceSchema: object = invoiceSchemaJson;
export const SCHEMA_VERSION = 'invoice/v1' as const;
