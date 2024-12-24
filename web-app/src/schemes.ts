import { SchemaManager } from '../../cfds/base/schema.ts';

export const kSchemaTask = {
  ns: 'task',
  version: 1,
  fields: {
    text: {
      type: 'string',
      default: () => '',
    },
  },
} as const;
export type SchemeTypeTask = typeof kSchemaTask;
SchemaManager.default.register(kSchemaTask);
