import { BaseLogEntry } from './entry.ts';

export type ServerEvent = 'TempLoginTokenSent';

export interface ServerEventEntry extends BaseLogEntry {
  severity: 'EVENT';
  event: ServerEvent;
  userId?: string;
}
